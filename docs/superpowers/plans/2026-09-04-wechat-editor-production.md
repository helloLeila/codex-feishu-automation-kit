# 微信公众号编辑器生产化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将当前本机 Markdown 原型补齐为可持续使用的公众号编辑工作台，覆盖多文章本地管理、微信草稿完整生命周期、图片预检与重试、主题 JSON 编辑、持久化和开源部署。

**Architecture:** 保持前后端分离边界不变：浏览器只调用本机 Node API，微信凭证和远端请求只在服务端处理。文章和主题使用本机 JSON 文件存储，避免引入数据库依赖；前端保留 localStorage 作为离线草稿缓存，并通过文章 API 显式保存/切换。微信草稿采用“首次手动创建、后续只更新同一 media_id、删除前二次确认”的状态机。

**Tech Stack:** Node.js 18+、原生 ESM、Node `node:test`、原生 HTML/CSS/JavaScript、微信公众平台草稿接口、JSON 文件存储。

---

### Task 1: 建立文章本地数据模型与文件存储

**Files:**
- Create: `apps/wechat-editor/src/server/article-store.mjs`
- Modify: `apps/wechat-editor/src/server/config-store.mjs`
- Modify: `scripts/start-wechat-editor.mjs`
- Test: `tests/wechat-article-store.test.mjs`

- [ ] **Step 1: Write the failing test**

测试必须覆盖：创建文章生成稳定 id；保存后可列出和读取；删除只删除指定文章；文件写入为私有权限。

```js
test('article store creates, lists, reads, and deletes local articles', async () => {
  const store = createArticleStore({ directory });
  const created = await store.create({ title: '第一篇', markdown: '# 正文', themeId: 'clear-reading' });
  assert.match(created.id, /^article-/);
  assert.equal((await store.list())[0].title, '第一篇');
  assert.equal((await store.get(created.id)).markdown, '# 正文');
  await store.remove(created.id);
  assert.equal(await store.get(created.id), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/wechat-article-store.test.mjs`

Expected: FAIL because `article-store.mjs` and `createArticleStore` do not exist.

- [ ] **Step 3: Write minimal implementation**

实现 `createArticleStore({ directory })`，使用 `articles.json` 保存数组；每个条目包含 `id/title/markdown/themeId/createdAt/updatedAt/wechat`；写入临时文件后 rename，并设置目录 `0700`、文件 `0600`。

- [ ] **Step 4: Add API routes and verify**

在 `scripts/start-wechat-editor.mjs` 增加：

```text
GET    /api/articles
POST   /api/articles
GET    /api/articles/:id
PUT    /api/articles/:id
DELETE /api/articles/:id
```

Run: `node --test tests/wechat-article-store.test.mjs tests/wechat-editor-prototype.test.mjs`

Expected: PASS。

---

### Task 2: 完成微信草稿生命周期和错误重试

**Files:**
- Modify: `apps/wechat-editor/src/server/wechat-client.mjs`
- Modify: `scripts/start-wechat-editor.mjs`
- Modify: `apps/wechat-editor/src/app.mjs`
- Modify: `apps/wechat-editor/index.html`
- Test: `tests/wechat-config-sync.test.mjs`
- Test: `tests/wechat-draft-lifecycle.test.mjs`

- [ ] **Step 1: Write failing API/client tests**

覆盖 `deleteDraft(mediaId)`、`getDraft(mediaId)`、失败不自动创建新草稿、失败后显式重试。

```js
await client.deleteDraft('draft-1');
assert.equal(calls.at(-1).url.includes('/cgi-bin/draft/delete'), true);
assert.match(calls.at(-1).options.body, /"media_id":"draft-1"/);
```

- [ ] **Step 2: Run tests to verify failure**

Run: `node --test tests/wechat-draft-lifecycle.test.mjs`

Expected: FAIL because delete endpoint and retry state are absent.

- [ ] **Step 3: Implement server lifecycle**

增加 `deleteDraft` 客户端方法和 `DELETE /api/wechat/draft/:mediaId` 路由；更新文章记录中的 `wechat.status` 为 `creating/synced/sync-failed/reviewing/deleted`；所有更新失败只保留原 media_id，不调用 add。

- [ ] **Step 4: Implement visible retry state**

前端保存 `lastSyncError` 与 `retryable`；同步失败时将主按钮文案改为“重试同步”，点击再次调用 update；创建失败保持“创建微信草稿”，避免重复创建；删除草稿弹窗必须显示文章标题和 media_id 前缀并二次确认。

- [ ] **Step 5: Verify full lifecycle**

Run: `node --test tests/wechat-config-sync.test.mjs tests/wechat-draft-lifecycle.test.mjs tests/wechat-editor-prototype.test.mjs`

Expected: PASS。

---

### Task 3: 图片预检、逐图状态和失败重试

**Files:**
- Modify: `apps/wechat-editor/src/server/wechat-client.mjs`
- Modify: `scripts/start-wechat-editor.mjs`
- Modify: `apps/wechat-editor/src/app.mjs`
- Modify: `apps/wechat-editor/index.html`
- Modify: `apps/wechat-editor/styles.css`
- Test: `tests/wechat-image-preflight.test.mjs`

- [ ] **Step 1: Write failing preflight tests**

测试 HTTPS OSS 图片、已托管微信图片、本地 `/assets` 图片、404、非 JPG/PNG 和重复 URL 的结果。

```js
const result = await client.inspectImages('<img src="https://cdn.example.com/a.png">');
assert.deepEqual(result.images[0].status, 'ready');
```

- [ ] **Step 2: Run test to verify failure**

Run: `node --test tests/wechat-image-preflight.test.mjs`

Expected: FAIL because `inspectImages` 不存在。

- [ ] **Step 3: Implement inspect and bounded retry**

服务端新增 `inspectImages(content)`，只读取图片响应头和大小；结果使用 `ready/already-hosted/invalid/unreachable/unsupported`。上传失败只重试两次，指数等待 `250ms/750ms`，随后返回可读错误，不创建新草稿。

- [ ] **Step 4: Add image status UI**

在预览底部增加紧凑状态行：图片数量、待处理数量、最近错误；同步前先调用 `/api/wechat/images/inspect`，存在 invalid 时阻止同步；失败项旁提供“重试图片检查”，不增加新的上传按钮。

- [ ] **Step 5: Verify image flow**

Run: `node --test tests/wechat-image-preflight.test.mjs tests/wechat-config-sync.test.mjs`

Expected: PASS。

---

### Task 4: 主题 JSON 编辑器与版本化应用

**Files:**
- Create: `apps/wechat-editor/src/theme-schema.mjs`
- Modify: `apps/wechat-editor/src/app.mjs`
- Modify: `apps/wechat-editor/index.html`
- Modify: `apps/wechat-editor/styles.css`
- Modify: `apps/wechat-editor/themes/*.json`
- Test: `tests/wechat-theme-editor.test.mjs`

- [ ] **Step 1: Write failing schema and version tests**

验证主题必须有 id/name/colors/typography；保存自定义主题生成 `custom-<slug>` 和递增 version；非法颜色和字号被拒绝。

- [ ] **Step 2: Run test to verify failure**

Run: `node --test tests/wechat-theme-editor.test.mjs`

Expected: FAIL because schema validation and custom theme API are absent。

- [ ] **Step 3: Implement theme schema and API**

新增 `validateTheme`、`normalizeTheme`、`nextThemeVersion`；服务端增加 `GET/POST/PUT/DELETE /api/themes`，自定义主题保存到配置目录 `themes/*.json`，内置主题只读。

- [ ] **Step 4: Replace fixed theme list with editor controls**

设置中心增加“主题管理”分组：主题名称、主色、正文色、标题色、引用背景、正文大小、行高、段落间距、图片圆角；提供实时预览、保存、复制为新主题、恢复默认。主题选择只影响渲染和导出，不改 Markdown。

- [ ] **Step 5: Verify theme export**

Run: `node --test tests/wechat-theme-editor.test.mjs tests/wechat-html.test.mjs`

Expected: PASS。

---

### Task 5: 多文章工作区与本机/服务端同步

**Files:**
- Modify: `apps/wechat-editor/index.html`
- Modify: `apps/wechat-editor/src/app.mjs`
- Modify: `apps/wechat-editor/styles.css`
- Modify: `tests/wechat-editor-prototype.test.mjs`
- Create: `tests/wechat-articles-api.test.mjs`

- [ ] **Step 1: Write failing UI/API tests**

验证文章列表入口、当前文章切换、新建、复制、删除、搜索标题和未保存状态。

- [ ] **Step 2: Run test to verify failure**

Run: `node --test tests/wechat-articles-api.test.mjs`

Expected: FAIL because article routes and list UI are absent。

- [ ] **Step 3: Implement list drawer**

在左上角标题栏保留当前文章标题，返回按钮打开文章抽屉；抽屉显示搜索框、文章标题、更新时间、微信状态和“新建文章”；选择文章前先保存当前本机草稿。

- [ ] **Step 4: Wire persistence and recovery**

文章切换使用 `/api/articles/:id`；离线时退回 localStorage；恢复时比较 `updatedAt` 和 `savedAt`，冲突显示“本机版本/文件版本”二选一，不静默覆盖。

- [ ] **Step 5: Verify article workflow**

Run: `node --test tests/wechat-articles-api.test.mjs tests/wechat-editor-prototype.test.mjs`

Expected: PASS。

---

### Task 6: 开源启动、Docker 和配置文档

**Files:**
- Create: `Dockerfile`
- Create: `docker-compose.yml`
- Create: `.env.example`
- Modify: `README.md`
- Modify: `docs/release-checklist.md`
- Test: `tests/editor-startup-docs.test.mjs`

- [ ] **Step 1: Write failing startup contract test**

验证 README 包含 Node 18+、`npm install`、`npm start`、端口、配置目录和 Docker 命令；`.env.example` 只含占位符，不含真实密钥。

- [ ] **Step 2: Run test to verify failure**

Run: `node --test tests/editor-startup-docs.test.mjs`

Expected: FAIL because Docker and startup contract files are absent。

- [ ] **Step 3: Implement startup artifacts**

`Dockerfile` 使用 Node 20 slim，工作目录 `/app`，暴露 `3210`；`docker-compose.yml` 挂载 `./data:/data`，设置 `OPEN_WECHAT_EDITOR_CONFIG_DIR=/data/config`；`.env.example` 提供 AppID、AppSecret、API 地址和端口占位符。

- [ ] **Step 4: Document clone-to-run and security boundaries**

README 写清：本地运行、Docker 运行、微信公众号 IP 白名单、AppSecret 只在服务端、文章数据目录、主题目录、备份恢复、图片必须 HTTPS、微信后台手工审核流程。

- [ ] **Step 5: Verify package**

Run: `node --test tests/editor-startup-docs.test.mjs && npm run check && npm test`

Expected: 所有测试通过。

---

### Final Verification

- [ ] `npm test` 全部通过。
- [ ] `npm run check` 通过。
- [ ] `npm start` 启动后可打开 `http://127.0.0.1:3210/`。
- [ ] 浏览器验证：创建文章 → 修改主题 → 预检图片 → 创建微信草稿 → 修改后重试同步 → 进入审核暂停自动同步 → 删除草稿。
- [ ] 浏览器验证：刷新后本机文章、主题和微信绑定状态可恢复。
- [ ] 检查仓库没有 `.env.local`、真实 AppSecret、access_token 或微信 Cookie。
