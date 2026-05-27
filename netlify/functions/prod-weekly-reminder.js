// Runs Mon–Fri at 12:00 UTC (≈ 7 am ET).
// Sends an email listing all unchecked Production Weekly tasks from prior days.
require('dotenv').config({ path: require('path').join(__dirname, '../../server/.env') });
const { sendDailyProdWeeklyReminder } = require('../../server/prodWeeklyEmail');

exports.handler = async () => {
  console.log('[scheduled] Production Weekly reminder starting');
  try {
    const result = await sendDailyProdWeeklyReminder();
    console.log('[scheduled] Production Weekly reminder:', JSON.stringify(result));
  } catch (err) {
    console.error('[scheduled] Production Weekly reminder failed:', err.message);
  }
  return { statusCode: 200 };
};
