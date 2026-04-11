const serverless = require('serverless-http');
const app = require('../../server/index');

const handler = serverless(app);

exports.handler = async (event, context) => {
  // Netlify strips /api from the path via the redirect rule — add it back for Express
  event.path = '/api' + (event.path || '/');
  return handler(event, context);
};
