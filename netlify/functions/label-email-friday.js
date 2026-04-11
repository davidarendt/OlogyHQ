// Runs every Friday at 8:00 AM ET (12:00 UTC, adjusted for EDT)
// Only sends if label inventory hasn't been updated since Thursday 2pm ET
require('dotenv').config({ path: require('path').join(__dirname, '../../server/.env') });
const pool = require('../../server/db');
const { sendLabelOrderEmail } = require('../../server/labelEmail');

exports.handler = async () => {
  console.log('[scheduled] Friday label reminder check');
  try {
    const result = await pool.query('SELECT MAX(updated_at) AS last FROM label_inventory');
    const lastUpdated = new Date(result.rows[0].last);
    const now = new Date();
    const thursday2pm = new Date(now);
    thursday2pm.setDate(now.getDate() - 1); // yesterday = Thursday
    thursday2pm.setUTCHours(18, 0, 0, 0);  // 2pm ET = 18:00 UTC (EDT)
    if (lastUpdated < thursday2pm) {
      console.log('[scheduled] Not updated since Thursday — sending reminder');
      await sendLabelOrderEmail();
    } else {
      console.log('[scheduled] Updated since Thursday — skipping');
    }
  } catch (err) {
    console.error('[scheduled] Failed:', err.message);
  }
  return { statusCode: 200 };
};
