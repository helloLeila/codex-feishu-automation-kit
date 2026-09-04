import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('configuration storage never returns AppSecret in public config', async () => {
  const { createConfigStore } = await import('../apps/wechat-editor/src/server/config-store.mjs');
  const directory = await mkdtemp(join(tmpdir(), 'open-wechat-editor-'));
  try {
    const store = createConfigStore({ directory });
    await store.save({
      settings: { defaultAuthor: 'Leila', autoSync: true, syncDelayMs: 15000 },
      credentials: { appId: 'wx-test', appSecret: 'secret-test' },
    });
    const publicConfig = await store.getPublicConfig();
    assert.equal(publicConfig.settings.defaultAuthor, 'Leila');
    assert.equal(publicConfig.settings.autoSync, true);
    assert.equal(publicConfig.settings.syncDelayMs, 15000);
    assert.equal(publicConfig.credentials.appId, 'wx-test');
    assert.equal(publicConfig.credentials.secretConfigured, true);
    assert.equal('appSecret' in publicConfig.credentials, false);

    const credentialFile = await readFile(join(directory, 'credentials.json'), 'utf8');
    assert.match(credentialFile, /secret-test/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('environment credentials override file credentials without exposing the secret', async () => {
  const { createConfigStore } = await import('../apps/wechat-editor/src/server/config-store.mjs');
  const directory = await mkdtemp(join(tmpdir(), 'open-wechat-editor-env-'));
  const previous = {
    appId: process.env.WECHAT_APP_ID,
    appSecret: process.env.WECHAT_APP_SECRET,
  };
  try {
    process.env.WECHAT_APP_ID = 'wx-env';
    process.env.WECHAT_APP_SECRET = 'env-secret';
    const store = createConfigStore({ directory });
    await store.save({ credentials: { appId: 'wx-file', appSecret: 'file-secret' } });
    const publicConfig = await store.getPublicConfig();
    assert.equal(publicConfig.credentials.appId, 'wx-env');
    assert.equal(publicConfig.credentials.secretConfigured, true);
  } finally {
    if (previous.appId === undefined) delete process.env.WECHAT_APP_ID;
    else process.env.WECHAT_APP_ID = previous.appId;
    if (previous.appSecret === undefined) delete process.env.WECHAT_APP_SECRET;
    else process.env.WECHAT_APP_SECRET = previous.appSecret;
    await rm(directory, { recursive: true, force: true });
  }
});

test('wechat client caches access token and builds add/update draft requests', async () => {
  const { createWeChatClient } = await import('../apps/wechat-editor/src/server/wechat-client.mjs');
  const calls = [];
  const fetchMock = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes('/cgi-bin/token')) {
      return new Response(JSON.stringify({ access_token: 'token-1', expires_in: 7200 }), { status: 200 });
    }
    return new Response(JSON.stringify({ media_id: 'draft-1', errcode: 0, errmsg: 'ok' }), { status: 200 });
  };
  const client = createWeChatClient({ appId: 'wx-test', appSecret: 'secret-test', fetchImpl: fetchMock });

  await client.addDraft({
    title: '测试文章',
    author: '作者',
    digest: '摘要',
    content: '<p>正文</p>',
    thumb_media_id: 'thumb-1',
  });
  await client.updateDraft('draft-1', {
    title: '测试文章 2',
    author: '作者',
    digest: '摘要',
    content: '<p>正文 2</p>',
    thumb_media_id: 'thumb-1',
  });

  assert.equal(calls.filter(({ url }) => url.includes('/cgi-bin/token')).length, 1);
  assert.equal(calls.filter(({ url }) => url.includes('/cgi-bin/draft/add')).length, 1);
  assert.equal(calls.filter(({ url }) => url.includes('/cgi-bin/draft/update')).length, 1);
  const updateCall = calls.find(({ url }) => url.includes('/cgi-bin/draft/update'));
  assert.equal(updateCall.options.method, 'POST');
  assert.match(updateCall.options.body, /"media_id":"draft-1"/);
  assert.match(updateCall.options.body, /"index":0/);
});

test('wechat client uploads OSS article images once and reuses the WeChat image URL', async () => {
  const { createWeChatClient } = await import('../apps/wechat-editor/src/server/wechat-client.mjs');
  const calls = [];
  let imageUploadCount = 0;
  const ossImage = 'https://mdtuchuang.oss-cn-beijing.aliyuncs.com/img/hero.png';
  const wechatImage = 'https://mmbiz.qpic.cn/mmbiz_png/demo/hero/0';
  const fetchMock = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes('/cgi-bin/token')) {
      return new Response(JSON.stringify({ access_token: 'token-1', expires_in: 7200 }), { status: 200 });
    }
    if (String(url) === ossImage) {
      return new Response(new Uint8Array([137, 80, 78, 71]), { status: 200, headers: { 'content-type': 'image/png' } });
    }
    if (String(url).includes('/cgi-bin/media/uploadimg')) {
      imageUploadCount += 1;
      assert.equal(options.method, 'POST');
      assert.ok(options.body instanceof FormData);
      return new Response(JSON.stringify({ url: wechatImage }), { status: 200 });
    }
    return new Response(JSON.stringify({ media_id: 'draft-1', errcode: 0, errmsg: 'ok' }), { status: 200 });
  };
  const client = createWeChatClient({ appId: 'wx-test', appSecret: 'secret-test', fetchImpl: fetchMock });
  const article = {
    title: '带图文章',
    author: '作者',
    digest: '摘要',
    content: `<p><img src="${ossImage}" alt="封面图"></p>`,
    thumb_media_id: 'thumb-1',
  };

  await client.addDraft(article);
  await client.updateDraft('draft-1', article);

  const addCall = calls.find(({ url }) => url.includes('/cgi-bin/draft/add'));
  const updateCall = calls.find(({ url }) => url.includes('/cgi-bin/draft/update'));
  assert.match(addCall.options.body, new RegExp(wechatImage.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(updateCall.options.body, new RegExp(wechatImage.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(addCall.options.body, new RegExp(ossImage.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.equal(imageUploadCount, 1);
});
