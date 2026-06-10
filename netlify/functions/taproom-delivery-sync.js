// Runs every Saturday at 10:00 UTC (6:00 AM ET).
// Imports taproom delivery PDFs from the Invoice Log Google Sheet for Mon–Fri of the current week.
require('dotenv').config({ path: require('path').join(__dirname, '../../server/.env') });
const { syncDeliveriesFromSheet } = require('../../server/taproomDeliverySync');

exports.handler = async () => {
  const now    = new Date();
  const friday = new Date(now); friday.setDate(now.getDate() - 1);
  const monday = new Date(friday); monday.setDate(friday.getDate() - 4);
  const fmt    = d => d.toISOString().slice(0, 10);

  console.log(`[scheduled] Taproom delivery sync — importing ${fmt(monday)} to ${fmt(friday)}`);
  try {
    const results = await syncDeliveriesFromSheet(fmt(monday), fmt(friday));
    console.log(`[scheduled] Complete — imported: ${results.imported}, skipped: ${results.skipped}, noLocation: ${results.noLocation}, failed: ${results.failed.length}`);
    if (results.failed.length) console.error('[scheduled] Failures:', results.failed);
  } catch (err) {
    console.error('[scheduled] Taproom delivery sync failed:', err.message);
  }
  return { statusCode: 200 };
};
