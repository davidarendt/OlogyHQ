// Runs every hour. Sends checklist completion reminder emails when the
// current Eastern Time hour matches the configured send_hour.
require('dotenv').config({ path: require('path').join(__dirname, '../../server/.env') });
const pool = require('../../server/db');
const nodemailer = require('nodemailer');

function getETInfo() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', hour12: false,
  }).formatToParts(now);
  const get = type => parts.find(p => p.type === type)?.value;
  const hour = parseInt(get('hour'));
  return {
    todayET: `${get('year')}-${get('month')}-${get('day')}`,
    currentHourET: hour === 24 ? 0 : hour,
  };
}

exports.handler = async () => {
  console.log('[scheduled] Checklist notification check');
  try {
    const { rows: [config] } = await pool.query(
      'SELECT send_hour, last_sent_date FROM checklist_notification_config WHERE id = 1'
    );
    if (!config) return { statusCode: 200 };

    const { todayET, currentHourET } = getETInfo();

    if (currentHourET !== config.send_hour) {
      console.log(`[scheduled] Not time yet (current ET hour: ${currentHourET}, configured: ${config.send_hour})`);
      return { statusCode: 200 };
    }
    if (config.last_sent_date === todayET) {
      console.log('[scheduled] Already sent today');
      return { statusCode: 200 };
    }

    // Get all subscriptions with today's completion data
    const { rows: subs } = await pool.query(`
      SELECT
        s.user_id, s.threshold,
        u.email, u.name AS user_name,
        c.id AS checklist_id, c.name AS checklist_name,
        COUNT(DISTINCT ci.id)::int AS total_items,
        COUNT(DISTINCT cds.item_id)::int AS checked_items
      FROM checklist_notification_subscriptions s
      JOIN users u ON u.id = s.user_id
      JOIN checklists c ON c.id = s.checklist_id
      LEFT JOIN checklist_items ci ON ci.checklist_id = c.id
      LEFT JOIN checklist_daily_state cds
        ON cds.checklist_id = c.id
        AND cds.item_id = ci.id
        AND cds.run_date = $1
      GROUP BY s.user_id, s.threshold, u.email, u.name, c.id, c.name
    `, [todayET]);

    // Group by user, collect checklists that meet the threshold
    const byUser = {};
    for (const sub of subs) {
      const incomplete = sub.total_items - sub.checked_items;
      if (incomplete < sub.threshold) continue;
      if (!byUser[sub.user_id]) {
        byUser[sub.user_id] = { email: sub.email, name: sub.user_name, items: [] };
      }
      byUser[sub.user_id].items.push({
        name: sub.checklist_name,
        total: sub.total_items,
        checked: sub.checked_items,
        incomplete,
      });
    }

    await pool.query(
      'UPDATE checklist_notification_config SET last_sent_date = $1 WHERE id = 1',
      [todayET]
    );

    if (Object.keys(byUser).length === 0) {
      console.log('[scheduled] No notifications to send');
      return { statusCode: 200 };
    }

    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com', port: 465, secure: true,
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    });

    for (const user of Object.values(byUser)) {
      const listRows = user.items.map(item => `
        <tr>
          <td style="padding:10px 14px;border-bottom:1px solid #374151;color:#f9fafb;">${item.name}</td>
          <td style="padding:10px 14px;border-bottom:1px solid #374151;text-align:center;color:#F05A28;font-weight:bold;">${item.incomplete} incomplete</td>
          <td style="padding:10px 14px;border-bottom:1px solid #374151;text-align:center;color:#9ca3af;">${item.checked}/${item.total}</td>
        </tr>`).join('');

      const html = `
        <div style="background:#111827;color:#f9fafb;font-family:sans-serif;padding:32px;max-width:600px;margin:0 auto;border-radius:12px;">
          <div style="margin-bottom:24px;">
            <span style="color:#F05A28;font-size:24px;font-weight:bold;">OLOGY</span>
            <span style="color:#F2EDE4;font-size:20px;font-weight:600;margin-left:6px;">HQ</span>
          </div>
          <h2 style="color:#F2EDE4;margin:0 0 6px;">Checklist Reminder</h2>
          <p style="color:#9ca3af;margin:0 0 24px;">
            Hi ${user.name} — the following checklists have incomplete items as of tonight.
          </p>
          <table style="width:100%;border-collapse:collapse;background:#1f2937;border-radius:8px;overflow:hidden;">
            <thead>
              <tr style="background:#374151;">
                <th style="padding:10px 14px;text-align:left;color:#9ca3af;font-size:12px;text-transform:uppercase;letter-spacing:.05em;">Checklist</th>
                <th style="padding:10px 14px;text-align:center;color:#9ca3af;font-size:12px;text-transform:uppercase;letter-spacing:.05em;">Outstanding</th>
                <th style="padding:10px 14px;text-align:center;color:#9ca3af;font-size:12px;text-transform:uppercase;letter-spacing:.05em;">Progress</th>
              </tr>
            </thead>
            <tbody>${listRows}</tbody>
          </table>
          <p style="color:#6b7280;font-size:12px;margin-top:24px;line-height:1.6;">
            Manage your notification preferences in Ology HQ → Checklists → Manage → Notification Settings.
          </p>
        </div>`;

      await transporter.sendMail({
        from: `"Ology HQ" <${process.env.EMAIL_USER}>`,
        to: user.email,
        subject: `Checklist Reminder: ${user.items.length} list${user.items.length > 1 ? 's' : ''} need${user.items.length > 1 ? '' : 's'} attention`,
        html,
      });
      console.log(`[scheduled] Sent to ${user.email} (${user.items.length} checklist(s))`);
    }
  } catch (err) {
    console.error('[scheduled] Checklist notifications failed:', err.message);
  }
  return { statusCode: 200 };
};
