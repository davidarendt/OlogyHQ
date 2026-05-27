// Runs Mon–Fri at 12:00 UTC (≈ 7 am ET).
// 1. Emails all unchecked tasks from prior days to configured recipients.
// 2. Auto-completes every past-day task so the board stays clean.
require('dotenv').config({ path: require('path').join(__dirname, '../../server/.env') });
const { sendDailyProdWeeklyReminder, autoCompleteOldTasks } = require('../../server/prodWeeklyEmail');

exports.handler = async () => {
  console.log('[scheduled] Production Weekly reminder starting');
  try {
    const emailResult = await sendDailyProdWeeklyReminder();
    console.log('[scheduled] Email:', JSON.stringify(emailResult));
  } catch (err) {
    console.error('[scheduled] Email failed:', err.message);
  }
  try {
    const count = await autoCompleteOldTasks();
    console.log(`[scheduled] Auto-completed ${count} past tasks`);
  } catch (err) {
    console.error('[scheduled] Auto-complete failed:', err.message);
  }
  return { statusCode: 200 };
};
