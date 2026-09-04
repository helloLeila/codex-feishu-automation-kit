import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

function mockRequest(method, body) {
  const payload = body === undefined ? '' : JSON.stringify(body);
  return {
    method,
    headers: {},
    async *[Symbol.asyncIterator]() {
      if (payload) yield Buffer.from(payload);
    },
  };
}

function mockResponse() {
  return {
    status: null,
    headers: {},
    body: {},
    writeHead(status, headers = {}) {
      this.status = status;
      this.headers = headers;
    },
    end(payload = '') {
      this.body = payload ? JSON.parse(payload) : {};
    },
  };
}

test('image preflight route returns per-image statuses without turning business failures into HTTP errors', async () => {
  const { createEditorServer } = await import('../scripts/start-wechat-editor.mjs');
  const directory = await mkdtemp(join(tmpdir(), 'open-wechat-image-api-'));
  const inspected = [];
  const fakeClient = {
    async inspectImages(content) {
      inspected.push(content);
      return {
        ok: false,
        count: 2,
        uniqueCount: 2,
        readyCount: 1,
        invalidCount: 1,
        pendingCount: 0,
        images: [
          { source: 'https://cdn.example.com/ok.png', status: 'ready', message: '可同步' },
          { source: '/assets/local.png', status: 'invalid', message: '本地图片路径无法被微信服务器访问。' },
        ],
      };
    },
  };
  const { handleApi } = createEditorServer({
    port: 0,
    configDirectory: directory,
    wechatClientFactory: () => fakeClient,
  });

  try {
    const response = mockResponse();
    await handleApi(
      mockRequest('POST', { content: '<p><img src="https://cdn.example.com/ok.png"><img src="/assets/local.png"></p>' }),
      response,
      '/api/wechat/images/inspect',
    );
    assert.equal(response.status, 200);
    assert.equal(response.body.ok, false);
    assert.equal(response.body.invalidCount, 1);
    assert.equal(response.body.images[1].status, 'invalid');
    assert.equal(inspected.length, 1);
    assert.match(inspected[0], /local\.png/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
