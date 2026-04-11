const serverless = require('serverless-http');
const app = require('../../server/index');

const handler = serverless(app);

exports.handler = async (event, context) => {
  // Ensure path starts with /api for Express routing
  const p = event.path || '/';
  event.path = p.startsWith('/api') ? p : '/api' + p;
  return handler(event, context);
};
