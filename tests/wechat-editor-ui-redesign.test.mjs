import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const editorRoot = new URL('../apps/wechat-editor/', import.meta.url);

test('editor exposes a dense two-pane publishing workbench', async () => {
  const html = await readFile(new URL('index.html', editorRoot), 'utf8');

  for (const contract of [
    'class="editor-workbench"',
    'class="writing-pane"',
    'id="markdown-input"',
    'class="canvas-panel"',
    'class="inspector-sidebar"',
    'class="device-preview"',
    /class="[^"]*device-toolbar(?:\s|\")/,
    'id="component-inspector"',
    'data-action="undo"',
    'data-action="redo"',
    'data-action="preview"',
    'data-action="settings"',
    'Markdown 原文',
    '设备预览',
  ]) {
    assert.match(html, new RegExp(contract), `missing redesigned UI contract: ${contract}`);
  }
});

test('settings center exposes content-tool navigation and grouped controls', async () => {
  const html = await readFile(new URL('index.html', editorRoot), 'utf8');

  for (const label of ['基础设置', '排版规则', '品牌样式', '公众号配置', 'AI 设置', '快捷键', '数据导出']) {
    assert.match(html, new RegExp(label), `missing settings navigation item: ${label}`);
  }

  for (const contract of [
    'class="settings-layout"',
    'class="settings-nav"',
    'class="settings-section"',
    'id="settings-status"',
    'data-action="settings-reset"',
    'data-action="settings-test"',
  ]) {
    assert.match(html, new RegExp(contract), `missing settings center contract: ${contract}`);
  }

  assert.match(html, /id="settings-app-secret"[^>]*type="password"/);
  assert.match(html, /已保存时显示掩码/);
});

test('editor styling uses an editorial neutral palette instead of AI dashboard effects', async () => {
  const css = await readFile(new URL('styles.css', editorRoot), 'utf8');

  assert.match(css, /--accent:\s*#3a705e/);
  assert.match(css, /--canvas:\s*#f2f5f3/);
  assert.match(css, /grid-template-columns:\s*minmax\(420px,\s*1fr\)\s+minmax\(420px,\s*1fr\)/);
  assert.doesNotMatch(css, /backdrop-filter\s*:/);
  assert.doesNotMatch(css, /radial-gradient\s*\(/);
  assert.doesNotMatch(css, /\.eyebrow\s*\{/);
});

test('editor keeps controls functional and preserves the inspector at narrow widths', async () => {
  const [html, css, app] = await Promise.all([
    readFile(new URL('index.html', editorRoot), 'utf8'),
    readFile(new URL('styles.css', editorRoot), 'utf8'),
    readFile(new URL('src/app.mjs', editorRoot), 'utf8'),
  ]);

  assert.match(html, /data-action="zoom-out"/);
  assert.match(html, /data-action="zoom-in"/);
  assert.match(html, /data-action="reload-preview"/);
  assert.match(css, /\.switch-row\s*\{/);
  assert.match(css, /@media \(max-width: 930px\)[\s\S]*\.inspector-sidebar\s*\{[\s\S]*display:\s*flex/);
  assert.match(app, /function setPreviewZoom\(/);
  assert.match(app, /action === 'zoom-out'/);
  assert.match(app, /action === 'zoom-in'/);
  assert.match(app, /action === 'reload-preview'/);
  assert.match(app, /function focusMarkdownEditor\(/);
});

test('editor removes decorative AI-dashboard residue and dead preview controls', async () => {
  const [html, css] = await Promise.all([
    readFile(new URL('index.html', editorRoot), 'utf8'),
    readFile(new URL('styles.css', editorRoot), 'utf8'),
  ]);

  assert.doesNotMatch(html, /class="brand-mark"/);
  assert.doesNotMatch(html, /class="brand-preview-mark"/);
  assert.doesNotMatch(html, /class="device-tab"/);
  assert.doesNotMatch(html, /class="inspector-empty-mark"/);
  assert.doesNotMatch(html, /data-action="device-info"/);
  assert.doesNotMatch(css, /\.stage-grid\s*\{/);
  assert.doesNotMatch(css, /\.brand-mark\s*\{/);
  assert.match(html, /设备：iPhone 14/);
  assert.match(html, /文章预览/);
  assert.match(html, /title="下划线"/);
  assert.match(html, /class="brand-preview-swatch"/);
});

test('button system has clear editor-specific hierarchy and complete interaction states', async () => {
  const [html, css] = await Promise.all([
    readFile(new URL('index.html', editorRoot), 'utf8'),
    readFile(new URL('styles.css', editorRoot), 'utf8'),
  ]);

  assert.match(html, /class="secondary-button"[^>]*data-action="settings-test"/);
  assert.match(html, /class="small-button"[^>]*data-action="export-md"/);
  assert.match(css, /--control-height:\s*30px/);
  assert.match(css, /--control-radius:\s*4px/);
  assert.match(css, /\.secondary-button[^\{]*\{/);
  assert.match(css, /\.small-button[^\{]*\{/);
  assert.match(css, /button:disabled/);
  assert.match(css, /button\[aria-pressed="true"\]/);
  assert.match(css, /button:active/);
  assert.doesNotMatch(css, /button:hover[^\{]*\{[^}]*transform/);
});

test('settings center uses a light green editorial configuration surface', async () => {
  const [html, css] = await Promise.all([
    readFile(new URL('index.html', editorRoot), 'utf8'),
    readFile(new URL('styles.css', editorRoot), 'utf8'),
  ]);

  assert.match(html, /class="modal settings-modal"/);
  assert.match(css, /--accent:\s*#3a705e/i);
  assert.match(css, /\.settings-modal\s+\.settings-card\s*\{/);
  assert.match(css, /background:\s*#f4f8f3/);
  assert.match(css, /\.settings-modal\s+\.settings-nav\s*\{/);
  assert.match(css, /background:\s*#e5efe7/);
  assert.match(css, /\.settings-modal\s+\.settings-card input/);
  assert.match(css, /\.settings-modal\s+\.primary-button/);
  assert.doesNotMatch(css, /\.settings-modal[\s\S]*background:\s*#000/);
});

test('editor follows a Juejin-like writing flow with title bar, dense toolbar, review and settings surfaces', async () => {
  const [html, css, app] = await Promise.all([
    readFile(new URL('index.html', editorRoot), 'utf8'),
    readFile(new URL('styles.css', editorRoot), 'utf8'),
    readFile(new URL('src/app.mjs', editorRoot), 'utf8'),
  ]);

  assert.match(html, /class="document-title-input"/);
  assert.match(html, /class="top-editor-toolbar(?:\s|")/);
  assert.match(html, /id="review-dialog"/);
  assert.match(html, /class="review-checklist"/);
  assert.match(html, /id="component-inspector"[^>]*hidden/);
  assert.match(css, /\.document-titlebar\s*\{/);
  assert.match(css, /\.top-editor-toolbar\s*\{/);
  assert.match(css, /grid-template-columns:\s*minmax\(420px,\s*1fr\)\s+minmax\(420px,\s*1fr\)/);
  assert.match(css, /\.review-modal\s*\{/);
  assert.match(app, /action === 'confirm-review'/);
  assert.match(app, /documentTitle/);
});

test('editor keeps chrome fixed, gives markdown the wider column, and removes the line-number gutter', async () => {
  const [html, css] = await Promise.all([
    readFile(new URL('index.html', editorRoot), 'utf8'),
    readFile(new URL('styles.css', editorRoot), 'utf8'),
  ]);

  assert.doesNotMatch(html, /line-gutter/);
  assert.doesNotMatch(css, /\.line-gutter\s*\{/);
  assert.match(css, /grid-template-columns:\s*minmax\(0,\s*1\.28fr\)\s+minmax\(380px,\s*\.82fr\)/);
  assert.match(css, /html, body\s*\{\s*height:\s*100%;\s*overflow:\s*hidden;/);
  assert.match(css, /\.top-editor-toolbar \.toolbar-action\s*\{\s*display:\s*none;/);
  assert.match(html, /data-action="import"/);
  assert.match(html, /data-action="export-html"/);
});

test('settings navigation uses a full-row Chrome-style selection instead of a left rail', async () => {
  const css = await readFile(new URL('styles.css', editorRoot), 'utf8');

  assert.match(css, /\.settings-modal \.settings-nav-item \{[\s\S]*border:\s*1px solid transparent;[\s\S]*border-radius:\s*18px/);
  assert.match(css, /\.settings-modal \.settings-nav-item\.active \{[\s\S]*border-color:\s*#7dab94;[\s\S]*background:\s*#e9f3ed/);
  assert.match(css, /\.settings-modal \.settings-nav-item span \{\s*display:\s*none;/);
  assert.doesNotMatch(css, /\.settings-nav-item[^\{]*\{[^}]*border-left/);
  assert.doesNotMatch(css, /\.settings-nav-item[^\{]*\.active[^\{]*\{[^}]*border-left/);
});

test('modal controls use the polished radius, spacing, states, and shared select chevron', async () => {
  const css = await readFile(new URL('styles.css', editorRoot), 'utf8');

  assert.match(css, /--modal-radius:\s*10px/);
  assert.match(css, /--surface-radius:\s*8px/);
  assert.match(css, /\.modal-card\s*>\s*\.modal-close\s*\{[\s\S]*position:\s*absolute/);
  assert.match(css, /select:not\(\[multiple\]\)\s*\{[\s\S]*appearance:\s*none/);
  assert.match(css, /select:not\(\[multiple\]\)\s*\{[\s\S]*padding-right:\s*36px\s*!important/);
  assert.match(css, /background-image:\s*url\("data:image\/svg\+xml/);
  assert.match(css, /\.settings-modal \.settings-card select:not\(\[multiple\]\)/);
  assert.match(css, /\.inspector-form select:not\(\[multiple\]\)/);
  assert.match(css, /\.canvas-footer select:not\(\[multiple\]\)/);
  assert.match(css, /\.review-checklist label:hover/);
  assert.match(css, /\.settings-switch:hover/);
});

test('preview header stays on one compact row and only exposes the 375px canvas', async () => {
  const [html, css] = await Promise.all([
    readFile(new URL('index.html', editorRoot), 'utf8'),
    readFile(new URL('styles.css', editorRoot), 'utf8'),
  ]);

  assert.match(html, /class="canvas-header[^"]*device-toolbar/);
  assert.match(html, /文章预览[\s\S]*微信公众号样式/);
  assert.doesNotMatch(html, /data-width="640"/);
  assert.doesNotMatch(html, /640px · 宽屏/);
  assert.doesNotMatch(html, /class="device-toolbar resource-strip"/);
  assert.match(html, /375 × 812/);
  assert.match(css, /\.canvas-header\.device-toolbar\s*\{/);
  assert.match(css, /\.canvas-header\.device-toolbar[\s\S]*white-space:\s*nowrap/);
});

test('editor links pane scroll positions and exposes a draggable splitter', async () => {
  const [html, css, app] = await Promise.all([
    readFile(new URL('index.html', editorRoot), 'utf8'),
    readFile(new URL('styles.css', editorRoot), 'utf8'),
    readFile(new URL('src/app.mjs', editorRoot), 'utf8'),
  ]);

  assert.match(html, /id="workspace-splitter"/);
  assert.match(html, /role="separator"/);
  assert.match(css, /\.editor-workbench\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*var\(--writing-pane-width/);
  assert.match(css, /\.workspace-splitter\s*\{/);
  assert.match(app, /function syncPaneScroll\(/);
  assert.match(app, /syncPaneScroll\(['"]editor['"]\)/);
  assert.match(app, /syncPaneScroll\(['"]preview['"]\)/);
  assert.match(app, /workspace-splitter/);
  assert.match(app, /pointerdown/);
});

test('editor uses Chrome-like thin scrollbars and restrained review surfaces', async () => {
  const css = await readFile(new URL('styles.css', editorRoot), 'utf8');

  assert.match(css, /::-webkit-scrollbar\s*\{[\s\S]*width:\s*6px[\s\S]*height:\s*6px/);
  assert.match(css, /::-webkit-scrollbar-thumb\s*\{[\s\S]*background:\s*#c4c9c6/);
  assert.match(css, /scrollbar-color:\s*#c4c9c6 transparent/);
  assert.match(css, /\.modal::backdrop\s*\{\s*background:\s*rgba\(0,\s*0,\s*0,\s*\.48\)/);
  assert.match(css, /\.review-card\s*\{[\s\S]*border-radius:\s*6px[\s\S]*box-shadow:\s*0 4px 16px/);
  assert.match(css, /\.review-checklist label\s*\{[\s\S]*border-radius:\s*0/);
  assert.match(css, /\.review-state\s*\{[\s\S]*border-radius:\s*4px/);
  assert.doesNotMatch(css, /\.review-checklist label:hover\s*\{[^}]*transform/);
});

test('editor chrome uses a Juejin-like title bar and lightweight formatting controls', async () => {
  const css = await readFile(new URL('styles.css', editorRoot), 'utf8');

  assert.match(css, /--editor-accent:\s*#3a705e/);
  assert.match(css, /\.top-editor-toolbar \.toolbar-group button\s*\{[\s\S]*width:\s*32px[\s\S]*height:\s*32px/);
  assert.match(css, /\.top-editor-toolbar \.toolbar-group button:hover\s*\{[\s\S]*background:\s*#f5f6f7/);
  assert.match(css, /\.small-text-button\.active\s*\{[\s\S]*background:\s*transparent[\s\S]*border-bottom-color:\s*#3a705e/);
  assert.match(css, /\.bar-actions \.accent-button\s*\{[\s\S]*background:\s*#3a705e/);
  assert.match(css, /\.bar-actions \.outline-button\s*\{[\s\S]*color:\s*#3a705e/);
});

test('editor action buttons use the editorial green UI accent without recoloring article themes', async () => {
  const css = await readFile(new URL('styles.css', editorRoot), 'utf8');

  assert.match(css, /\.sync-button\s*,\s*\.primary-button\s*,\s*\.accent-button\s*\{[\s\S]*background:\s*#3a705e/);
  assert.match(css, /\.settings-modal \.primary-button\s*\{[\s\S]*background:\s*#3a705e/);
  assert.match(css, /\.review-card \.primary-button\s*\{[\s\S]*background:\s*#3a705e/);
  assert.match(css, /\.sync-button:hover\s*,\s*\.primary-button:hover\s*,\s*\.accent-button:hover\s*\{[\s\S]*background:\s*(?:#285042|var\(--accent-dark\))/);
  assert.match(css, /\.secondary-button:hover[\s\S]*background:\s*#e7f0eb/);
  assert.match(css, /\.wechat-preview\[data-theme="editorial-green"\]/);
});

test('editor stylesheet cache version advances with the green action-button system', async () => {
  const html = await readFile(new URL('index.html', editorRoot), 'utf8');

  assert.match(html, /styles\.css\?v=20260904-6/);
  assert.match(html, /src\/app\.mjs\?v=20260904-11/);
});

test('preview keeps the article canvas and removes decorative device browser chrome', async () => {
  const [html, css] = await Promise.all([
    readFile(new URL('index.html', editorRoot), 'utf8'),
    readFile(new URL('styles.css', editorRoot), 'utf8'),
  ]);

  assert.doesNotMatch(html, /device-topbar/);
  assert.doesNotMatch(html, /device-browserbar/);
  assert.doesNotMatch(html, /phone-statusbar/);
  assert.doesNotMatch(html, /phone-page-header/);
  assert.doesNotMatch(html, /mp\.weixin\.qq\.com/);
  assert.match(html, /class="device-content"/);
  assert.doesNotMatch(css, /\.device-topbar\s*\{/);
  assert.doesNotMatch(css, /\.device-browserbar\s*\{/);
  assert.doesNotMatch(css, /\.phone-statusbar\s*\{/);
  assert.doesNotMatch(css, /\.phone-page-header\s*\{/);
});
