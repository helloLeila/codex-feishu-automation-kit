import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

function mockRequest(body = {}, method = 'POST') {
  const payload = JSON.stringify(body);
  return {
    method,
    async *[Symbol.asyncIterator]() {
      if (payload !== '{}') yield Buffer.from(payload);
    },
  };
}

function mockResponse() {
  return {
    status: null,
    headers: null,
    body: null,
    writeHead(status, headers) {
      this.status = status;
      this.headers = headers;
    },
    end(payload = '') {
      this.body = payload ? JSON.parse(payload) : {};
    },
  };
}

test('wechat client deletes an existing draft with the official delete endpoint', async () => {
  const { createWeChatClient } = await import('../apps/wechat-editor/src/server/wechat-client.mjs');
  const calls = [];
  const fetchMock = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes('/cgi-bin/token')) {
      return new Response(JSON.stringify({ access_token: 'token-1', expires_in: 7200 }), { status: 200 });
    }
    return new Response(JSON.stringify({ errcode: 0, errmsg: 'ok' }), { status: 200 });
  };
  const client = createWeChatClient({ appId: 'wx-test', appSecret: 'secret-test', fetchImpl: fetchMock });

  const result = await client.deleteDraft('draft-1');

  assert.equal(result.errcode, 0);
  const deleteCall = calls.find(({ url }) => url.includes('/cgi-bin/draft/delete'));
  assert.ok(deleteCall, 'expected a draft/delete request');
  assert.equal(deleteCall.options.method, 'POST');
  assert.match(deleteCall.options.body, /"media_id":"draft-1"/);
});

test('draft routes persist media id and lifecycle status without replacing media id after update failure', async () => {
  const { createEditorServer } = await import('../scripts/start-wechat-editor.mjs');
  const directory = await mkdtemp(join(tmpdir(), 'open-wechat-draft-lifecycle-'));
  const calls = [];
  let failUpdate = false;
  const fakeClient = {
    async addDraft(article) {
      calls.push({ method: 'addDraft', article });
      return { media_id: 'draft-1' };
    },
    async updateDraft(mediaId, article, index) {
      calls.push({ method: 'updateDraft', mediaId, article, index });
      if (failUpdate) throw Object.assign(new Error('微信暂时不可用'), { code: 45009 });
      return { errcode: 0 };
    },
    async deleteDraft(mediaId) {
      calls.push({ method: 'deleteDraft', mediaId });
      return { errcode: 0 };
    },
    async getDraft(mediaId) {
      calls.push({ method: 'getDraft', mediaId });
      return { media_id: mediaId };
    },
  };
  const { handleApi, articleStore } = createEditorServer({
    port: 0,
    configDirectory: directory,
    wechatClientFactory: () => fakeClient,
  });

  try {
    const localArticle = await articleStore.create({ title: '生命周期文章', markdown: '# 正文' });
    const addResponse = mockResponse();
    await handleApi(mockRequest({
      articleId: localArticle.id,
      article: { title: '生命周期文章', content: '<p>正文</p>', thumb_media_id: 'thumb-1' },
    }, 'POST'), addResponse, '/api/wechat/draft/add');
    assert.equal(addResponse.status, 200);
    assert.equal(addResponse.body.mediaId, 'draft-1');

    let stored = await articleStore.get(localArticle.id);
    assert.equal(stored.wechat.mediaId, 'draft-1');
    assert.equal(stored.wechat.status, 'synced');

    failUpdate = true;
    const updateResponse = mockResponse();
    await handleApi(mockRequest({
      articleId: localArticle.id,
      mediaId: 'draft-1',
      article: { title: '生命周期文章（改）', content: '<p>新正文</p>', thumb_media_id: 'thumb-1' },
    }, 'POST'), updateResponse, '/api/wechat/draft/update');
    assert.equal(updateResponse.status, 502);
    assert.equal(updateResponse.body.ok, false);

    stored = await articleStore.get(localArticle.id);
    assert.equal(stored.wechat.mediaId, 'draft-1');
    assert.equal(stored.wechat.status, 'sync-failed');
    assert.equal(stored.wechat.lastSyncError, '微信暂时不可用');
    assert.equal(calls.filter((call) => call.method === 'addDraft').length, 1, 'failed update must not create a new draft');

    const deleteResponse = mockResponse();
    await handleApi(mockRequest({ articleId: localArticle.id }, 'DELETE'), deleteResponse, '/api/wechat/draft/draft-1');
    assert.equal(deleteResponse.status, 200);
    assert.equal(deleteResponse.body.mediaId, 'draft-1');

    stored = await articleStore.get(localArticle.id);
    assert.equal(stored.wechat.mediaId, null);
    assert.equal(stored.wechat.status, 'deleted');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
