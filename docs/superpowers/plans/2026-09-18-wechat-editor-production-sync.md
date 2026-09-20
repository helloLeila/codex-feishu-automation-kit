# 公众号编辑器生产化同步 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将当前原型升级为 CodeMirror 6 + 服务端微信 HTML 预览 + 可恢复 AI/图片/微信同步任务系统。

**Architecture:** 浏览器只负责编辑和预览；Node 服务端提供 AI、图片、微信和认证适配器。文章 revision 和同步任务状态保存在 `/data/config`，同一文章的活动任务通过任务存储的幂等键约束。

**Tech Stack:** Node.js ESM、CodeMirror 6、esbuild、可选 sharp、JSON 文件存储、Node 内置测试、Docker Compose。

---

### Task 1: 锁定数据版本与任务状态行为

**Files:**
- Create: `apps/wechat-editor/src/server/sync/sync-errors.mjs`
- Create: `apps/wechat-editor/src/server/sync/sync-task-store.mjs`
- Modify: `apps/wechat-editor/src/server/article-store.mjs`
- Test: `tests/wechat-sync-task-store.test.mjs`
- Test: `tests/wechat-sync-state.test.mjs`

- [ ] Write tests for revision increments, one active task per `articleId + revision`, stale task rejection, and retry classification.
- [ ] Run `node --test tests/wechat-sync-task-store.test.mjs tests/wechat-sync-state.test.mjs` and observe missing-module failures.
- [ ] Implement JSON-backed task store with atomic writes and explicit state transitions.
- [ ] Add `revision` and `ownerId` defaults to article normalization; increment revision on meaningful article edits.
- [ ] Run the focused tests and then `npm test`.

### Task 2: Add AI adapters and metadata orchestration

**Files:**
- Create: `apps/wechat-editor/src/server/ai/ai-text-provider.mjs`
- Create: `apps/wechat-editor/src/server/ai/ai-image-provider.mjs`
- Create: `apps/wechat-editor/src/server/ai/metadata-service.mjs`
- Test: `tests/wechat-ai-provider.test.mjs`

- [ ] Add failing tests for JSON metadata validation, non-2xx model responses, and image URL extraction.
- [ ] Implement DeepSeek-compatible chat completion adapter with strict JSON output normalization.
- [ ] Implement GLM-Image adapter with prompt and size validation.
- [ ] Implement orchestration that preserves a user-supplied title and only generates missing fields.
- [ ] Run focused tests and `npm run check`.

### Task 3: Add cover processing and email notification seams

**Files:**
- Create: `apps/wechat-editor/src/server/media/cover-processor.mjs`
- Create: `apps/wechat-editor/src/server/email/mailer.mjs`
- Test: `tests/wechat-cover-processor.test.mjs`

- [ ] Add tests for URL size limits, unsupported MIME, and optional sharp dependency behavior.
- [ ] Implement download, dimension validation, JPEG conversion, and a dependency-injected uploader callback.
- [ ] Implement SMTP mailer using `fetchImpl`/transport injection so tests never send mail.
- [ ] Run focused tests.

### Task 4: Add CodeMirror 6 build with safe fallback

**Files:**
- Modify: `package.json`
- Create: `scripts/build-wechat-editor.mjs`
- Create: `apps/wechat-editor/src/editor-codemirror.mjs`
- Modify: `apps/wechat-editor/index.html`
- Modify: `apps/wechat-editor/src/app.mjs`
- Test: `tests/wechat-editor-codemirror.test.mjs`

- [ ] Add a structural test requiring the CodeMirror mount element and build script.
- [ ] Add CodeMirror dependencies and an esbuild browser bundle entry.
- [ ] Replace textarea event wiring with a small editor adapter; preserve textarea fallback when the bundle is absent.
- [ ] Run `npm run build:editor` and the structural test.

### Task 5: Connect server routes and worker orchestration

**Files:**
- Create: `apps/wechat-editor/src/server/sync/sync-service.mjs`
- Modify: `scripts/start-wechat-editor.mjs`
- Modify: `apps/wechat-editor/src/server/wechat-client.mjs`
- Test: `tests/wechat-sync-service.test.mjs`

- [ ] Add tests for full/body_only/regenerate_metadata mode routing, revision conflict, `submitted_unknown`, and three-failure pause.
- [ ] Implement service-level idempotency and request classification.
- [ ] Add `/api/ai/metadata`, `/api/ai/cover`, `/api/sync/tasks`, and `/api/sync/tasks/:id` routes.
- [ ] Keep legacy draft routes as compatibility wrappers that create a task first.
- [ ] Run focused tests and the complete test suite.

### Task 6: Add registration and user-facing configuration

**Files:**
- Create: `apps/wechat-editor/src/server/auth/user-store.mjs`
- Create: `apps/wechat-editor/src/server/auth/email-verification.mjs`
- Modify: `apps/wechat-editor/src/server/auth.mjs`
- Modify: `scripts/start-wechat-editor.mjs`
- Modify: `apps/wechat-editor/index.html`
- Modify: `apps/wechat-editor/src/app.mjs`
- Test: `tests/wechat-email-auth.test.mjs`

- [ ] Add tests for password hashing, email uniqueness, code expiry, and verification attempt limits.
- [ ] Implement user store and opt-in registration routes without changing current single-user environment behavior.
- [ ] Add AI settings fields that describe server environment variables without echoing secrets.
- [ ] Run the focused tests.

### Task 7: Docker, environment contract, and final verification

**Files:**
- Modify: `Dockerfile`
- Modify: `docker-compose.yml`
- Modify: `.env.example`
- Modify: `README.md`
- Test: `tests/wechat-editor-deploy-script.test.mjs`

- [ ] Add multi-stage build for the CodeMirror bundle and optional worker command.
- [ ] Document `/opt/services/open-wechat-editor`, `.env.local`, volumes, health check, and regional image override.
- [ ] Run `npm run check`, `npm test`, `npm run build:editor`, and `docker build .`.
- [ ] Start the local container and verify `/api/health`, editor shell, and a task status response.
