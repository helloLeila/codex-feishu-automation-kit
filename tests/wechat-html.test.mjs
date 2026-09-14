import assert from 'node:assert/strict';
import test from 'node:test';

test('wechat html inliner keeps every article block styled without a stylesheet', async () => {
  const { inlineWechatHtml } = await import('../apps/wechat-editor/src/wechat-html.mjs');
  const theme = {
    primary: '#176b5b',
    primaryDark: '#10483d',
    text: '#252a2e',
    heading: '#1f2c28',
    muted: '#6b7280',
    border: '#e5e7eb',
    quoteBg: '#eef6f1',
    quoteText: '#52615a',
    quoteBorder: '#79a691',
    codeBg: '#f1f6f3',
    codeText: '#29463a',
    tableHead: '#eef6f1',
    bodySize: 16,
    lineHeight: 1.8,
    h1Size: 25,
    h2Size: 20,
    h3Size: 17,
    captionSize: 13,
    paragraph: 16,
    section: 30,
    imageRadius: 4,
  };
  const html = [
    '<h1>标题</h1>',
    '<p>正文 <strong>重点</strong> <u>强调</u></p>',
    '<ul><li>列表项</li></ul>',
    '<ol><li>有序项</li></ol>',
    '<blockquote>引用</blockquote>',
    '<figure><img src="https://example.com/a.png" alt="图"><figcaption>说明</figcaption></figure>',
    '<pre><code>const ready = true;</code></pre>',
    '<div class="table-wrap"><table><thead><tr><th>列</th></tr></thead><tbody><tr><td>值</td></tr></tbody></table></div>',
    '<hr>',
  ].join('');

  const result = inlineWechatHtml(html, theme);

  for (const expected of [
    '<h1 style=',
    '<p style=',
    '<ul style=',
    '<ol style=',
    '<li style=',
    '<blockquote style=',
    '<figure style=',
    '<img style=',
    '<pre style=',
    '<code style=',
    '<div style=',
    '<table style=',
    '<th style=',
    '<td style=',
    '<hr style=',
  ]) {
    assert.match(result, new RegExp(expected.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(result, /background:#eef6f1/);
  assert.match(result, /<u style="text-decoration:underline">强调<\/u>/);
  assert.match(result, /border-collapse:collapse/);
  assert.match(result, /<h1 style="[^"]*text-align:left/);
  assert.match(result, /<p style="[^"]*text-align:left/);
  assert.match(result, /<blockquote style="[^"]*text-align:left/);
  assert.match(result, /<ul style="[^"]*text-align:left/);
  assert.doesNotMatch(result, /text-align:(?:start|end|match-parent|-webkit-)/i);
  assert.doesNotMatch(result, /class="table-wrap"/);
});

test('wechat html inliner leaves already-hosted WeChat images intact', async () => {
  const { inlineWechatHtml } = await import('../apps/wechat-editor/src/wechat-html.mjs');
  const theme = { imageRadius: 4 };
  const source = '<p><img src="https://mmbiz.qpic.cn/mmbiz_png/demo/0"></p>';
  const result = inlineWechatHtml(source, theme);
  assert.match(result, /src="https:\/\/mmbiz\.qpic\.cn\/mmbiz_png\/demo\/0"/);
  assert.match(result, /border-radius:4px/);
});
