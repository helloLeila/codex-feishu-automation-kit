import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("regenerate_metadata generates a cover, uploads a permanent thumb, and creates one full draft", async () => {
  const { createArticleStore } = await import("../apps/wechat-editor/src/server/article-store.mjs");
  const { createSyncTaskStore } = await import("../apps/wechat-editor/src/server/sync/sync-task-store.mjs");
  const { createSyncService } = await import("../apps/wechat-editor/src/server/sync/sync-service.mjs");
  const directory = await mkdtemp(join(tmpdir(), "open-wechat-sync-service-"));
  try {
    const articleStore = createArticleStore({ directory });
    const taskStore = createSyncTaskStore({ directory });
    const article = await articleStore.create({ title: "原始标题", markdown: "# 正文" });
    const calls = [];
    const service = createSyncService({
      articleStore,
      taskStore,
      metadataService: { generate: async () => ({ title: "AI 标题", digest: "AI 摘要", coverPrompt: "AI 封面", cover: { sourceUrl: "https://img.example/cover.png" } }) },
      coverProcessor: { processUrl: async () => ({ buffer: Buffer.from([1, 2]), mime: "image/jpeg" }) },
      getClient: async () => ({
        uploadPermanentImage: async () => { calls.push("upload-cover"); return { media_id: "thumb-ai" }; },
        addDraft: async (payload) => { calls.push({ add: payload }); return { media_id: "draft-ai" }; },
      }),
    });
    const queued = await service.enqueue({ articleId: article.id, mode: "regenerate_metadata", payload: { content: "<p>正文</p>" } });
    await service.execute(queued.task.id);
    const task = await taskStore.get(queued.task.id);
    assert.equal(task.status, "synced");
    assert.deepEqual(calls, ["upload-cover", { add: { content: "<p>正文</p>", title: "AI 标题", digest: "AI 摘要", coverSourceUrl: "https://img.example/cover.png", thumb_media_id: "thumb-ai" } }]);
    const saved = await articleStore.get(article.id);
    assert.equal(saved.metadata.coverMediaId, "thumb-ai");
    assert.equal(saved.metadata.digest, "AI 摘要");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("submitted_unknown can be manually resolved without calling draft/add again", async () => {
  const { createArticleStore } = await import("../apps/wechat-editor/src/server/article-store.mjs");
  const { createSyncTaskStore } = await import("../apps/wechat-editor/src/server/sync/sync-task-store.mjs");
  const { createSyncService } = await import("../apps/wechat-editor/src/server/sync/sync-service.mjs");
  const directory = await mkdtemp(join(tmpdir(), "open-wechat-sync-recover-"));
  try {
    const articleStore = createArticleStore({ directory });
    const taskStore = createSyncTaskStore({ directory });
    const article = await articleStore.create({ title: "未知结果", markdown: "# 正文" });
    const service = createSyncService({
      articleStore,
      taskStore,
      getClient: async () => ({
        addDraft: async () => { throw Object.assign(new Error("响应超时"), { code: "ETIMEDOUT" }); },
      }),
    });
    const queued = await service.enqueue({ articleId: article.id, mode: "full", payload: { title: "未知结果", content: "<p>正文</p>" } });
    await assert.rejects(() => service.execute(queued.task.id), (error) => error.code === "SUBMITTED_UNKNOWN");
    const unknown = await taskStore.get(queued.task.id);
    assert.equal(unknown.status, "submitted_unknown");

    const recovered = await service.resolveSubmittedUnknown(queued.task.id, { mediaId: "draft-recovered" });
    assert.equal(recovered.status, "synced");
    assert.equal(recovered.mediaId, "draft-recovered");
    const saved = await articleStore.get(article.id);
    assert.equal(saved.wechat.mediaId, "draft-recovered");
    assert.equal(saved.wechat.status, "synced");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("retryable sync failures are executed up to three times before succeeding", async () => {
  const { createArticleStore } = await import("../apps/wechat-editor/src/server/article-store.mjs");
  const { createSyncTaskStore } = await import("../apps/wechat-editor/src/server/sync/sync-task-store.mjs");
  const { createSyncService } = await import("../apps/wechat-editor/src/server/sync/sync-service.mjs");
  const directory = await mkdtemp(join(tmpdir(), "open-wechat-sync-retry-"));
  try {
    const articleStore = createArticleStore({ directory });
    const taskStore = createSyncTaskStore({ directory });
    const article = await articleStore.create({ title: "重试文章", markdown: "# 正文", wechat: { mediaId: "draft-existing" } });
    let attempts = 0;
    const service = createSyncService({
      articleStore,
      taskStore,
      retryDelayMs: 0,
      getClient: async () => ({
        updateDraft: async () => {
          attempts += 1;
          if (attempts < 3) throw Object.assign(new Error("临时超时"), { code: "ETIMEDOUT" });
          return { media_id: "draft-retried" };
        },
      }),
    });
    const queued = await service.enqueue({ articleId: article.id, mode: "body_only", payload: { title: "重试文章", content: "<p>正文</p>" } });
    const result = await service.executeWithRetry(queued.task.id);
    assert.equal(result.status, "synced");
    assert.equal(attempts, 3);
    assert.equal((await taskStore.get(queued.task.id)).attempts, 2);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
