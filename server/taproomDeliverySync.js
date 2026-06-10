const pdfParse = require('pdf-parse');
const pool = require('./db');

const DELIVERY_LOCATIONS = {
  'Midtown':    'midtown',
  'Power Mill': 'power_mill',
  'Northside':  'northside',
  'Tampa':      'tampa',
};

const INVOICE_LOG_CSV_URL = 'https://docs.google.com/spreadsheets/d/1Teo4JcdQRY8mmnUZOcS3NTZIIhhwWj6YoqFom6tqp6E/gviz/tq?tqx=out:csv&sheet=Invoice%20Log';

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === ',' && !inQuotes) {
      result.push(current); current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

function parseSheetDate(raw) {
  if (!raw) return null;
  if (raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)) return raw;
  const mdy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (mdy) {
    const [, mo, day, yr] = mdy;
    const year = yr.length === 2 ? `20${yr}` : yr;
    return `${year}-${mo.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  return null;
}

async function parseTaproomDeliveryPDF(buffer) {
  const data = await pdfParse(buffer);
  const text = data.text;

  let location = null, locationLabel = null;
  const sendToMatch = text.match(/Send To\s*[\r\n]+\s*(.+)/);
  if (sendToMatch) {
    const candidate = sendToMatch[1].trim();
    for (const [label, id] of Object.entries(DELIVERY_LOCATIONS)) {
      if (candidate.toLowerCase().includes(label.toLowerCase())) {
        location = id; locationLabel = label; break;
      }
    }
  }
  if (!location) {
    for (const [label, id] of Object.entries(DELIVERY_LOCATIONS)) {
      if (text.includes(`Send To ${label}`)) { location = id; locationLabel = label; break; }
    }
  }

  const invoiceMatch = text.match(/(\d{4,}[A-Z]+)/);
  const invoiceNumber = invoiceMatch?.[1] || null;

  const dateMatch = text.match(/DATE\s+(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  let deliveryDate = null;
  if (dateMatch) {
    const [, mo, day, yr] = dateMatch;
    const year = yr.length === 2 ? `20${yr}` : yr;
    deliveryDate = `${year}-${mo.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }

  const headerIdx = text.indexOf('BeerFormatQtyNotes');
  if (headerIdx === -1) throw new Error('Could not find item table in PDF — unexpected format');

  const afterHeader = text.slice(headerIdx + 'BeerFormatQtyNotes'.length);
  const rawLines = afterHeader.split('\n').map(l => l.trim()).filter(Boolean);

  const beersResult = await pool.query('SELECT id, name FROM taproom_beers ORDER BY LENGTH(name) DESC');
  const knownBeers  = beersResult.rows;

  const itemLineRe = /^([\s\S]+?)(Case|1\/6bbl|1\/2bbl)(\d+(?:\.\d+)?)(.*)$/;
  const items = [];
  for (const line of rawLines) {
    const m = line.match(itemLineRe);
    if (!m) continue;
    const rawPrefix = m[1].trim();
    const format    = m[2];
    const qty       = parseFloat(m[3]) || 0;
    let matchedBeer = null;
    for (const beer of knownBeers) {
      const escaped = beer.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(escaped, 'i').test(rawPrefix)) { matchedBeer = beer; break; }
    }
    items.push({
      beer_id:   matchedBeer?.id   || null,
      beer_name: matchedBeer?.name || rawPrefix,
      format,
      quantity:  qty,
      cases:     format === 'Case'    ? qty : 0,
      sixth_bbl: format === '1/6bbl' ? qty : 0,
      half_bbl:  format === '1/2bbl' ? qty : 0,
    });
  }

  if (items.length === 0) throw new Error('No line items found in PDF');
  return { location, locationLabel, invoiceNumber, deliveryDate, items };
}

async function saveTaproomDelivery({ location, invoiceNumber, deliveryDate, items, submittedById, submittedByName, notes }) {
  if (!location) return 'no_location';
  if (invoiceNumber) {
    const dup = await pool.query('SELECT id FROM taproom_deliveries WHERE invoice_number = $1', [invoiceNumber]);
    if (dup.rows.length > 0) return 'duplicate';
  }
  const delivRes = await pool.query(
    `INSERT INTO taproom_deliveries (location, delivery_date, invoice_number, submitted_by_id, submitted_by_name, notes)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [location, deliveryDate, invoiceNumber || null, submittedById, submittedByName, notes || null]
  );
  const deliveryId = delivRes.rows[0].id;
  for (const item of items) {
    await pool.query(
      `INSERT INTO taproom_delivery_items (delivery_id, beer_id, beer_name, cases, sixth_bbl, half_bbl)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [deliveryId, item.beer_id || null, item.beer_name, item.cases || 0, item.sixth_bbl || 0, item.half_bbl || 0]
    );
  }
  return 'saved';
}

async function syncDeliveriesFromSheet(fromDate, toDate) {
  const response = await fetch(INVOICE_LOG_CSV_URL);
  const csv = await response.text();
  const lines = csv.split('\n').filter(l => l.trim());

  const results = { imported: 0, skipped: 0, failed: [], noLocation: 0 };

  for (const line of lines.slice(1)) {
    const cols      = parseCSVLine(line);
    const rawDate   = (cols[2] || '').trim();
    const recipient = (cols[3] || '').trim();
    const pdfUrl    = (cols[8] || '').trim();
    const rowUuid   = (cols[9] || '').trim();

    if (!rawDate || !pdfUrl) continue;

    const rowDate = parseSheetDate(rawDate);
    if (!rowDate) continue;
    if (rowDate < fromDate || rowDate > toDate) continue;

    let matchedLocation = null;
    for (const [label] of Object.entries(DELIVERY_LOCATIONS)) {
      if (recipient.toLowerCase().includes(label.toLowerCase())) { matchedLocation = label; break; }
    }
    if (!matchedLocation) continue;

    const uniqueKey = rowUuid || null;

    const driveMatch = pdfUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (!driveMatch) continue;
    const fileId = driveMatch[1];
    const downloadUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&authuser=0`;

    try {
      const pdfRes = await fetch(downloadUrl);
      if (!pdfRes.ok) throw new Error(`HTTP ${pdfRes.status}`);
      const buffer = Buffer.from(await pdfRes.arrayBuffer());
      const parsed = await parseTaproomDeliveryPDF(buffer);

      const status = await saveTaproomDelivery({
        ...parsed,
        invoiceNumber:   uniqueKey,
        deliveryDate:    parsed.deliveryDate || rowDate,
        submittedById:   null,
        submittedByName: 'Auto-sync',
        notes:           null,
      });

      if (status === 'saved')            results.imported++;
      else if (status === 'duplicate')   results.skipped++;
      else if (status === 'no_location') results.noLocation++;
    } catch (err) {
      results.failed.push({ invoiceNumber: rowUuid || recipient, error: err.message });
    }
  }
  return results;
}

module.exports = { DELIVERY_LOCATIONS, parseTaproomDeliveryPDF, saveTaproomDelivery, syncDeliveriesFromSheet };
