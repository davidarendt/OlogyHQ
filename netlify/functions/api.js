const serverless = require('serverless-http');
const app = require('../../server/index');

const handler = serverless(app);

exports.handler = async (event, context) => {
  console.log('Event method:', event.httpMethod);
  console.log('Event path:', event.path);
  console.log('Event body:', event.body);
  console.log('Event isBase64Encoded:', event.isBase64Encoded);
  console.log('Event headers content-type:', event.headers && event.headers['content-type']);

  // Ensure path starts with /api for Express routing
  const p = event.path || '/';
  event.path = p.startsWith('/api') ? p : '/api' + p;
  return handler(event, context);
};
