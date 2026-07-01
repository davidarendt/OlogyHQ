const nodemailer = require('nodemailer');
const pool = require('./db');

const LOCATION_LABELS = {
  midtown: 'Midtown',
  northside: 'Northside',
  power_mill: 'Power Mill',
  tampa: 'Tampa',
};

function fmtQty(n) {
  const v = parseFloat(n);
  if (!isFinite(v)) return '0';
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

// Build the rows that would be ordered for a given location + week.
// Precedence for the "needed" quantity:
//   1. per-send `overrides` map (transient, from the Send modal)
//   2. persisted per-week override in spirits_order_overrides
//   3. par - count (default recommendation)
async function buildOrderRows(location, week_start, overrides = {}) {
  const itemsRes = await pool.query(
    `SELECT i.id, i.name, i.category, i.unit_size, i.production_quantity, i.hidden,
            p.par_level,
            c.display_qty, c.storage_qty,
            o.order_override,
            o.set_by_name AS override_by
     FROM spirits_items i
     LEFT JOIN spirits_pars p ON p.item_id = i.id AND p.location = $1
     LEFT JOIN spirits_counts c ON c.item_id = i.id AND c.location = $1 AND c.week_start = $2
     LEFT JOIN spirits_order_overrides o ON o.item_id = i.id AND o.location = $1 AND o.week_start = $2
     WHERE i.hidden = false
     ORDER BY i.sort_order, LOWER(i.name)`,
    [location, week_start]
  );

  return itemsRes.rows.map(r => {
    const par = parseFloat(r.par_level) || 0;
    const display = parseFloat(r.display_qty) || 0;
    const storage = parseFloat(r.storage_qty) || 0;
    const count = display + storage;
    const persistedOverride = r.order_override != null ? parseFloat(r.order_override) : null;
    const defaultNeeded = persistedOverride != null
      ? Math.max(0, persistedOverride)
      : Math.max(0, par - count);
    const sendOverride = overrides[r.id];
    const needed = sendOverride !== undefined && sendOverride !== null && sendOverride !== ''
      ? Math.max(0, parseFloat(sendOverride) || 0)
      : defaultNeeded;
    return {
      id: r.id,
      name: r.name,
      category: r.category,
      unit_size: r.unit_size,
      production_quantity: r.production_quantity != null ? parseFloat(r.production_quantity) : null,
      par,
      display,
      storage,
      count,
      needed,
      override: persistedOverride,
      override_by: r.override_by || null,
    };
  });
}

async function sendSpiritsOrderEmail({ location, week_start, overrides = {}, sender = null }) {
  const recipientsRes = await pool.query('SELECT email FROM spirits_email_recipients ORDER BY email');
  const to = recipientsRes.rows.map(r => r.email).join(',');
  if (!to) throw new Error('No email recipients configured.');

  const rows = await buildOrderRows(location, week_start, overrides);
  const ordered = rows.filter(r => r.needed > 0);

  const locLabel = LOCATION_LABELS[location] || location;
  const subject = `Spirits Order — ${locLabel} — week of ${week_start}`;

  const lines = [];
  lines.push(`Spirits order request for ${locLabel} — week of ${week_start}.`);
  lines.push('');
  if (ordered.length === 0) {
    lines.push('No items need to be ordered this week.');
  } else {
    lines.push('Please prepare the following:');
    lines.push('');
    for (const r of ordered) {
      const size = r.unit_size ? ` (${r.unit_size})` : '';
      const avail = r.production_quantity != null
        ? ` — available in production: ${fmtQty(r.production_quantity)}`
        : '';
      lines.push(`• ${r.name}${size} — ${fmtQty(r.needed)}${avail}`);
    }
  }
  lines.push('');
  if (sender?.name) lines.push(`Submitted by: ${sender.name}`);
  lines.push('Thanks,');
  lines.push('Ology HQ');
  const body = lines.join('\n');

  const mailer = nodemailer.createTransport({
    host: 'smtp.gmail.com', port: 465, secure: true,
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });

  await mailer.sendMail({ from: process.env.EMAIL_USER, to, subject, text: body });

  await pool.query(
    `INSERT INTO spirits_order_log (location, week_start, sent_to, sent_by_id, sent_by_name, body)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [location, week_start, to, sender?.id || null, sender?.name || null, body]
  );
  await pool.query(`UPDATE spirits_settings SET last_sent_at = NOW() WHERE id = 1`);

  return { to, subject, body, rows: ordered };
}

module.exports = { sendSpiritsOrderEmail, buildOrderRows, LOCATION_LABELS };
