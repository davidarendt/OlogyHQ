// Runs every Thursday at 2:00 PM ET (18:00 UTC, adjusted for EDT)
require('dotenv').config({ path: require('path').join(__dirname, '../../server/.env') });
const { sendLabelOrderEmail } = require('../../server/labelEmail');

exports.handler = async () => {
  console.log('[scheduled] Thursday label order email');
  try {
    await sendLabelOrderEmail();
    console.log('[scheduled] Email sent successfully');
  } catch (err) {
    console.error('[scheduled] Failed:', err.message);
  }
  return { statusCode: 200 };
};
