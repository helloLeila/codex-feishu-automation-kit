import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const editorRoot = new URL('../apps/wechat-editor/', import.meta.url);

test('editor shell exposes the complete local-first writing workflow', async () => {
  const html = await readFile(new URL('index.html', editorRoot), 'utf8');

  for (const contract of [
    'id="markdown-input"',
    'id="wechat-preview"',
    'data-preview-width="375"',
    'id="theme-select"',
    '清晰阅读',
    '本机已保存',
    '导入 Markdown',
    '导出 Markdown',
    '导出 HTML',
    '复制公众号格式',
    '创建微信草稿',
  ]) {
    assert.match(html, new RegExp(contract), `missing editor contract: ${contract}`);
  }

  assert.doesNotMatch(html, /data-insert="!\[图片说明\]\(\/assets\/editorial-cover\.svg\)"/);
  assert.doesNotMatch(html, /title="图片"/);
});

test('article list exposes a direct delete action without nesting interactive buttons', async () => {
  const [html, app] = await Promise.all([
    readFile(new URL('index.html', editorRoot), 'utf8'),
    readFile(new URL('src/app.mjs', editorRoot), 'utf8'),
  ]);

  assert.match(html, /id="article-list"/);
  assert.match(app, /class="article-list-item-main article-list-main"/);
  assert.match(app, /data-action="delete-article"/);
  assert.match(app, /action === 'delete-article'/);
  assert.match(app, /function deleteArticleById\(/);
});

test('review pause is persisted to the local service instead of only browser state', async () => {
  const app = await readFile(new URL('src/app.mjs', editorRoot), 'utf8');

  assert.match(app, /function persistReviewPause\(/);
  assert.match(app, /await persistReviewPause\(true\)/);
  assert.match(app, /settings:\s*\{\s*syncPaused:/);
});

test('custom theme selection survives the initial load before theme options arrive', async () => {
  const app = await readFile(new URL('src/app.mjs', editorRoot), 'utf8');

  assert.match(app, /let pendingThemeId = null/);
  assert.match(app, /pendingThemeId\s*=\s*stored\.theme/);
  assert.match(app, /pendingThemeId \|\| themeSelect\.value/);
});

test('custom theme tokens are applied to the live preview instead of only changing the select label', async () => {
  const app = await readFile(new URL('src/app.mjs', editorRoot), 'utf8');

  assert.match(app, /--theme-\$\{/);
  assert.match(app, /--theme-image-radius/);
});

test('review mode blocks manual sync until the author explicitly resumes it', async () => {
  const [html, app] = await Promise.all([
    readFile(new URL('index.html', editorRoot), 'utf8'),
    readFile(new URL('src/app.mjs', editorRoot), 'utf8'),
  ]);

  assert.match(html, /data-action="resume-review"/);
  assert.match(app, /function resumeReview\(/);
  assert.match(app, /wechatBinding\.paused\s*\|\|\s*runtimeConfig\.settings\??\.syncPaused/);
  assert.match(app, /action === 'resume-review'/);
});

test('saved AppSecret is represented by a non-destructive mask in settings', async () => {
  const app = await readFile(new URL('../apps/wechat-editor/src/app.mjs', import.meta.url), 'utf8');

  assert.match(app, /MASKED_APP_SECRET\s*=\s*['"]••••••••['"]/);
  assert.match(app, /dataset\.masked\s*===\s*['"]true['"]/);
  assert.match(app, /if \(appSecret\) credentials\.appSecret = appSecret/);
  assert.match(app, /updateAppSecretField\(\{ force: true \}\)/);
});

test('clear-reading theme keeps the approved identity and reading scale', async () => {
  const raw = await readFile(new URL('themes/clear-reading.json', editorRoot), 'utf8');
  const theme = JSON.parse(raw);

  assert.equal(theme.id, 'clear-reading');
  assert.equal(theme.name, '清晰阅读');
  assert.equal(theme.colors.primary, '#176b5b');
  assert.equal(theme.typography.bodySize, 16);
  assert.equal(theme.typography.lineHeight, 1.8);
  assert.equal(theme.typography.h2Size, 20);
});

test('markdown renderer covers article blocks and escapes unsafe raw HTML', async () => {
  const { renderMarkdown } = await import(
    new URL('src/markdown-renderer.mjs', editorRoot)
  );
  const source = [
    '# 主标题',
    '',
    '正文包含 **重点**、`行内代码`、<u>强调</u> 和 [链接](https://example.com)。',
    '',
    '## 章节',
    '',
    '> 一段引用',
    '',
    '- 第一项',
    '- 第二项',
    '',
    '![图片说明](/assets/editorial-cover.svg)',
    '',
    '```js',
    'const ready = true;',
    '```',
    '',
    '<script>alert("unsafe")</script>',
  ].join('\n');

  const result = renderMarkdown(source);

  assert.match(result.html, /<h1[^>]*>主标题<\/h1>/);
  assert.match(result.html, /<strong>重点<\/strong>/);
  assert.match(result.html, /<u>强调<\/u>/);
  assert.match(result.html, /<code>行内代码<\/code>/);
  assert.match(result.html, /<a href="https:\/\/example\.com"/);
  assert.match(result.html, /<h2[^>]*>章节<\/h2>/);
  assert.match(result.html, /<blockquote>/);
  assert.match(result.html, /<ul>/);
  assert.match(result.html, /<figure>/);
  assert.doesNotMatch(result.html, /loading="lazy"/);
  assert.match(result.html, /<pre><code class="language-js">/);
  assert.doesNotMatch(result.html, /<script>/);
  assert.match(result.html, /&lt;script&gt;/);
  assert.equal(result.title, '主标题');
  assert.ok(result.plainText.includes('第一项'));
});

test('markdown renderer turns a pasted standalone image URL into an image block', async () => {
  const { renderMarkdown } = await import(
    new URL('src/markdown-renderer.mjs', editorRoot)
  );
  const imageUrl = 'https://mdtuchuang.oss-cn-beijing.aliyuncs.com/img/image-20260904111327785-20260904111355325.png';
  const result = renderMarkdown(`# Nouvel article\n\n${imageUrl})`);

  assert.match(result.html, new RegExp(`<figure><img src="${imageUrl.replaceAll('.', '\\.') }"`));
  assert.doesNotMatch(result.html, new RegExp(`<p>${imageUrl.replaceAll('.', '\\.')}`));
});

test('pasted image URLs are normalized to Markdown without touching code blocks', async () => {
  const { normalizePastedMarkdown } = await import(
    new URL('src/markdown-renderer.mjs', editorRoot)
  );
  const imageUrl = 'https://mdtuchuang.oss-cn-beijing.aliyuncs.com/img/cover.png';
  const source = `正文\n\n${imageUrl})\n\n\`\`\`\n${imageUrl}\n\`\`\``;

  assert.equal(
    normalizePastedMarkdown(source),
    `正文\n\n![](${imageUrl})\n\n\`\`\`\n${imageUrl}\n\`\`\``,
  );
});

test('toolbar formatting preserves selected text while applying markdown syntax', async () => {
  const { formatMarkdownSelection } = await import(
    new URL('src/toolbar-format.mjs', editorRoot)
  );

  assert.equal(
    formatMarkdownSelection({ snippet: '# ', value: '标题内容', start: 0, end: 4 }).replacement,
    '# 标题内容',
  );
  assert.equal(
    formatMarkdownSelection({ snippet: '**粗体**', value: '重点内容', start: 0, end: 4 }).replacement,
    '**重点内容**',
  );
  assert.equal(
    formatMarkdownSelection({ snippet: '*斜体*', value: '强调内容', start: 0, end: 4 }).replacement,
    '*强调内容*',
  );
  assert.equal(
    formatMarkdownSelection({ snippet: '> 引用', value: '第一行\n第二行', start: 0, end: 7 }).replacement,
    '> 第一行\n> 第二行',
  );
  assert.equal(
    formatMarkdownSelection({ snippet: '> 引用', value: '> 第一行\n> 第二行', start: 0, end: 15 }).replacement,
    '第一行\n第二行',
  );
  assert.equal(
    formatMarkdownSelection({ snippet: '> 引用', value: '>> 第二层', start: 0, end: 7 }).replacement,
    '> 第二层',
  );
  assert.equal(
    formatMarkdownSelection({ snippet: '- 列表项', value: '第一项\n第二项', start: 0, end: 7 }).replacement,
    '- 第一项\n- 第二项',
  );
  assert.equal(
    formatMarkdownSelection({ snippet: '[链接文字](https://)', value: '查看文档', start: 0, end: 4 }).replacement,
    '[查看文档](https://)',
  );
  assert.equal(
    formatMarkdownSelection({ snippet: '**粗体**', value: '**重点内容**', start: 0, end: 8 }).replacement,
    '重点内容',
  );
  assert.equal(
    formatMarkdownSelection({ snippet: '*斜体*', value: '*强调内容*', start: 0, end: 6 }).replacement,
    '强调内容',
  );
  assert.equal(
    formatMarkdownSelection({ snippet: '`代码`', value: '`const x = 1;`', start: 0, end: 15 }).replacement,
    'const x = 1;',
  );
  assert.equal(
    formatMarkdownSelection({ snippet: '- 列表项', value: '- 第一项\n- 第二项', start: 0, end: 11 }).replacement,
    '第一项\n第二项',
  );
  assert.equal(
    formatMarkdownSelection({ snippet: '1. 列表项', value: '1. 第一项\n2. 第二项', start: 0, end: 13 }).replacement,
    '第一项\n第二项',
  );
  assert.equal(
    formatMarkdownSelection({ snippet: '[链接文字](https://)', value: '[查看文档](https://example.com)', start: 0, end: 27 }).replacement,
    '查看文档',
  );
  assert.equal(
    formatMarkdownSelection({ snippet: '<u>下划线</u>', value: '强调文字', start: 0, end: 4 }).replacement,
    '<u>强调文字</u>',
  );
  assert.equal(
    formatMarkdownSelection({ snippet: '<u>下划线</u>', value: '<u>强调文字</u>', start: 0, end: 11 }).replacement,
    '强调文字',
  );
  assert.equal(
    formatMarkdownSelection({ snippet: '`代码`', value: '``代码``', start: 0, end: 6 }).replacement,
    '代码',
  );
});

test('toolbar keeps inline formatting inside each Markdown block when selection spans lines', async () => {
  const { formatMarkdownSelection } = await import(
    new URL('src/toolbar-format.mjs', editorRoot)
  );
  const value = '一段正文\n\n- 第一项\n- 第二项';

  assert.equal(
    formatMarkdownSelection({ snippet: '*斜体*', value, start: 0, end: value.length }).replacement,
    '*一段正文*\n\n- *第一项*\n- *第二项*',
  );
  assert.equal(
    formatMarkdownSelection({ snippet: '<u>下划线</u>', value, start: 0, end: value.length }).replacement,
    '<u>一段正文</u>\n\n- <u>第一项</u>\n- <u>第二项</u>',
  );
  assert.equal(
    formatMarkdownSelection({ snippet: '`代码`', value, start: 0, end: value.length }).replacement,
    '`一段正文`\n\n- `第一项`\n- `第二项`',
  );
});

test('legacy multiline inline markers are repaired without touching fenced code', async () => {
  const { normalizeLegacyMultilineFormatting } = await import(
    new URL('src/toolbar-format.mjs', editorRoot)
  );
  const source = '<u>一段正文\n\n- 第一项\n- 第二项</u>\n\n*另一段正文\n\n- 第三项*\n\n```md\n<u>保留原样\n- 不改</u>\n```';

  assert.equal(
    normalizeLegacyMultilineFormatting(source),
    '<u>一段正文</u>\n\n- <u>第一项</u>\n- <u>第二项</u>\n\n*另一段正文*\n\n- *第三项*\n\n```md\n<u>保留原样\n- 不改</u>\n```',
  );
});

test('editor entry busts the toolbar formatter cache after behavior changes', async () => {
  const [html, app] = await Promise.all([
    readFile(new URL('index.html', editorRoot), 'utf8'),
    readFile(new URL('src/app.mjs', editorRoot), 'utf8'),
  ]);

  assert.match(html, /src="\/src\/app\.mjs\?v=20260904-12"/);
  assert.match(app, /toolbar-format\.mjs\?v=20260904-8/);
});
