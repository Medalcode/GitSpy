import { fileURLToPath } from 'url';
import path from 'path';

const modPath = './api/repos/[owner]/[repo]/kanban.js';
const { default: handler } = await import(modPath);

function makeRes() {
  let statusCode = 200;
  let body = null;
  return {
    status(code) { statusCode = code; return this; },
    json(obj) { body = obj; console.log('RESPONSE_STATUS:', statusCode); console.log('RESPONSE_BODY:', JSON.stringify(obj, null, 2)); },
    _get() { return { statusCode, body }; }
  };
}

(async () => {
  try {
    const req = { query: { owner: 'Medalcode', repo: 'Autokanban' } };
    const res = makeRes();
    await handler(req, res);
  } catch (e) {
    console.error('UNCAUGHT ERROR from handler invocation:');
    console.error(e && e.stack ? e.stack : e);
    process.exit(1);
  }
})();
