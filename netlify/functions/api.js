const serverless = require('serverless-http');
const app = require('../../server/index');

const handler = serverless(app, {
  binary: ['application/pdf', 'image/*', 'application/octet-stream'],
  request(req, event) {
    if (event.body) {
      const ct = (event.headers || {})['content-type'] || '';
      if (ct.includes('application/json')) {
        try { req.body = JSON.parse(event.body); } catch (e) {}
      } else if (ct.includes('application/x-www-form-urlencoded')) {
        const { URLSearchParams } = require('url');
        req.body = Object.fromEntries(new URLSearchParams(event.body));
      }
    }
  }
});

exports.handler = async (event, context) => {
  const p = event.path || '/';
  event.path = p.startsWith('/api') ? p : '/api' + p;
  return handler(event, context);
};
