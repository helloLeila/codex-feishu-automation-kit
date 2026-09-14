import assert from 'node:assert/strict';
import test from 'node:test';

test('wechat client inspects image URLs with deduplication and actionable statuses', async () => {
  const { createWeChatClient } = await import('../apps/wechat-editor/src/server/wechat-client.mjs');
  const calls = [];
  const readyUrl = 'https://mdtuchuang.oss-cn-beijing.aliyuncs.com/img/ready.png';
  const hostedUrl = 'https://mmbiz.qpic.cn/mmbiz_png/demo/hero/0';
  const missingUrl = 'https://cdn.example.com/missing.jpg';
  const unsupportedUrl = 'https://cdn.example.com/file.gif';
  const fetchMock = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url) === readyUrl) return new Response(null, { status: 200, headers: { 'content-type': 'image/png', 'content-length': '1024' } });
    if (String(url) === missingUrl) return new Response(null, { status: 404 });
    if (String(url) === unsupportedUrl) return new Response(null, { status: 200, headers: { 'content-type': 'image/gif', 'content-length': '1024' } });
    throw new Error(`unexpected URL ${url}`);
  };
  const client = createWeChatClient({ appId: 'wx-test', appSecret: 'secret-test', fetchImpl: fetchMock });
  const html = [
    `<p><img src="${readyUrl}"><img src="${readyUrl}"></p>`,
    `<p><img src="${hostedUrl}"><img src="/assets/editorial-cover.svg"></p>`,
    `<p><img src="${missingUrl}"><img src="${unsupportedUrl}"></p>`,
  ].join('');

  const result = await client.inspectImages(html);

  assert.equal(result.count, 6);
  assert.equal(result.uniqueCount, 5);
  assert.deepEqual(result.images.map((image) => image.status), [
    'ready', 'already-hosted', 'invalid', 'unreachable', 'unsupported',
  ]);
  assert.equal(calls.filter(({ url }) => url === readyUrl).length, 1);
  assert.equal(result.invalidCount, 3);
  assert.equal(result.readyCount, 2);
});

test('wechat client retries transient image upload failures twice before returning a readable error', async () => {
  const { createWeChatClient } = await import('../apps/wechat-editor/src/server/wechat-client.mjs');
  const source = 'https://cdn.example.com/retry.png';
  let imageReads = 0;
  const fetchMock = async (url) => {
    if (String(url).includes('/cgi-bin/token')) return new Response(JSON.stringify({ access_token: 'token-1', expires_in: 7200 }), { status: 200 });
    if (String(url) === source) {
      imageReads += 1;
      return new Response(null, { status: 503 });
    }
    throw new Error(`unexpected URL ${url}`);
  };
  const client = createWeChatClient({ appId: 'wx-test', appSecret: 'secret-test', fetchImpl: fetchMock });

  await assert.rejects(
    client.addDraft({ title: '带图', content: `<p><img src="${source}"></p>` }),
    (error) => error.code === 'IMAGE_FETCH_FAILED',
  );
  assert.equal(imageReads, 3);
});
