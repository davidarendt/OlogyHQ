// Runs daily at 12:00 UTC (8:00 AM ET).
// Sends a reminder to david@ologybrewing.com if no label order email has been
// sent in the last 7 days. Fires only once per overdue period.
require('dotenv').config({ path: require('path').join(__dirname, '../../server/.env') });
const pool = require('../../server/db');
const { sendLabelReminder } = require('../../server/labelEmail');

exports.handler = async () => {
  console.log('[scheduled] Label reminder check');
  try {
    const r = await pool.query(
      'SELECT last_order_sent_at, last_reminder_sent_at FROM label_order_settings WHERE id=1'
    );
    const { last_order_sent_at, last_reminder_sent_at } = r.rows[0] || {};

    if (!last_order_sent_at) {
      console.log('[scheduled] No order email on record — skipping');
      return { statusCode: 200 };
    }

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const overdue      = new Date(last_order_sent_at) < sevenDaysAgo;
    const notReminded  = !last_reminder_sent_at || new Date(last_reminder_sent_at) < new Date(last_order_sent_at);

    if (overdue && notReminded) {
      await sendLabelReminder();
      await pool.query('UPDATE label_order_settings SET last_reminder_sent_at=NOW() WHERE id=1');
      console.log('[scheduled] Reminder sent to david@ologybrewing.com');
    } else {
      console.log('[scheduled] No reminder needed');
    }
  } catch (err) {
    console.error('[scheduled] Failed:', err.message);
  }
  return { statusCode: 200 };
};
