const nodemailer = require('nodemailer');
const pool = require('./db');

async function sendLabelOrderEmail(overrides = {}) {
  const labels = await pool.query('SELECT * FROM label_inventory ORDER BY sort_order ASC');
  const emails = await pool.query('SELECT email FROM label_email_list');
  const to = emails.rows.map(r => r.email).join(',');
  if (!to) throw new Error('No email recipients configured.');

  const orderItems = labels.rows
    .map(l => {
      const currentInv   = parseFloat(l.num_rolls) * parseInt(l.labels_per_roll);
      const needsReorder = currentInv < parseInt(l.low_par);
      const defaultAmt   = needsReorder ? Math.max(0, parseInt(l.high_par) - currentInv) : 0;
      const qty          = overrides[l.id] !== undefined ? parseInt(overrides[l.id]) : defaultAmt;
      return (needsReorder || overrides[l.id] !== undefined) && qty > 0
        ? `${l.name} - ${qty.toLocaleString()} Labels`
        : null;
    })
    .filter(Boolean);

  const body = orderItems.length === 0
    ? 'We are good this week.'
    : `This week we need to order the following:\n\n${orderItems.join('\n')}\n\nThanks,`;

  const mailer = nodemailer.createTransport({
    host: 'smtp.gmail.com', port: 465, secure: true,
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });

  await mailer.sendMail({ from: process.env.EMAIL_USER, to, subject: 'Core Label Order', text: body });
}

async function sendLabelReminder() {
  const mailer = nodemailer.createTransport({
    host: 'smtp.gmail.com', port: 465, secure: true,
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  });
  await mailer.sendMail({
    from: process.env.EMAIL_USER,
    to: 'david@ologybrewing.com',
    subject: 'Label Inventory — Needs Attention',
    text: "Hey David,\n\nIt's been over 7 days since the last label order email was sent. Please review the label counts and send the order when you get a chance.\n\nOlogy HQ",
  });
}

module.exports = { sendLabelOrderEmail, sendLabelReminder };
