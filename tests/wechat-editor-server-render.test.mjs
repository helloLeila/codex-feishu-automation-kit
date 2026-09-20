import assert from 'node:assert/strict';
import test from 'node:test';

function request(method, body) {
  const payload = body === undefined ? '' : JSON.stringify(body);
  return {
    method,
    headers: { host: '127.0.0.1:3210', ...(payload ? { 'content-type': 'application/json' } : {}) },
    socket: { remoteAddress: '127.0.0.1' },
    async *[Symbol.asyncIterator]() { if (payload) yield Buffer.from(payload); },
  };
}

function response() {
  return {
    status: null,
    headers: {},
    body: '',
    writeHead(status, headers = {}) { this.status = status; this.headers = headers; },
    end(body = '') { this.body = body; },
  };
}

test('server render route returns the inline-styled HTML used by the publishing pipeline', async () => {
  const { createEditorServer } = await import('../scripts/start-wechat-editor.mjs');
  const editor = createEditorServer({ auth: { enabled: false } });
  const output = response();
  await editor.handleApi(request('POST', {
    markdown: '# 标题\n\n正文 **重点**',
    theme: { bodySize: 16, lineHeight: 1.8, primary: '#176b5b', heading: '#1f2c28', text: '#252a2e' },
  }), output, '/api/render');
  assert.equal(output.status, 200);
  const body = JSON.parse(output.body);
  assert.equal(body.ok, true);
  assert.match(body.render.html, /<h1[^>]*style=/);
  assert.match(body.render.html, /<strong[^>]*style=/);
});
