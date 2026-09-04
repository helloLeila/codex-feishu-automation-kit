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
    body: {},
    writeHead(status) { this.status = status; },
    end(payload = '') { this.body = payload ? JSON.parse(payload) : {}; },
  };
}

test('article API supports creating, reading, updating, listing, and deleting articles', async () => {
  const { createEditorServer } = await import('../scripts/start-wechat-editor.mjs');
  const directory = await mkdtemp(join(tmpdir(), 'open-wechat-api-'));
  const { handleApi } = createEditorServer({ port: 0, configDirectory: directory });
  const call = async (method, pathname, body) => {
    const response = mockResponse();
    await handleApi(mockRequest(method, body), response, pathname);
    return response;
  };
  try {
    const createdResponse = await call('POST', '/api/articles', { title: '第一篇', markdown: '# 正文', themeId: 'clear-reading' });
    assert.equal(createdResponse.status, 201);
    const created = createdResponse.body;
    assert.match(created.article.id, /^article-/);

    const listed = (await call('GET', '/api/articles')).body;
    assert.equal(listed.articles.length, 1);
    assert.equal(listed.articles[0].title, '第一篇');

    const updatedResponse = await call('PUT', `/api/articles/${created.article.id}`, { title: '改过的第一篇', markdown: '## 新正文' });
    assert.equal(updatedResponse.status, 200);
    assert.equal(updatedResponse.body.article.title, '改过的第一篇');

    const read = (await call('GET', `/api/articles/${created.article.id}`)).body;
    assert.equal(read.article.markdown, '## 新正文');

    const deletedResponse = await call('DELETE', `/api/articles/${created.article.id}`);
    assert.equal(deletedResponse.status, 200);
    const missingResponse = await call('GET', `/api/articles/${created.article.id}`);
    assert.equal(missingResponse.status, 404);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
