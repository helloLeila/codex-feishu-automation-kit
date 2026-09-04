import { normalizePastedMarkdown, renderMarkdown } from './markdown-renderer.mjs?v=20260904-3';
import { formatMarkdownSelection, normalizeLegacyMultilineFormatting } from './toolbar-format.mjs?v=20260904-8';
import { inlineWechatHtml } from './wechat-html.mjs?v=20260904-3';

const STORAGE_KEY = 'open-wechat-editor:prototype:v1';
const MASKED_APP_SECRET = '••••••••';
const DEFAULT_MARKDOWN = `# 把复杂的工作，写成清楚的文章

真正好用的公众号排版，不应该让作者一直在格式和内容之间来回切换。你只需要负责表达，版式应该稳定地跟随内容。

> 这套“清晰阅读”模板只保留必要的视觉层级：标题、正文、引用、图片和重点。它不会抢走文章本身的注意力。

## 01 从 Markdown 开始

左侧是你熟悉的 Markdown。粘贴文章以后，右侧会立即生成接近微信公众号正文宽度的预览。

- 标题层级自动统一
- 正文保持 16px 与 1.8 倍行高
- 图片、引用、列表使用固定安全样式
- 内容自动保存在这台电脑上

![把写作和排版放在同一个工作台](/assets/editorial-cover.svg)

## 02 模板只负责表达方式

模板不修改原始 Markdown。现在默认使用 **清晰阅读**，以后可以复制它，修改主色、字号和间距，再保存为自己的模板。

| 内容 | 当前规则 |
| --- | --- |
| 正文 | 16px / 1.8 行高 |
| 二级标题 | 左侧绿色竖线 |
| 引用 | 浅绿色背景 |
| 图片说明 | 13px 灰色居中 |

### 一次配置，后续直接生效

公众号的 AppID、AppSecret、默认作者和封面都从设置读取，不会写死在代码里。创建草稿之后，本地修改可以更新同一个微信草稿。

\`\`\`js
article.render({ theme: "clear-reading" });
\`\`\`

---

当你确认内容后，再点击“创建微信草稿”。进入微信后台审核时，自动同步会暂停，避免覆盖你最后的手工调整。`;

const THEME_ALIASES = Object.freeze({ 'editorial-red': 'editorial-green' });
let THEMES = {
  'clear-reading': {
    id: 'clear-reading', name: '清晰阅读', primary: '#176b5b', primaryDark: '#10483d', accent: '#79a691',
    text: '#252a2e', heading: '#1f2c28', muted: '#6b7280', surface: '#f6f8f7', border: '#e5e7eb',
    quoteBg: '#eef6f1', quoteText: '#52615a', quoteBorder: '#79a691', codeBg: '#f1f6f3', codeText: '#29463a', tableHead: '#eef6f1',
    bodySize: 16, lineHeight: 1.8, h1Size: 25, h2Size: 20, h3Size: 17, captionSize: 13, paragraph: 16, section: 30, image: 20, imageRadius: 4,
  },
  'editorial-green': {
    id: 'editorial-green', name: '编辑绿', primary: '#2f8a5e', primaryDark: '#205d41', accent: '#88b998',
    text: '#26372c', heading: '#21372a', muted: '#6e7d72', surface: '#f4f8f4', border: '#dbe8dc',
    quoteBg: '#edf7ef', quoteText: '#4c6654', quoteBorder: '#79b18b', codeBg: '#eef6ef', codeText: '#2d5940', tableHead: '#edf7ef',
    bodySize: 16, lineHeight: 1.82, h1Size: 25, h2Size: 20, h3Size: 17, captionSize: 13, paragraph: 16, section: 30, image: 20, imageRadius: 6,
  },
  'tech-blue': {
    id: 'tech-blue', name: '科技蓝', primary: '#2f6f9d', primaryDark: '#255675', accent: '#8fb7d1',
    text: '#26333f', heading: '#233747', muted: '#71808a', surface: '#f3f7fa', border: '#d9e5ec',
    quoteBg: '#edf4f9', quoteText: '#4f6574', quoteBorder: '#8fb7d1', codeBg: '#eef3f7', codeText: '#2b526c', tableHead: '#edf4f9',
    bodySize: 16, lineHeight: 1.78, h1Size: 25, h2Size: 20, h3Size: 17, captionSize: 13, paragraph: 16, section: 30, image: 20, imageRadius: 4,
  },
};

let themeRecords = new Map();
let currentArticleId = null;
let articleList = [];
let serverPersistenceAvailable = false;
let lastImageInspection = { count: 0, uniqueCount: 0, readyCount: 0, invalidCount: 0, pendingCount: 0, images: [] };
let pendingThemeId = null;

function toRuntimeTheme(theme = {}) {
  const colors = theme.colors || {};
  const typography = theme.typography || {};
  const spacing = theme.spacing || {};
  const components = theme.components || {};
  return {
    id: theme.id,
    name: theme.name || '自定义主题',
    version: theme.version || 1,
    ...colors,
    ...typography,
    ...spacing,
    imageRadius: Number(components.image?.borderRadius ?? theme.imageRadius ?? 4),
    heading2Style: components.heading2?.style || 'left-border',
    heading2BorderWidth: Number(components.heading2?.borderWidth ?? 4),
    quoteStyle: components.quote?.style || 'soft-background',
  };
}

function normalizeThemeId(themeId = 'clear-reading') {
  const normalized = THEME_ALIASES[themeId] || themeId;
  return THEMES[normalized] ? normalized : 'clear-reading';
}

function getTheme(themeId = themeSelect?.value) {
  return THEMES[normalizeThemeId(themeId)];
}

function applyTheme(themeId = themeSelect?.value) {
  const id = normalizeThemeId(themeId);
  const theme = THEMES[id];
  if (themeSelect && themeSelect.value !== id) themeSelect.value = id;
  if (preview) {
    preview.dataset.theme = id;
    const colorTokens = ['primary', 'primaryDark', 'accent', 'text', 'heading', 'muted', 'surface', 'border', 'quoteBg', 'quoteText', 'quoteBorder', 'codeBg', 'codeText', 'tableHead'];
    for (const token of colorTokens) {
      if (theme?.[token]) preview.style.setProperty(`--theme-${token.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`, theme[token]);
    }
    const sizeTokens = ['bodySize', 'lineHeight', 'h1Size', 'h2Size', 'h3Size', 'captionSize', 'paragraph', 'section', 'image'];
    for (const token of sizeTokens) {
      if (theme?.[token] !== undefined) preview.style.setProperty(`--theme-${token.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`, `${theme[token]}${token === 'lineHeight' ? '' : 'px'}`);
    }
    if (theme?.imageRadius !== undefined) preview.style.setProperty('--theme-image-radius', `${theme.imageRadius}px`);
    if (theme?.heading2BorderWidth !== undefined) preview.style.setProperty('--theme-heading2-border-width', `${theme.heading2BorderWidth}px`);
  }
  const label = $('#theme-select-label');
  if (label) label.textContent = `模板：${theme.name}`;
  return theme;
}

const $ = (selector) => document.querySelector(selector);
const input = $('#markdown-input');
const documentTitle = $('#document-title');
const preview = $('#wechat-preview');
const previewFrame = $('#preview-frame');
const canvasStage = $('#canvas-stage');
const writingPane = $('.writing-pane');
const workspaceSplitter = $('#workspace-splitter');
const saveStatus = $('#save-status');
const syncStatus = $('#sync-status');
const wordCount = $('#word-count');
const readTime = $('#read-time');
const themeSelect = $('#theme-select');
const toast = $('#toast');
const syncAction = $('#sync-action');
let saveTimer;
let toastTimer;
let syncTimer;
let currentRender = renderMarkdown('');
let historyStack = [];
let historyIndex = -1;
let selectedIndex = null;
let selectedElement = null;
let restoringHistory = false;
let previewZoom = 100;
let syncingPaneScroll = false;
let resizingWorkspace = false;
let runtimeConfig = {
  settings: { defaultAuthor: 'Open WeChat Editor', defaultTheme: 'clear-reading', defaultThumbMediaId: '', autoSync: false, syncDelayMs: 15000, syncPaused: false },
  credentials: { appId: '', secretConfigured: false },
};
let wechatBinding = { mediaId: null, index: 0, status: 'local-only', autoSync: false, paused: false };
let authState = { enabled: false, authenticated: false, username: '' };

function getState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  } catch {
    return null;
  }
}

function readAppSecretInput() {
  const field = $('#settings-app-secret');
  if (!field || field.dataset.masked === 'true' || field.value === MASKED_APP_SECRET) return '';
  return field.value.trim();
}

function updateAppSecretField({ force = false } = {}) {
  const field = $('#settings-app-secret');
  if (!field) return;
  const configured = Boolean(runtimeConfig.credentials?.secretConfigured);
  const hasUnmaskedValue = field.value.trim() && field.value !== MASKED_APP_SECRET && field.dataset.masked !== 'true';
  if (configured && (force || !hasUnmaskedValue)) {
    field.dataset.masked = 'true';
    field.value = MASKED_APP_SECRET;
    field.placeholder = '已配置；输入新密钥可替换';
    return;
  }
  if (!configured && !hasUnmaskedValue) field.value = '';
  field.dataset.masked = hasUnmaskedValue ? 'false' : 'true';
  field.placeholder = configured ? '已配置；输入新密钥可替换' : '保存时提交，页面不会回显';
}

async function apiFetch(path, options = {}) {
  const { allowOkFalse = false, ...fetchOptions } = options;
  const response = await fetch(path, { ...fetchOptions, headers: { 'content-type': 'application/json', ...(fetchOptions.headers || {}) } });
  const body = await response.json().catch(() => ({}));
  if (response.status === 401) {
    authState = { ...authState, authenticated: false, username: '' };
    updateAuthUi();
  }
  if (!response.ok || (!allowOkFalse && body.ok === false)) {
    const error = new Error(body.message || `本地 API 请求失败（${response.status}）`);
    error.code = body.code || response.status;
    throw error;
  }
  return body;
}

function updateAuthUi() {
  const label = $('#auth-mode-label');
  const loginButton = document.querySelector('[data-action="login"]');
  const logoutButton = document.querySelector('[data-action="logout"]');
  if (!label) return;
  if (!authState.enabled) {
    label.textContent = '本机模式 · 无需登录';
  } else if (authState.authenticated) {
    label.textContent = `已登录 · ${authState.username || '云端'}`;
  } else {
    label.textContent = '访客模式 · 可复制';
  }
  if (loginButton) loginButton.hidden = !authState.enabled || authState.authenticated;
  if (logoutButton) logoutButton.hidden = !authState.enabled || !authState.authenticated;
}

async function loadAuthSession() {
  try {
    const health = await apiFetch('/api/health');
    const session = await apiFetch('/api/auth/session');
    authState = { enabled: Boolean(health.authEnabled), authenticated: Boolean(session.authenticated), username: session.username || '' };
  } catch {
    authState = { enabled: false, authenticated: false, username: '' };
  }
  updateAuthUi();
  return authState;
}

function openLoginDialog() {
  const dialog = $('#login-dialog');
  if (!dialog) return;
  $('#auth-login-error').hidden = true;
  $('#auth-password').value = '';
  dialog.showModal();
  $('#auth-username').focus();
}

function closeLoginDialog() {
  $('#login-dialog')?.close();
}

function requireAuthenticated(message = '登录后才能使用云端功能。') {
  if (!authState.enabled || authState.authenticated) return true;
  openLoginDialog();
  showToast(message);
  return false;
}

async function submitLogin(event) {
  event.preventDefault();
  const submit = $('#auth-login-submit');
  const errorBox = $('#auth-login-error');
  submit.disabled = true;
  errorBox.hidden = true;
  try {
    const result = await apiFetch('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: $('#auth-username').value.trim(), password: $('#auth-password').value }),
    });
    authState = { ...authState, enabled: true, authenticated: true, username: result.username || '' };
    updateAuthUi();
    closeLoginDialog();
    await Promise.all([loadRuntimeConfig(), loadThemes()]);
    await loadArticleWorkspace();
    showToast('已登录，微信草稿和云端文章功能已启用');
  } catch (error) {
    errorBox.textContent = error.code === 'AUTH_RATE_LIMITED' ? `${error.message} 请稍后再试。` : '用户名或密码不正确。';
    errorBox.hidden = false;
  } finally {
    submit.disabled = false;
  }
}

async function logout() {
  try {
    await apiFetch('/api/auth/logout', { method: 'POST', body: '{}' });
  } catch {
    // A local-only session can still be cleared from the UI when the server is offline.
  }
  authState = { ...authState, authenticated: false, username: '' };
  updateAuthUi();
  runtimeConfig = {
    ...runtimeConfig,
    settings: { ...runtimeConfig.settings, autoSync: false },
    credentials: { appId: '', secretConfigured: false },
  };
  wechatBinding = { ...wechatBinding, mediaId: null, status: 'local-only', autoSync: false };
  updateSyncAction();
  syncStatus.textContent = authState.enabled ? '访客模式 · 可复制' : '本机模式';
  showToast('已退出登录；编辑和复制仍可继续使用');
}

function themeRecordPayload(record) {
  if (!record) return null;
  const { source, readOnly, ...theme } = record;
  return theme;
}

function populateThemeOptions() {
  const selects = [themeSelect, $('#settings-default-theme'), $('#theme-editor-select')].filter(Boolean);
  const records = [...themeRecords.values()];
  for (const select of selects) {
    const previous = select.value;
    select.replaceChildren();
    for (const record of records) {
      const option = document.createElement('option');
      option.value = record.id;
      option.textContent = `${record.name}${record.source === 'custom' ? ` · v${record.version}` : ''}`;
      select.append(option);
    }
    if (records.some((record) => record.id === previous)) select.value = previous;
  }
}

function updateImageStatus(result = lastImageInspection) {
  lastImageInspection = result;
  const status = $('#image-status');
  if (!status) return;
  if (!result.uniqueCount) {
    status.textContent = '图片 0 · 未检查';
    status.className = 'image-status';
    return;
  }
  const suffix = result.invalidCount ? ` · ${result.invalidCount} 项需处理` : ' · 可同步';
  status.textContent = `图片 ${result.uniqueCount} · ${result.readyCount} 可用${suffix}`;
  status.className = `image-status${result.invalidCount ? ' has-error' : ' is-ready'}`;
}

async function loadThemes() {
  try {
    const result = await apiFetch('/api/themes');
    const records = result.themes || [];
    themeRecords = new Map(records.map((record) => [record.id, record]));
    const runtimeThemes = {};
    for (const record of records) runtimeThemes[record.id] = toRuntimeTheme(record);
    if (Object.keys(runtimeThemes).length) THEMES = runtimeThemes;
    populateThemeOptions();
    applyTheme(normalizeThemeId(pendingThemeId || themeSelect.value || runtimeConfig.settings.defaultTheme));
    pendingThemeId = null;
    populateThemeEditor();
  } catch {
    const fallback = Object.values(THEMES).map((theme) => ({ ...theme, source: 'builtin', readOnly: true, colors: Object.fromEntries(['primary', 'primaryDark', 'accent', 'text', 'heading', 'muted', 'surface', 'border', 'quoteBg', 'quoteText', 'quoteBorder', 'codeBg', 'codeText', 'tableHead'].map((key) => [key, theme[key]])), typography: Object.fromEntries(['bodySize', 'lineHeight', 'h1Size', 'h2Size', 'h3Size', 'captionSize'].map((key) => [key, theme[key]])), spacing: Object.fromEntries(['paragraph', 'section', 'image'].map((key) => [key, theme[key]])), components: { image: { borderRadius: theme.imageRadius }, heading2: { borderWidth: 4, style: 'left-border' }, quote: { style: 'soft-background' } } }));
    themeRecords = new Map(fallback.map((record) => [record.id, record]));
    populateThemeOptions();
  }
}

function currentThemeRecord() {
  const id = $('#theme-editor-select')?.value || themeSelect.value;
  return themeRecords.get(id) || null;
}

function populateThemeEditor(record = currentThemeRecord()) {
  if (!record) return;
  $('#theme-editor-select').value = record.id;
  $('#theme-editor-name').value = record.name;
  const runtime = toRuntimeTheme(record);
  $('#theme-editor-primary').value = runtime.primary;
  $('#theme-editor-primary-value').value = runtime.primary;
  $('#theme-editor-text').value = runtime.text;
  $('#theme-editor-text-value').value = runtime.text;
  $('#theme-editor-body-size').value = String(runtime.bodySize);
  $('#theme-editor-line-height').value = String(runtime.lineHeight);
  $('#theme-json').value = JSON.stringify(themeRecordPayload(record), null, 2);
  $('#theme-editor-status').textContent = `${record.readOnly ? '内置只读' : `自定义 · v${record.version}`}`;
  updateThemeLivePreview(runtime);
}

function themePayloadFromEditor() {
  let payload;
  try {
    payload = JSON.parse($('#theme-json').value || '{}');
  } catch {
    throw new Error('主题 JSON 格式不正确，请检查逗号和引号。');
  }
  payload = { ...payload };
  delete payload.source;
  delete payload.readOnly;
  delete payload.version;
  payload.name = $('#theme-editor-name').value.trim() || '自定义主题';
  payload.colors = { ...(payload.colors || {}), primary: $('#theme-editor-primary-value').value.trim(), text: $('#theme-editor-text-value').value.trim() };
  payload.typography = { ...(payload.typography || {}), bodySize: Number($('#theme-editor-body-size').value), lineHeight: Number($('#theme-editor-line-height').value) };
  return payload;
}

async function saveThemeEditor({ copy = false } = {}) {
  if (!requireAuthenticated('登录后才能保存自定义主题。')) return;
  const current = currentThemeRecord();
  if (!current) throw new Error('尚未选择主题。');
  const payload = themePayloadFromEditor();
  if (copy || current.readOnly) {
    payload.id = undefined;
    payload.name = copy ? `${payload.name} · 副本` : `${payload.name} · 自定义`;
    delete payload.id;
  }
  const result = copy || current.readOnly
    ? await apiFetch('/api/themes', { method: 'POST', body: JSON.stringify({ theme: payload }) })
    : await apiFetch(`/api/themes/${encodeURIComponent(current.id)}`, { method: 'PUT', body: JSON.stringify({ theme: payload }) });
  const record = result.theme;
  themeRecords.set(record.id, record);
  THEMES[record.id] = toRuntimeTheme(record);
  populateThemeOptions();
  $('#theme-editor-select').value = record.id;
  themeSelect.value = record.id;
  applyTheme(record.id);
  populateThemeEditor(record);
  setState();
  showToast(`主题已保存：${record.name} · v${record.version}`);
}

function updateThemeLivePreview(runtime = getTheme()) {
  const live = $('#theme-live-preview');
  if (!live || !runtime) return;
  live.style.setProperty('--theme-preview-primary', runtime.primary);
  live.style.setProperty('--theme-preview-text', runtime.text);
  live.innerHTML = `<strong style="color:${runtime.heading}">主题预览</strong><p style="color:${runtime.text};font-size:${runtime.bodySize}px;line-height:${runtime.lineHeight}">正文、引用和标题会按当前 JSON 即时渲染。</p><blockquote style="border-left-color:${runtime.quoteBorder};background:${runtime.quoteBg};color:${runtime.quoteText}">这是一个安全的公众号阅读样式。</blockquote>`;
}

async function loadRuntimeConfig() {
  try {
    runtimeConfig = await apiFetch('/api/config');
    syncStatus.textContent = runtimeConfig.credentials.secretConfigured ? '微信已配置' : '微信未连接';
  } catch (error) {
    syncStatus.textContent = error.code === 'AUTH_REQUIRED' ? '访客模式 · 可复制' : '本地服务未连接';
  }
  return runtimeConfig;
}

function setState() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ articleId: currentArticleId, title: documentTitle?.value.trim() || currentRender.title, markdown: input.value, theme: normalizeThemeId(themeSelect.value), width: previewFrame.dataset.previewWidth, savedAt: Date.now(), settingsSavedAt: localStorage.getItem(`${STORAGE_KEY}:settingsSavedAt`) || '', wechat: wechatBinding }),
    );
  } catch {
    // Private browsing or a restricted browser can disable localStorage; editing still works.
  }
}

async function persistCurrentArticle() {
  const payload = {
    title: documentTitle?.value.trim() || currentRender.title || '未命名文章',
    markdown: input.value,
    themeId: normalizeThemeId(themeSelect.value),
    themeVersion: Number(getTheme(themeSelect.value)?.version || 1),
    wechat: wechatBinding,
  };
  try {
    let result;
    if (currentArticleId) {
      try {
        result = await apiFetch(`/api/articles/${encodeURIComponent(currentArticleId)}`, { method: 'PUT', body: JSON.stringify(payload) });
      } catch (error) {
        if (error.code !== 'ARTICLE_NOT_FOUND') throw error;
        currentArticleId = null;
      }
    }
    if (!result) result = await apiFetch('/api/articles', { method: 'POST', body: JSON.stringify(payload) });
    currentArticleId = result.article.id;
    serverPersistenceAvailable = true;
    articleList = articleList.filter((article) => article.id !== result.article.id);
    articleList.unshift(result.article);
    saveStatus.textContent = '本机与文件已保存';
    return result.article;
  } catch {
    serverPersistenceAvailable = false;
    return null;
  }
}

function formatArticleTime(value) {
  if (!value) return '刚刚';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '刚刚';
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
}

function renderArticleList(filter = '') {
  const list = $('#article-list');
  if (!list) return;
  const query = filter.trim().toLowerCase();
  const visible = articleList.filter((article) => !query || article.title.toLowerCase().includes(query));
  if (!visible.length) {
    list.innerHTML = `<div class="article-list-empty">${query ? '没有匹配的文章' : '还没有本机文章'}</div>`;
    return;
  }
  list.innerHTML = visible.map((article) => {
    const status = article.wechat?.status === 'synced' ? '已同步' : article.wechat?.status === 'sync-failed' ? '同步失败' : article.wechat?.status === 'reviewing' ? '审核中' : '本机';
    return `<div class="article-list-item${article.id === currentArticleId ? ' active' : ''}"><button type="button" class="article-list-item-main article-list-main" data-article-id="${article.id}"><strong>${escapeHtml(article.title || '未命名文章')}</strong><small>${formatArticleTime(article.updatedAt)} · ${status}</small></button><button type="button" class="article-list-delete" data-action="delete-article" data-article-id="${article.id}" title="删除文章" aria-label="删除文章：${escapeHtml(article.title || '未命名文章')}">×</button><span class="article-list-arrow" aria-hidden="true">›</span></div>`;
  }).join('');
  list.querySelectorAll('[data-article-id]').forEach((button) => button.addEventListener('click', (event) => {
    if (button.dataset.action === 'delete-article') {
      event.stopPropagation();
      deleteArticleById(button.dataset.articleId);
      return;
    }
    selectArticle(button.dataset.articleId);
  }));
}

function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function applyArticleRecord(article, { preserveLocalIfNewer = false } = {}) {
  if (!article) return false;
  const local = getState();
  const localIsNewer = preserveLocalIfNewer && local?.articleId === article.id && Number(local.savedAt || 0) > Date.parse(article.updatedAt || '') + 1000;
  const useLocal = Boolean(local?.markdown) && (localIsNewer || !String(article.markdown || '').trim());
  currentArticleId = article.id;
  documentTitle.value = useLocal ? (local.title || '') : (article.title || '');
  input.value = normalizeLegacyMultilineFormatting(useLocal ? local.markdown || '' : article.markdown || '');
  themeSelect.value = normalizeThemeId(useLocal ? local.theme || article.themeId : article.themeId);
  wechatBinding = { ...wechatBinding, ...(useLocal ? local.wechat || {} : article.wechat || {}) };
  applyTheme(themeSelect.value);
  historyStack = [];
  historyIndex = -1;
  captureHistory();
  render();
  updateSyncAction();
  renderArticleList($('#article-search')?.value || '');
  return useLocal;
}

async function loadArticleWorkspace() {
  const stored = getState();
  try {
    const result = await apiFetch('/api/articles');
    articleList = result.articles || [];
    serverPersistenceAvailable = true;
    const preferred = articleList.find((article) => article.id === stored?.articleId) || articleList[0];
    if (preferred) {
      const restoredLocalVersion = applyArticleRecord(preferred, { preserveLocalIfNewer: true });
      if (restoredLocalVersion) {
        const saved = await persistCurrentArticle();
        if (saved) showToast('已将本机恢复版本写回文章文件');
      }
    } else {
      currentArticleId = null;
      await persistCurrentArticle();
    }
    renderArticleList();
  } catch {
    serverPersistenceAvailable = false;
    renderArticleList();
  }
}

function openArticlesDialog() {
  renderArticleList($('#article-search')?.value || '');
  $('#articles-dialog')?.showModal();
}

async function selectArticle(articleId) {
  if (!articleId || articleId === currentArticleId) {
    $('#articles-dialog')?.close();
    return;
  }
  await persistCurrentArticle();
  try {
    const result = await apiFetch(`/api/articles/${encodeURIComponent(articleId)}`);
    applyArticleRecord(result.article);
    $('#articles-dialog')?.close();
    setState();
    showToast(`已切换到「${result.article.title}」`);
  } catch (error) {
    showToast(error.message);
  }
}

async function createNewArticle({ saveCurrent = true } = {}) {
  if (saveCurrent) await persistCurrentArticle();
  currentArticleId = null;
  documentTitle.value = '新文章';
  input.value = '# 新文章\n\n从这里开始写。';
  wechatBinding = { mediaId: null, index: 0, status: 'local-only', autoSync: false, paused: false };
  themeSelect.value = normalizeThemeId(runtimeConfig.settings.defaultTheme || 'clear-reading');
  render();
  captureHistory();
  setState();
  await persistCurrentArticle();
  $('#articles-dialog')?.close();
  showToast('已创建新文章');
}

async function deleteArticleById(articleId) {
  if (!articleId) return;
  const article = articleList.find((item) => item.id === articleId);
  if (!window.confirm(`确定删除「${article?.title || documentTitle.value || '未命名文章'}」？此操作不可撤销。`)) return;
  try {
    await apiFetch(`/api/articles/${encodeURIComponent(articleId)}`, { method: 'DELETE' });
    articleList = articleList.filter((item) => item.id !== articleId);
    if (articleId !== currentArticleId) {
      renderArticleList($('#article-search')?.value || '');
      showToast('文章已删除');
      return;
    }
    const next = articleList[0];
    if (next) applyArticleRecord(next);
    else {
      currentArticleId = null;
      await createNewArticle({ saveCurrent: false });
    }
    renderArticleList();
    showToast('文章已删除');
  } catch (error) {
    showToast(error.message);
  }
}

async function deleteCurrentArticle() {
  return deleteArticleById(currentArticleId);
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 2600);
}

function updateSyncAction() {
  if (!syncAction) return;
  const reviewPaused = Boolean(wechatBinding.paused || runtimeConfig.settings?.syncPaused);
  if (reviewPaused && wechatBinding.mediaId) {
    syncAction.textContent = '审核中 · 已暂停';
    syncAction.dataset.retry = 'false';
    syncAction.disabled = true;
    return;
  }
  syncAction.disabled = false;
  if (wechatBinding.mediaId && wechatBinding.status === 'sync-failed' && wechatBinding.retryable !== false) {
    syncAction.textContent = '重试同步';
    syncAction.dataset.retry = 'true';
  } else if (wechatBinding.mediaId) {
    syncAction.textContent = '立即同步';
    syncAction.dataset.retry = 'false';
  } else {
    syncAction.textContent = '先创建草稿';
    syncAction.dataset.retry = 'false';
  }
}

function setSettingsSavedAt(timestamp = Date.now()) {
  const formatted = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(timestamp);
  $('#settings-saved-at').textContent = `本机配置 · ${formatted} 已保存`;
  try { localStorage.setItem(`${STORAGE_KEY}:settingsSavedAt`, String(timestamp)); } catch { /* local-only UI hint */ }
}

function updateMeta() {
  const count = currentRender.plainText.replace(/\s/g, '').length;
  wordCount.textContent = `${count.toLocaleString('zh-CN')} 字`;
  readTime.textContent = `约 ${Math.max(1, Math.ceil(count / 420))} 分钟`;
  if (documentTitle && !documentTitle.value.trim()) documentTitle.value = currentRender.title;
  $('#draft-title').textContent = documentTitle?.value.trim() || currentRender.title;
}

function captureHistory() {
  if (restoringHistory || historyStack[historyIndex] === input.value) return;
  historyStack = historyStack.slice(0, historyIndex + 1);
  historyStack.push(input.value);
  historyIndex = historyStack.length - 1;
  if (historyStack.length > 60) {
    historyStack.shift();
    historyIndex -= 1;
  }
}

function restoreHistory(nextIndex) {
  if (nextIndex < 0 || nextIndex >= historyStack.length) return;
  restoringHistory = true;
  historyIndex = nextIndex;
  input.value = historyStack[historyIndex];
  restoringHistory = false;
  render();
  scheduleSave();
}

function componentInfo(element) {
  const tag = element?.tagName?.toLowerCase();
  if (tag === 'h1' || tag === 'h2' || tag === 'h3') return { name: '标题', icon: 'H', path: `article / ${tag}` };
  if (tag === 'blockquote') return { name: '引用', icon: '“', path: 'article / blockquote' };
  if (tag === 'figure') return { name: '图片', icon: '▧', path: 'article / figure' };
  if (tag === 'hr') return { name: '分割线', icon: '—', path: 'article / hr' };
  return { name: '正文', icon: '¶', path: 'article / p' };
}

function syncInspectorFromElement(element) {
  if (!element) return;
  const info = componentInfo(element);
  $('#inspector-empty').hidden = true;
  $('#inspector-form').hidden = false;
  $('#selected-component-icon').textContent = info.icon;
  $('#selected-component-name').textContent = info.name;
  $('#selected-component-path').textContent = info.path;
  const computed = getComputedStyle(element);
  const size = Number.parseInt(computed.fontSize, 10);
  const color = computed.color || '#252a2e';
  $('#inspector-font-size').value = String([14, 16, 18, 20, 24, 28].includes(size) ? size : (size > 21 ? 24 : 16));
  const align = element.style.textAlign || computed.textAlign || 'left';
  $('#inspector-align').value = ['left', 'center', 'right'].includes(align) ? align : 'left';
  $('#inspector-margin-top').value = String(Number.parseInt(computed.marginTop, 10) || 0);
  $('#inspector-margin-bottom').value = String(Number.parseInt(computed.marginBottom, 10) || 0);
  $('#inspector-line-height').value = String(Number.parseFloat(computed.lineHeight) / size || 1.8).slice(0, 4);
  $('#inspector-color').value = /^#[0-9a-f]{6}$/i.test(color) ? color : '#252a2e';
  $('#inspector-color-value').value = $('#inspector-color').value;
}

function selectComponent(element) {
  if (!element) return;
  if (selectedElement) selectedElement.classList.remove('selected-component');
  selectedElement = element;
  selectedIndex = Number(element.dataset.componentIndex);
  element.classList.add('selected-component');
  $('#component-inspector').hidden = false;
  $('#inspector-context').textContent = '正在编辑当前内容块';
  syncInspectorFromElement(element);
  $('#selection-label').textContent = `${componentInfo(element).name} · 已选中`;
}

function bindPreviewComponents() {
  const article = preview.querySelector('.wechat-article');
  if (!article) return;
  const components = article.querySelectorAll('h1, h2, h3, p, blockquote, figure, hr, ul, ol, table, pre');
  components.forEach((element, index) => {
    element.dataset.componentIndex = String(index);
    element.addEventListener('click', (event) => {
      event.stopPropagation();
      selectComponent(element);
    });
  });
  if (selectedIndex !== null) {
    const next = article.querySelector(`[data-component-index="${selectedIndex}"]`);
    if (next) selectComponent(next);
  }
}

function render() {
  applyTheme(themeSelect.value);
  currentRender = renderMarkdown(input.value);
  preview.innerHTML = `<article class="wechat-article">${currentRender.html}</article>`;
  bindPreviewComponents();
  updateMeta();
}

function scheduleSave() {
  saveStatus.classList.add('saving');
  saveStatus.textContent = '保存中';
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    setState();
    saveStatus.classList.remove('saving');
    saveStatus.textContent = '本机已保存';
    persistCurrentArticle();
    scheduleAutoSync();
  }, 780);
}

function scheduleAutoSync() {
  clearTimeout(syncTimer);
  const settings = runtimeConfig.settings || {};
  if (!settings.autoSync || settings.syncPaused || wechatBinding.paused || !wechatBinding.mediaId) return;
  syncTimer = setTimeout(() => syncDraft({ silent: true }), Number(settings.syncDelayMs || 15000));
}

function insertAtSelection(snippet) {
  const formatted = formatMarkdownSelection({
    snippet,
    value: input.value,
    start: input.selectionStart,
    end: input.selectionEnd,
  });
  input.setRangeText(formatted.replacement, formatted.start, formatted.end, 'select');
  input.focus();
  captureHistory();
  render();
  scheduleSave();
}

function focusMarkdownEditor() {
  input.focus({ preventScroll: true });
  $('#canvas-mode-label').textContent = '画布模式';
  showToast('已定位 Markdown 原文');
}

function setPreviewZoom(nextZoom) {
  previewZoom = Math.min(125, Math.max(80, nextZoom));
  previewFrame.style.setProperty('--preview-zoom', String(previewZoom / 100));
  $('.zoom-label').textContent = `${previewZoom}%`;
}

function scrollRatio(element) {
  if (!element) return 0;
  const maxScroll = element.scrollHeight - element.clientHeight;
  return maxScroll > 0 ? element.scrollTop / maxScroll : 0;
}

function applyScrollRatio(element, ratio) {
  if (!element) return;
  const maxScroll = Math.max(0, element.scrollHeight - element.clientHeight);
  element.scrollTop = Math.round(maxScroll * Math.min(1, Math.max(0, ratio)));
}

function syncPaneScroll(source) {
  if (syncingPaneScroll) return;
  const from = source === 'editor' ? input : canvasStage;
  const to = source === 'editor' ? canvasStage : input;
  if (!from || !to) return;
  syncingPaneScroll = true;
  applyScrollRatio(to, scrollRatio(from));
  requestAnimationFrame(() => { syncingPaneScroll = false; });
}

function setWritingPaneWidth(width) {
  if (!writingPane || !workspaceSplitter) return;
  const workbench = $('.editor-workbench');
  if (!workbench || window.matchMedia('(max-width: 680px)').matches) return;
  const bounds = workbench.getBoundingClientRect();
  const minLeft = 360;
  const minRight = 380;
  const splitter = workspaceSplitter.getBoundingClientRect().width || 8;
  const maxLeft = Math.max(minLeft, bounds.width - minRight - splitter);
  const current = writingPane.getBoundingClientRect().width;
  const next = Number.isFinite(Number(width)) ? Number(width) : current;
  const clamped = Math.min(maxLeft, Math.max(minLeft, next));
  workbench.style.setProperty('--writing-pane-width', `${Math.round(clamped)}px`);
}

function bindWorkspaceSplitter() {
  if (!workspaceSplitter) return;
  const resizeFromClientX = (clientX) => {
    const workbench = $('.editor-workbench');
    if (!workbench) return;
    const rect = workbench.getBoundingClientRect();
    setWritingPaneWidth(clientX - rect.left);
  };
  const stopResize = () => {
    if (!resizingWorkspace) return;
    resizingWorkspace = false;
    workspaceSplitter.classList.remove('is-dragging');
    document.body.classList.remove('is-resizing');
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', stopResize);
  };
  const onPointerMove = (event) => {
    if (resizingWorkspace) resizeFromClientX(event.clientX);
  };
  workspaceSplitter.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || window.matchMedia('(max-width: 680px)').matches) return;
    event.preventDefault();
    resizingWorkspace = true;
    workspaceSplitter.classList.add('is-dragging');
    document.body.classList.add('is-resizing');
    resizeFromClientX(event.clientX);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', stopResize);
  });
  workspaceSplitter.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const current = writingPane.getBoundingClientRect().width;
    setWritingPaneWidth(current + (event.key === 'ArrowRight' ? 24 : -24));
  });
  window.addEventListener('resize', () => setWritingPaneWidth(writingPane.getBoundingClientRect().width));
}

function reloadPreview() {
  const scrollTop = preview.closest('.device-stage')?.scrollTop || 0;
  render();
  requestAnimationFrame(() => {
    const stage = preview.closest('.device-stage');
    if (stage) stage.scrollTop = scrollTop;
  });
  showToast('预览已刷新');
}

function applyInspector() {
  if (!selectedElement) return;
  const color = $('#inspector-color-value').value.trim();
  selectedElement.style.fontSize = `${Number($('#inspector-font-size').value)}px`;
  selectedElement.style.textAlign = $('#inspector-align').value;
  selectedElement.style.marginTop = `${Number($('#inspector-margin-top').value)}px`;
  selectedElement.style.marginBottom = `${Number($('#inspector-margin-bottom').value)}px`;
  selectedElement.style.lineHeight = $('#inspector-line-height').value;
  if (/^#[0-9a-f]{6}$/i.test(color)) selectedElement.style.color = color;
  if (!$('#inspector-border').checked) selectedElement.style.borderLeft = '0';
  else if (/^h[23]$/.test(selectedElement.tagName.toLowerCase())) selectedElement.style.borderLeft = `4px solid ${color || '#3a705e'}`;
  showToast('组件样式已应用到当前画布');
}

function resetInspector() {
  if (!selectedElement) return;
  selectedElement.removeAttribute('style');
  syncInspectorFromElement(selectedElement);
  showToast('已恢复组件默认样式');
}

function clearSelection() {
  selectedElement?.classList.remove('selected-component');
  selectedElement = null;
  selectedIndex = null;
  $('#component-inspector').hidden = true;
  $('#inspector-context').textContent = '从画布选择一个内容块';
  $('#inspector-empty').hidden = false;
  $('#inspector-form').hidden = true;
  $('#selection-label').textContent = '未选择组件';
}

function activateResourceTab(tab) {
  document.querySelectorAll('[data-resource-tab]').forEach((button) => button.classList.toggle('active', button.dataset.resourceTab === tab));
  document.querySelectorAll('[data-resource-panel]').forEach((panel) => panel.classList.toggle('active', panel.dataset.resourcePanel === tab));
}

function activateSettingsSection(section) {
  document.querySelectorAll('[data-settings-section]').forEach((button) => button.classList.toggle('active', button.dataset.settingsSection === section));
  document.querySelectorAll('[data-settings-panel]').forEach((panel) => panel.classList.toggle('active', panel.dataset.settingsPanel === section));
}

function resetSettings() {
  $('#settings-author').value = 'Open WeChat Editor';
  $('#settings-default-theme').value = 'clear-reading';
  $('#settings-app-id').value = runtimeConfig.credentials.appId || '';
  $('#settings-app-secret').value = '';
  $('#settings-thumb-media-id').value = runtimeConfig.settings.defaultThumbMediaId || '';
  $('#settings-auto-sync').checked = false;
  $('#settings-sync-delay').value = '15000';
  $('#settings-diagnostic').className = 'diagnostic-panel';
  $('#settings-diagnostic').textContent = '已恢复默认设置，点击保存后生效。';
  showToast('设置已恢复默认值');
}

function exportConfig() {
  const safe = { settings: runtimeConfig.settings || {}, credentials: { appId: runtimeConfig.credentials?.appId || '', secretConfigured: Boolean(runtimeConfig.credentials?.secretConfigured) } };
  download('open-wechat-editor-config.json', JSON.stringify(safe, null, 2), 'application/json;charset=utf-8');
  showToast('已导出不含 AppSecret 的配置');
}

function download(filename, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function themeCss(theme = getTheme()) {
  return `.wechat-article{max-width:640px;margin:0 auto;padding:24px 18px 42px;color:${theme.text};font:${theme.bodySize}px/${theme.lineHeight} -apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",sans-serif}.wechat-article h1{margin:0 0 ${theme.paragraph + 4}px;color:${theme.heading};font-size:${theme.h1Size}px;line-height:1.28}.wechat-article h2{margin:${theme.section}px 0 13px;padding-left:11px;border-left:4px solid ${theme.primary};color:${theme.heading};font-size:${theme.h2Size}px;line-height:1.35}.wechat-article h3{margin:23px 0 9px;color:${theme.heading};font-size:${theme.h3Size}px;line-height:1.5}.wechat-article p{margin:0 0 ${theme.paragraph}px}.wechat-article strong{color:${theme.primary};font-weight:750}.wechat-article a{color:${theme.primaryDark}}.wechat-article blockquote{margin:20px 0;padding:13px 15px;border-left:3px solid ${theme.quoteBorder};border-radius:0 4px 4px 0;background:${theme.quoteBg};color:${theme.quoteText};font-size:14px;line-height:1.75}.wechat-article img{max-width:100%;height:auto;border-radius:${theme.imageRadius}px}.wechat-article figcaption{color:${theme.muted};font-size:${theme.captionSize}px;text-align:center}.wechat-article pre{padding:14px;border:1px solid ${theme.border};border-radius:4px;background:${theme.codeBg};color:${theme.codeText};font:12px/1.7 "SFMono-Regular",Menlo,monospace}.wechat-article th{background:${theme.tableHead};color:${theme.primaryDark}}`;
}

function articleExportHtml() {
  const theme = getTheme();
  const title = (documentTitle?.value.trim() || currentRender.title).replaceAll('&', '&amp;').replaceAll('<', '&lt;');
  const content = inlineWechatHtml(currentRender.html, theme);
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${themeCss(theme)}</style></head><body><article class="wechat-article">${content}</article></body></html>`;
}

function buildWechatArticle() {
  const theme = getTheme();
  const settings = runtimeConfig.settings || {};
  const digest = (settings.defaultDigest || currentRender.plainText).slice(0, 120);
  const content = inlineWechatHtml(currentRender.html, theme);
  return {
    title: (documentTitle?.value.trim() || currentRender.title).slice(0, 32),
    author: String(settings.defaultAuthor || 'Open WeChat Editor').slice(0, 16),
    digest,
    content,
    content_source_url: '',
    thumb_media_id: settings.defaultThumbMediaId || '',
    need_open_comment: settings.needOpenComment ? 1 : 0,
    only_fans_can_comment: settings.onlyFansCanComment ? 1 : 0,
  };
}

async function inspectWechatImages({ silent = false } = {}) {
  if (!requireAuthenticated('登录后才能检查微信图片。')) return null;
  const article = buildWechatArticle();
  try {
    const result = await apiFetch('/api/wechat/images/inspect', { method: 'POST', body: JSON.stringify({ content: article.content }), allowOkFalse: true });
    updateImageStatus(result);
    if (result.invalidCount) {
      const failed = result.images.filter((image) => image.status !== 'ready' && image.status !== 'already-hosted');
      const first = failed[0];
      const detail = first ? ` ${first.message}` : '';
      throw new Error(`有 ${result.invalidCount} 张图片无法同步。${detail}`);
    }
    if (!silent) showToast(result.uniqueCount ? `图片检查完成：${result.readyCount} 张可同步` : '正文没有图片');
    return result;
  } catch (error) {
    if (!lastImageInspection.uniqueCount && error.code !== 'ARTICLE_REQUIRED') updateImageStatus({ ...lastImageInspection, invalidCount: 1 });
    if (!silent) showToast(error.message);
    throw error;
  }
}

async function saveSettings() {
  if (!requireAuthenticated('登录后才能保存公众号配置。')) return;
  const credentials = {
    appId: $('#settings-app-id').value.trim(),
  };
  const appSecret = readAppSecretInput();
  if (appSecret) credentials.appSecret = appSecret;
  const result = await apiFetch('/api/config', {
    method: 'PUT',
    body: JSON.stringify({
      credentials,
      settings: {
        defaultAuthor: $('#settings-author').value.trim(),
        defaultTheme: normalizeThemeId($('#settings-default-theme').value),
        defaultDigest: $('#settings-digest')?.value.trim() || '',
        defaultThumbMediaId: $('#settings-thumb-media-id').value.trim(),
        autoSync: $('#settings-auto-sync').checked,
        syncDelayMs: Number($('#settings-sync-delay').value),
      },
    }),
  });
  runtimeConfig = result;
  themeSelect.value = normalizeThemeId(runtimeConfig.settings.defaultTheme || themeSelect.value);
  applyTheme(themeSelect.value);
  setState();
  syncStatus.textContent = runtimeConfig.credentials.secretConfigured ? '微信已配置' : '微信未连接';
  updateAppSecretField({ force: true });
  setSettingsSavedAt();
  $('#settings-status').textContent = '已保存';
  $('#settings-dialog').close();
  showToast('配置已保存到本机；点击“测试连接”检查微信白名单');
  scheduleAutoSync();
}

function populateSettings() {
  const settings = runtimeConfig.settings || {};
  $('#settings-app-id').value = runtimeConfig.credentials.appId || '';
  updateAppSecretField({ force: true });
  $('#settings-author').value = settings.defaultAuthor || 'Open WeChat Editor';
  $('#settings-default-theme').value = normalizeThemeId(settings.defaultTheme || themeSelect.value);
  $('#settings-digest').value = settings.defaultDigest || '';
  $('#settings-thumb-media-id').value = settings.defaultThumbMediaId || '';
  $('#settings-auto-sync').checked = Boolean(settings.autoSync);
  $('#settings-sync-delay').value = String(settings.syncDelayMs || 15000);
  $('#settings-diagnostic').textContent = runtimeConfig.credentials.secretConfigured ? '凭证已配置；尚未进行连接诊断。' : '尚未配置 AppID / AppSecret。';
  $('#settings-diagnostic').className = 'diagnostic-panel';
  const stored = getState();
  if (stored?.settingsSavedAt) setSettingsSavedAt(Number(stored.settingsSavedAt));
  $('#settings-status').textContent = runtimeConfig.credentials.secretConfigured ? '已配置' : '尚未测试';
}

async function testConnection() {
  if (!requireAuthenticated('登录后才能测试微信连接。')) return;
  const diagnostic = $('#settings-diagnostic');
  diagnostic.className = 'diagnostic-panel';
  diagnostic.textContent = '正在通过本机服务获取 access_token…';
  try {
    await saveSettingsWithoutClosing();
    const result = await apiFetch('/api/wechat/diagnose', { method: 'POST', body: '{}' });
    diagnostic.className = 'diagnostic-panel ok';
    diagnostic.textContent = `${result.message} API 地址：${result.apiBaseUrl}`;
    $('#settings-status').textContent = '连接正常';
    syncStatus.textContent = '微信连接正常';
  } catch (error) {
    diagnostic.className = 'diagnostic-panel error';
    diagnostic.textContent = `${error.message}。先检查 AppID、AppSecret 和微信后台接口 IP 白名单。`;
    $('#settings-status').textContent = '连接失败';
    syncStatus.textContent = '微信连接失败';
  }
}

async function saveSettingsWithoutClosing() {
  if (!requireAuthenticated('登录后才能保存公众号配置。')) return runtimeConfig;
  const credentials = { appId: $('#settings-app-id').value.trim() };
  const appSecret = readAppSecretInput();
  if (appSecret) credentials.appSecret = appSecret;
  runtimeConfig = await apiFetch('/api/config', {
    method: 'PUT',
    body: JSON.stringify({
      credentials,
      settings: {
        defaultAuthor: $('#settings-author').value.trim(),
        defaultTheme: normalizeThemeId($('#settings-default-theme').value),
        defaultDigest: $('#settings-digest')?.value.trim() || '',
        defaultThumbMediaId: $('#settings-thumb-media-id').value.trim(),
        autoSync: $('#settings-auto-sync').checked,
        syncDelayMs: Number($('#settings-sync-delay').value),
      },
    }),
  });
  updateAppSecretField({ force: true });
  return runtimeConfig;
}

async function createWechatDraft() {
  if (!requireAuthenticated('登录后才能创建或更新微信草稿。')) {
    $('#draft-dialog')?.close();
    return;
  }
  if (wechatBinding.mediaId) {
    $('#draft-dialog')?.close();
    await syncDraft();
    return;
  }
  if (!runtimeConfig.credentials.secretConfigured) {
    $('#draft-dialog').close();
    populateSettings();
    $('#settings-dialog').showModal();
    showToast('请先在设置中填写 AppID / AppSecret');
    return;
  }
  try {
    wechatBinding.autoSync = Boolean($('#draft-auto-sync')?.checked);
    const article = buildWechatArticle();
    if (!article.thumb_media_id) throw new Error('请先填写封面永久 MediaID。');
    await inspectWechatImages({ silent: true });
    const result = await apiFetch('/api/wechat/draft/add', { method: 'POST', body: JSON.stringify({ article, articleId: currentArticleId }) });
    wechatBinding = { ...wechatBinding, mediaId: result.mediaId, status: 'synced', autoSync: Boolean($('#draft-auto-sync')?.checked || runtimeConfig.settings.autoSync), paused: false, retryable: false, lastSyncError: null, syncedAt: Date.now() };
    setState();
    await persistCurrentArticle();
    updateSyncAction();
    syncStatus.textContent = `草稿已同步 · ${result.mediaId.slice(0, 8)}…`;
    showToast('微信草稿已创建；后续编辑会更新同一个草稿');
  } catch (error) {
    syncStatus.textContent = '草稿创建失败';
    updateSyncAction();
    showToast(error.message);
  }
}

async function syncDraft({ silent = false } = {}) {
  if (!requireAuthenticated('登录后才能同步微信草稿。')) return;
  if (!wechatBinding.mediaId) {
    if (!silent) showToast('请先创建微信草稿');
    return;
  }
  if (wechatBinding.paused || runtimeConfig.settings?.syncPaused) {
    if (!silent) showToast('当前处于审核状态，已暂停同步；确认手工修改完成后再恢复。');
    updateSyncAction();
    return;
  }
  try {
    wechatBinding.status = 'syncing';
    wechatBinding.retryable = false;
    syncStatus.textContent = '微信同步中…';
    await inspectWechatImages({ silent: true });
    const result = await apiFetch('/api/wechat/draft/update', { method: 'POST', body: JSON.stringify({ articleId: currentArticleId, mediaId: wechatBinding.mediaId, index: wechatBinding.index || 0, article: buildWechatArticle() }) });
    wechatBinding = { ...wechatBinding, status: 'synced', retryable: false, lastSyncError: null, syncedAt: Date.now() };
    setState();
    await persistCurrentArticle();
    updateSyncAction();
    syncStatus.textContent = `草稿已同步 · ${result.mediaId.slice(0, 8)}…`;
    if (!silent) showToast('已更新同一个微信草稿');
  } catch (error) {
    wechatBinding.status = 'sync-failed';
    wechatBinding.retryable = true;
    wechatBinding.lastSyncError = error.message;
    syncStatus.textContent = '微信同步失败';
    setState();
    persistCurrentArticle();
    updateSyncAction();
    if (!silent) showToast(error.message);
  }
}

async function deleteWechatDraft() {
  if (!requireAuthenticated('登录后才能删除微信草稿。')) return;
  if (!wechatBinding.mediaId) return;
  const title = documentTitle?.value.trim() || currentRender.title || '未命名文章';
  const mediaId = wechatBinding.mediaId;
  if (!window.confirm(`确定删除「${title}」对应的微信草稿？\nmedia_id：${mediaId.slice(0, 12)}…\n此操作不可撤销。`)) return;
  try {
    await apiFetch(`/api/wechat/draft/${encodeURIComponent(mediaId)}?articleId=${encodeURIComponent(currentArticleId || '')}`, { method: 'DELETE', body: JSON.stringify({ articleId: currentArticleId }) });
    wechatBinding = { ...wechatBinding, mediaId: null, status: 'deleted', retryable: false, lastSyncError: null };
    setState();
    await persistCurrentArticle();
    updateSyncAction();
    $('#draft-dialog')?.close();
    syncStatus.textContent = '微信草稿已删除';
    showToast('微信草稿已删除，本机文章仍保留');
  } catch (error) {
    showToast(`删除失败：${error.message}`);
  }
}

function openDraftDialog() {
  if (!requireAuthenticated('登录后才能使用微信草稿；不登录可复制公众号格式。')) return;
  $('#draft-title').textContent = documentTitle?.value.trim() || currentRender.title;
  $('#draft-theme').textContent = `${getTheme(themeSelect.value).name} · v${getTheme(themeSelect.value).version || 1}`;
  $('#draft-media-id').textContent = wechatBinding.mediaId ? `${wechatBinding.mediaId.slice(0, 12)}…` : '尚未绑定';
  $('#draft-dialog-title').textContent = wechatBinding.mediaId ? '微信草稿' : '创建微信草稿';
  $('#confirm-draft').textContent = wechatBinding.mediaId ? '更新草稿' : '确认创建';
  $('#delete-draft').hidden = !wechatBinding.mediaId;
  $('#draft-auto-sync').checked = Boolean(runtimeConfig.settings.autoSync || wechatBinding.autoSync);
  $('#draft-dialog').showModal();
}

function openReviewDialog() {
  $('#review-summary-title').textContent = documentTitle?.value.trim() || currentRender.title;
  $('#review-summary-theme').textContent = `${getTheme(themeSelect.value).name} · v${getTheme(themeSelect.value).version || 1}`;
  $('#review-summary-sync').textContent = wechatBinding.mediaId ? '微信草稿已绑定' : '本机已保存';
  const paused = Boolean(wechatBinding.paused || runtimeConfig.settings?.syncPaused);
  const resumeButton = $('#resume-review');
  if (resumeButton) resumeButton.hidden = !paused;
  const reviewState = $('.review-state');
  if (reviewState) reviewState.textContent = paused ? '审核中 · 已暂停' : '草稿未提交';
  $('#review-dialog').showModal();
}

async function persistReviewPause(paused) {
  runtimeConfig = await apiFetch('/api/config', {
    method: 'PUT',
    body: JSON.stringify({ settings: { syncPaused: Boolean(paused) } }),
  });
  return runtimeConfig;
}

async function confirmReview() {
  wechatBinding.paused = true;
  wechatBinding.status = 'reviewing';
  runtimeConfig.settings.syncPaused = true;
  setState();
  clearTimeout(syncTimer);
  try {
    await persistReviewPause(true);
  } catch {
    // localStorage remains the source of truth when the optional local API is offline.
  }
  $('#review-dialog').close();
  syncStatus.textContent = '审核中 · 自动同步已暂停';
  showToast('已进入审核状态，不会覆盖微信后台的手工修改');
}

async function resumeReview() {
  wechatBinding.paused = false;
  wechatBinding.status = wechatBinding.mediaId ? 'synced' : 'local-only';
  runtimeConfig.settings.syncPaused = false;
  setState();
  try {
    await persistReviewPause(false);
  } catch {
    // Keep local state usable when the optional local API is offline.
  }
  $('#review-dialog').close();
  updateSyncAction();
  syncStatus.textContent = wechatBinding.mediaId ? '草稿已绑定 · 可同步' : '微信未连接';
  scheduleAutoSync();
  showToast('已恢复自动同步');
}

async function copyRichText() {
  // Copy the same inline-styled fragment that is sent to WeChat. The live
  // preview relies on editor CSS classes, which WeChat does not receive when
  // only `preview.innerHTML` is placed on the clipboard.
  const theme = getTheme();
  const styledContent = inlineWechatHtml(currentRender.html, theme);
  const html = `<article class="wechat-article" style="max-width:640px;margin:0 auto;padding:24px 18px 42px;color:${theme.text};font:${theme.bodySize}px/${theme.lineHeight} -apple-system,BlinkMacSystemFont,&quot;PingFang SC&quot;,&quot;Microsoft YaHei&quot;,sans-serif">${styledContent}</article>`;
  const text = currentRender.plainText || preview.innerText;
  try {
    if (navigator.clipboard?.write && window.ClipboardItem) {
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })]);
    } else {
      const holder = document.createElement('div');
      holder.contentEditable = 'true';
      holder.innerHTML = html;
      holder.style.cssText = 'position:fixed;left:-99999px;top:0;opacity:0;pointer-events:none;';
      document.body.append(holder);
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(holder);
      selection.removeAllRanges();
      selection.addRange(range);
      if (!document.execCommand('copy')) throw new Error('COPY_NOT_SUPPORTED');
      selection.removeAllRanges();
      holder.remove();
    }
    showToast('已复制公众号格式，可粘贴到微信后台');
  } catch {
    showToast('浏览器未授权剪贴板，请手动选择预览内容');
  }
}

function setPreviewWidth(width) {
  const normalizedWidth = '375';
  previewFrame.dataset.previewWidth = normalizedWidth;
  previewFrame.style.setProperty('--preview-width', `${normalizedWidth}px`);
  document.querySelectorAll('.width-button').forEach((button) => {
    const selected = button.dataset.width === normalizedWidth;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  const metric = $('.device-metric');
  if (metric) metric.textContent = '375 × 812';
  setState();
}

function loadMarkdown() {
  const stored = getState();
  if (stored?.wechat) wechatBinding = { ...wechatBinding, ...stored.wechat };
  if (stored?.markdown) {
    const repairedMarkdown = normalizeLegacyMultilineFormatting(stored.markdown);
    input.value = repairedMarkdown;
    if (documentTitle && stored.title) documentTitle.value = stored.title;
    if (stored.theme) {
      pendingThemeId = stored.theme;
      if (THEMES[normalizeThemeId(stored.theme)]) themeSelect.value = normalizeThemeId(stored.theme);
    }
    if (stored.width) setPreviewWidth(stored.width);
    applyTheme(themeSelect.value);
    showToast(repairedMarkdown === stored.markdown ? '已从本机恢复上次编辑内容' : '已修复旧版跨段格式，预览已恢复');
    if (repairedMarkdown !== stored.markdown) setState();
    return;
  }
  input.value = DEFAULT_MARKDOWN;
  applyTheme(themeSelect.value);
}

document.querySelectorAll('[data-insert]').forEach((button) => button.addEventListener('click', () => insertAtSelection(button.dataset.insert)));
document.querySelectorAll('.width-button').forEach((button) => button.addEventListener('click', () => setPreviewWidth('375')));
document.querySelectorAll('[data-resource-tab]').forEach((button) => button.addEventListener('click', () => activateResourceTab(button.dataset.resourceTab)));
document.querySelectorAll('[data-template]').forEach((button) => button.addEventListener('click', () => {
  document.querySelectorAll('[data-template]').forEach((item) => item.classList.toggle('selected', item === button));
  const themeId = normalizeThemeId(button.dataset.template);
  if (THEMES[themeId]) {
    applyTheme(themeId);
    setState();
    showToast(`已应用${THEMES[themeId].name}模板`);
  }
}));
document.querySelectorAll('[data-component-type]').forEach((button) => button.addEventListener('click', () => {
  activateResourceTab('templates');
  insertAtSelection(button.dataset.componentType === 'quote' ? '> 一段值得强调的话\n\n' : button.dataset.componentType === 'heading' ? '## 小节标题\n\n' : '\n');
}));

input.addEventListener('input', () => { captureHistory(); render(); scheduleSave(); });
input.addEventListener('paste', (event) => {
  const clipboardText = event.clipboardData?.getData('text/plain') || '';
  if (!clipboardText) return;
  const normalizedText = normalizePastedMarkdown(clipboardText);
  if (normalizedText === clipboardText) return;
  event.preventDefault();
  input.setRangeText(normalizedText, input.selectionStart, input.selectionEnd, 'end');
  captureHistory();
  render();
  scheduleSave();
  showToast('已识别粘贴的图片地址');
});
input.addEventListener('scroll', () => syncPaneScroll('editor'), { passive: true });
canvasStage?.addEventListener('scroll', () => syncPaneScroll('preview'), { passive: true });
documentTitle?.addEventListener('input', () => { updateMeta(); scheduleSave(); });
input.addEventListener('dragover', (event) => event.preventDefault());
input.addEventListener('drop', async (event) => {
  event.preventDefault();
  const file = event.dataTransfer.files?.[0];
  if (file?.name.endsWith('.md') || file?.name.endsWith('.markdown')) {
    input.value = await file.text();
    captureHistory();
    render();
    scheduleSave();
    showToast(`已导入 ${file.name}`);
  }
});

document.querySelectorAll('[data-action]').forEach((button) => button.addEventListener('click', () => {
  const action = button.dataset.action;
  if (action === 'login') { openLoginDialog(); return; }
  if (action === 'logout') { logout().catch(() => {}); return; }
  if (action === 'close-login') { closeLoginDialog(); return; }
  if (action === 'undo') { restoreHistory(historyIndex - 1); return; }
  if (action === 'redo') { restoreHistory(historyIndex + 1); return; }
  if (action === 'preview') {
    const stage = $('#canvas-stage');
    if (stage) {
      stage.scrollTo({ top: 0, behavior: 'smooth' });
      stage.classList.add('preview-focus');
      stage.focus({ preventScroll: true });
      window.setTimeout(() => stage.classList.remove('preview-focus'), 900);
    }
    $('#canvas-mode-label').textContent = '预览模式';
    showToast('已定位到文章预览');
    return;
  }
  if (action === 'back') { openArticlesDialog(); return; }
  if (action === 'markdown-drawer') { focusMarkdownEditor(); return; }
  if (action === 'zoom-out') { setPreviewZoom(previewZoom - 10); return; }
  if (action === 'zoom-in') { setPreviewZoom(previewZoom + 10); return; }
  if (action === 'reload-preview') { reloadPreview(); return; }
  if (action === 'clear-selection') { clearSelection(); return; }
  if (action === 'apply-inspector') { applyInspector(); return; }
  if (action === 'reset-inspector') { resetInspector(); return; }
  if (action === 'settings-test') { testConnection(); return; }
  if (action === 'settings-reset') { resetSettings(); return; }
  if (action === 'inspect-images') { inspectWechatImages().catch(() => {}); return; }
  if (action === 'theme-reset') { populateThemeEditor(); return; }
  if (action === 'theme-copy') { saveThemeEditor({ copy: true }).catch((error) => showToast(error.message)); return; }
  if (action === 'theme-save') { saveThemeEditor().catch((error) => showToast(error.message)); return; }
  if (action === 'new-article') { createNewArticle().catch((error) => showToast(error.message)); return; }
  if (action === 'delete-article') { deleteArticleById(button.dataset.articleId).catch((error) => showToast(error.message)); return; }
  if (action === 'delete-draft') { deleteWechatDraft(); return; }
  if (action === 'export-config') { exportConfig(); return; }
  if (action === 'settings') { populateSettings(); populateThemeEditor(); $('#settings-dialog').showModal(); return; }
  if (action === 'draft') { openDraftDialog(); return; }
  if (action === 'review') {
    openReviewDialog();
    return;
  }
  if (action === 'confirm-review') {
    confirmReview().catch((error) => showToast(error.message));
    return;
  }
  if (action === 'resume-review') {
    resumeReview().catch((error) => showToast(error.message));
    return;
  }
  if (action === 'sync') { if (wechatBinding.mediaId) syncDraft(); else openDraftDialog(); return; }
  if (action === 'import') $('#md-file-input').click();
  if (action === 'export-md') { download(`${currentRender.title || 'article'}.md`, input.value, 'text/markdown;charset=utf-8'); showToast('Markdown 已导出'); }
  if (action === 'export-html') { download(`${currentRender.title || 'article'}.html`, articleExportHtml(), 'text/html;charset=utf-8'); showToast('微信兼容 HTML 已导出'); }
  if (action === 'copy') copyRichText();
  if (action === 'new') { input.value = '# 新文章\n\n从这里开始写。'; captureHistory(); render(); scheduleSave(); showToast('已创建本地新文章'); }
}));

document.querySelectorAll('[data-settings-section]').forEach((button) => button.addEventListener('click', () => activateSettingsSection(button.dataset.settingsSection)));

$('#md-file-input').addEventListener('change', async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  input.value = await file.text();
  captureHistory();
  render();
  scheduleSave();
  showToast(`已导入 ${file.name}`);
  event.target.value = '';
});

$('#auth-login-form')?.addEventListener('submit', submitLogin);
$('#auth-password-toggle')?.addEventListener('click', (event) => {
  const field = $('#auth-password');
  const visible = field.type === 'text';
  field.type = visible ? 'password' : 'text';
  event.currentTarget.textContent = visible ? '显示' : '隐藏';
});

$('#settings-app-secret')?.addEventListener('focus', (event) => {
  if (event.currentTarget.dataset.masked === 'true') {
    event.currentTarget.value = '';
    event.currentTarget.dataset.masked = 'false';
    event.currentTarget.placeholder = '输入新的 AppSecret 可替换';
  }
});
$('#settings-app-secret')?.addEventListener('input', (event) => {
  event.currentTarget.dataset.masked = 'false';
});
$('#settings-app-secret')?.addEventListener('blur', () => updateAppSecretField());

themeSelect.addEventListener('change', () => {
  const selected = getTheme(themeSelect.value);
  applyTheme(selected.id);
  setState();
  persistCurrentArticle();
  showToast(`已应用${selected.name}模板`);
});

$('#theme-editor-select')?.addEventListener('change', (event) => populateThemeEditor(themeRecords.get(event.target.value)));
$('#theme-editor-primary')?.addEventListener('input', (event) => { $('#theme-editor-primary-value').value = event.target.value; });
$('#theme-editor-text')?.addEventListener('input', (event) => { $('#theme-editor-text-value').value = event.target.value; });
$('#theme-editor-primary-value')?.addEventListener('change', (event) => { if (/^#[0-9a-f]{6}$/i.test(event.target.value)) $('#theme-editor-primary').value = event.target.value; });
$('#theme-editor-text-value')?.addEventListener('change', (event) => { if (/^#[0-9a-f]{6}$/i.test(event.target.value)) $('#theme-editor-text').value = event.target.value; });
$('#theme-json')?.addEventListener('input', () => {
  try {
    const draft = JSON.parse($('#theme-json').value);
    const primary = draft.colors?.primary;
    const textColor = draft.colors?.text;
    if (/^#[0-9a-f]{6}$/i.test(primary || '')) { $('#theme-editor-primary').value = primary; $('#theme-editor-primary-value').value = primary; }
    if (/^#[0-9a-f]{6}$/i.test(textColor || '')) { $('#theme-editor-text').value = textColor; $('#theme-editor-text-value').value = textColor; }
    if (draft.typography?.bodySize !== undefined) $('#theme-editor-body-size').value = String(draft.typography.bodySize);
    if (draft.typography?.lineHeight !== undefined) $('#theme-editor-line-height').value = String(draft.typography.lineHeight);
    updateThemeLivePreview(toRuntimeTheme(draft));
    $('#theme-editor-status').textContent = '未保存修改';
  } catch {
    $('#theme-editor-status').textContent = 'JSON 待修正';
  }
});
$('#article-search')?.addEventListener('input', (event) => renderArticleList(event.target.value));

$('#confirm-draft').addEventListener('click', createWechatDraft);
$('#settings-save').addEventListener('click', async () => {
  try { await saveSettings(); } catch (error) { showToast(error.message); }
});

$('#inspector-color').addEventListener('input', (event) => { $('#inspector-color-value').value = event.target.value; });
$('#inspector-color-value').addEventListener('change', (event) => { if (/^#[0-9a-f]{6}$/i.test(event.target.value)) $('#inspector-color').value = event.target.value; });
document.addEventListener('keydown', (event) => {
  const modifier = event.metaKey || event.ctrlKey;
  if (!modifier) return;
  if (event.key.toLowerCase() === 's') { event.preventDefault(); setState(); showToast('已保存到本机'); }
  if (event.key.toLowerCase() === 'z' && !event.shiftKey) { event.preventDefault(); restoreHistory(historyIndex - 1); }
  if ((event.key.toLowerCase() === 'z' && event.shiftKey) || event.key.toLowerCase() === 'y') { event.preventDefault(); restoreHistory(historyIndex + 1); }
  if (event.key.toLowerCase() === 'e') { event.preventDefault(); focusMarkdownEditor(); }
});

loadMarkdown();
captureHistory();
render();
setPreviewWidth('375');
setPreviewZoom(100);
bindWorkspaceSplitter();
updateSyncAction();
updateImageStatus();
updateAuthUi();
loadAuthSession().then(() => Promise.all([loadRuntimeConfig(), loadThemes()]).then(() => loadArticleWorkspace()));
