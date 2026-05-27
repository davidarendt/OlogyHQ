'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const nodemailer = require('nodemailer');
const jwt        = require('jsonwebtoken');
const pool       = require('./db');

const WEEKLY_SHEET_ID  = '1Pk-ij63R4X5-X-7OVBgq8PKAsZ6DB51SzlHanPRplqk';
const WEEKLY_SCHED_TAB = 'Brew/Production Schedule';
const WEEKLY_DAYS      = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];

async function getGoogleAccessToken() {
  const privateKey  = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  if (!privateKey || !clientEmail) throw new Error('Google service account credentials not configured');
  const now = Math.floor(Date.now() / 1000);
  const assertion = jwt.sign(
    { iss: clientEmail, scope: 'https://www.googleapis.com/auth/spreadsheets',
      aud: 'https://oauth2.googleapis.com/token', exp: now + 3600, iat: now },
    privateKey, { algorithm: 'RS256' }
  );
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Token error: ${JSON.stringify(data)}`);
  return data.access_token;
}

function sheetSerialToYMD(serial) {
  if (typeof serial !== 'number') return null;
  const d = new Date(Date.UTC(1899, 11, 30) + Math.round(serial) * 86400000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

async function parseSheet(weekOffset = 0) {
  const token = await getGoogleAccessToken();
  const range  = encodeURIComponent(`'${WEEKLY_SCHED_TAB}'!A1:BH`);
  const url    = `https://sheets.googleapis.com/v4/spreadsheets/${WEEKLY_SHEET_ID}/values/${range}?valueRenderOption=UNFORMATTED_VALUE`;
  const resp   = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!resp.ok) throw new Error(`Sheets API error: ${resp.status}`);
  const rows = (await resp.json()).values || [];
  if (rows.length < 2) return { weekStart: null, sections: [], people: [], weekDates: [] };

  const headerRow  = rows[0] || [];
  const tankHeaders = {};
  for (let ci = 3; ci <= 20; ci++) tankHeaders[ci] = headerRow[ci] ? String(headerRow[ci]).trim() : '';

  const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
  const now         = new Date();
  const todayUTC    = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const dow         = new Date(todayUTC).getUTCDay();
  const mondayUTC   = todayUTC + (dow === 0 ? -6 : 1 - dow) * 86400000 + weekOffset * 7 * 86400000;
  const weekSerials = Array.from({ length: 5 }, (_, i) =>
    Math.round((mondayUTC + i * 86400000 - EXCEL_EPOCH) / 86400000)
  );
  const weekStart  = sheetSerialToYMD(weekSerials[0]);
  const weekDates  = weekSerials.map(s => sheetSerialToYMD(s));

  const dayRowBySerial = {};
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const serial = row[1];
    if (typeof serial === 'number') {
      const s = Math.floor(serial);
      if (weekSerials.includes(s)) dayRowBySerial[s] = row;
    }
  }

  const brewDayTasks = {}, packDayTasks = {}, timeoffDayTasks = {};
  WEEKLY_DAYS.forEach(d => { brewDayTasks[d] = []; packDayTasks[d] = []; timeoffDayTasks[d] = []; });
  const personMap = {};

  weekSerials.forEach((serial, dayIdx) => {
    const day = WEEKLY_DAYS[dayIdx];
    const row = dayRowBySerial[serial];
    if (!row) return;

    for (let ci = 3; ci <= 20; ci++) {
      const text = row[ci] ? String(row[ci]).trim() : '';
      if (!text) continue;
      const tank = tankHeaders[ci];
      if (/brew\s*$/i.test(text)) {
        const m = text.match(/^(.*?)\s*(?:-\s*)?brew\s*$/i);
        const name = m ? m[1].trim() : text;
        if (name) brewDayTasks[day].push(tank ? `[${tank}] ${name}` : name);
      } else if (/pack\s*$/i.test(text)) {
        const m = text.match(/^(.*?)\s*(?:-\s*)?pack\s*$/i);
        const name = m ? m[1].trim() : text;
        if (name) packDayTasks[day].push(tank ? `[${tank}] ${name}` : name);
      }
    }

    const timeoff = row[28];
    if (timeoff && String(timeoff).trim()) timeoffDayTasks[day].push(String(timeoff).trim());

    for (let ci = 51; ci <= 59; ci++) {
      const text = row[ci] ? String(row[ci]).trim() : '';
      if (!text) continue;
      const im = text.match(/\(([^)]+)\)\s*$/);
      if (!im) continue;
      im[1].split(',').map(s => s.trim()).filter(Boolean).forEach(initial => {
        if (!personMap[initial]) personMap[initial] = {};
        if (!personMap[initial][day]) personMap[initial][day] = [];
        personMap[initial][day].push(text);
      });
    }
  });

  const sections = [
    { key: 'brews',     dayTasks: brewDayTasks     },
    { key: 'packaging', dayTasks: packDayTasks     },
    { key: 'timeoff',   dayTasks: timeoffDayTasks  },
  ];
  const people = Object.entries(personMap).map(([initial, byDay]) => {
    const dayTasks = {};
    WEEKLY_DAYS.forEach(d => { dayTasks[d] = byDay[d] || []; });
    return { initial, dayTasks };
  });

  return { weekStart, sections, people, weekDates };
}

function formatDayLabel(weekStart, day) {
  const offset = WEEKLY_DAYS.indexOf(day);
  if (offset === -1 || !weekStart) return day;
  const [y, m, d] = weekStart.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + offset));
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

async function findIncompleteTasks() {
  const now      = new Date();
  const todayYMD = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;

  const initialsRows = await pool.query(
    'SELECT initials, display_name, email FROM prod_weekly_initials ORDER BY sort_order ASC'
  );
  const nameByInitial = {};
  const emailByName   = {};
  for (const r of initialsRows.rows) {
    nameByInitial[r.initials] = r.display_name;
    if (r.email) emailByName[r.display_name] = r.email;
  }

  const incomplete = [];

  for (let weekOff = 0; weekOff >= -3; weekOff--) {
    const { weekStart, sections, people, weekDates } = await parseSheet(weekOff);
    if (!weekStart) continue;

    const { rows: checkRows } = await pool.query(
      'SELECT row_type, row_key, day, task_text FROM prod_weekly_checks WHERE week_start=$1',
      [weekStart]
    );
    const checked = new Set(checkRows.map(c => `${c.row_type}|${c.row_key}|${c.day || ''}|${c.task_text}`));

    WEEKLY_DAYS.forEach((day, dayIdx) => {
      if (!weekDates[dayIdx] || weekDates[dayIdx] >= todayYMD) return;
      const dateLabel = formatDayLabel(weekStart, day);

      for (const sec of sections) {
        for (const task of (sec.dayTasks[day] || [])) {
          if (!checked.has(`section|${sec.key}|${day}|${task}`)) {
            incomplete.push({ type: 'section', sectionKey: sec.key, day, weekStart, dateLabel, task });
          }
        }
      }

      for (const person of people) {
        const displayName = nameByInitial[person.initial] || person.initial;
        for (const task of (person.dayTasks[day] || [])) {
          if (!checked.has(`person|${displayName}|${day}|${task}`)) {
            incomplete.push({
              type: 'person', initial: person.initial, displayName,
              email: emailByName[displayName] || null,
              day, weekStart, dateLabel, task,
            });
          }
        }
      }
    });
  }

  return incomplete;
}

function buildEmailBody(incomplete, personFilter) {
  const sectionItems = incomplete.filter(i => i.type === 'section');
  const personItems  = incomplete.filter(i => i.type === 'person' && (!personFilter || i.displayName === personFilter));
  const total        = sectionItems.length + personItems.length;

  let body = 'Good morning,\n\n';
  if (personFilter) {
    body += `You have ${total} incomplete task${total !== 1 ? 's' : ''} from the production schedule:\n`;
  } else {
    body += `The following ${total} task${total !== 1 ? 's' : ''} have not been completed:\n`;
  }

  if (!personFilter) {
    for (const [key, label] of [['brews', 'BREWS'], ['packaging', 'PACKAGING'], ['timeoff', 'TIME OFF']]) {
      const these = sectionItems.filter(i => i.sectionKey === key);
      if (!these.length) continue;
      body += `\n${label}\n`;
      for (const i of these) body += `• ${i.task} — ${i.dateLabel}\n`;
    }
  }

  if (personItems.length > 0) {
    if (!personFilter) body += '\nINDIVIDUAL TASKS\n';
    const byPerson = {};
    for (const i of personItems) {
      if (!byPerson[i.displayName]) byPerson[i.displayName] = [];
      byPerson[i.displayName].push(i);
    }
    for (const [name, items] of Object.entries(byPerson)) {
      if (!personFilter) body += `\n${name}:\n`;
      for (const i of items) body += `• ${i.task} — ${i.dateLabel}\n`;
    }
  }

  body += '\n—\nOlogy HQ Production Weekly';
  return body;
}

async function sendDailyProdWeeklyReminder() {
  const incomplete = await findIncompleteTasks();
  if (!incomplete.length) return { sent: 0, message: 'No incomplete tasks — no email sent.' };

  const { rows: recipRows } = await pool.query(
    'SELECT email FROM prod_weekly_notification_recipients WHERE active=true ORDER BY sort_order ASC'
  );
  const globalEmails = recipRows.map(r => r.email).filter(Boolean);
  const globalSet    = new Set(globalEmails.map(e => e.toLowerCase()));

  const mailer  = nodemailer.createTransport({
    host: 'smtp.gmail.com', port: 465, secure: true,
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });
  const subject = `Production Weekly — ${incomplete.length} incomplete task${incomplete.length !== 1 ? 's' : ''}`;
  let sent = 0;

  if (globalEmails.length) {
    await mailer.sendMail({
      from: process.env.EMAIL_USER, to: globalEmails.join(','),
      subject, text: buildEmailBody(incomplete),
    });
    sent++;
  }

  // Collect unique (displayName, email) pairs for people who have emails set
  const personEmailMap = {};
  for (const item of incomplete) {
    if (item.type === 'person' && item.email && !personEmailMap[item.email.toLowerCase()]) {
      personEmailMap[item.email.toLowerCase()] = { name: item.displayName, email: item.email };
    }
  }
  for (const { name, email } of Object.values(personEmailMap)) {
    if (globalSet.has(email.toLowerCase())) continue;
    const myItems = incomplete.filter(i => i.type === 'person' && i.displayName === name);
    if (!myItems.length) continue;
    await mailer.sendMail({
      from: process.env.EMAIL_USER, to: email,
      subject, text: buildEmailBody(incomplete, name),
    });
    sent++;
  }

  return { sent, incomplete: incomplete.length };
}

module.exports = { sendDailyProdWeeklyReminder };
