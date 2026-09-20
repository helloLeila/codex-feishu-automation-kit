import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("sync task store deduplicates active article revisions and rejects stale completion", async () => {
  const { createSyncTaskStore } = await import("../apps/wechat-editor/src/server/sync/sync-task-store.mjs");
  const directory = await mkdtemp(join(tmpdir(), "open-wechat-sync-"));
  try {
    const store = createSyncTaskStore({ directory });
    const first = await store.enqueue({ articleId: "article-1", revision: 18, mode: "full" });
    assert.equal(first.created, true);
    const duplicate = await store.enqueue({ articleId: "article-1", revision: 18, mode: "full" });
    assert.equal(duplicate.created, false);
    assert.equal(duplicate.task.id, first.task.id);
    await assert.rejects(() => store.transition(first.task.id, "synced", { revision: 19 }), (error) => error.code === "STALE_REVISION");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("sync task store pauses after three retryable failures and emits one alert marker", async () => {
  const { createSyncTaskStore } = await import("../apps/wechat-editor/src/server/sync/sync-task-store.mjs");
  const directory = await mkdtemp(join(tmpdir(), "open-wechat-sync-fail-"));
  try {
    const store = createSyncTaskStore({ directory });
    const { task } = await store.enqueue({ articleId: "article-2", revision: 1, mode: "body_only" });
    await store.recordFailure(task.id, { retryable: true, message: "timeout" });
    await store.recordFailure(task.id, { retryable: true, message: "timeout" });
    const final = await store.recordFailure(task.id, { retryable: true, message: "timeout" });
    assert.equal(final.status, "failed_permanent");
    assert.equal(final.alertSent, false);
    const marked = await store.markAlertSent(task.id);
    assert.equal(marked.alertSent, true);
    const again = await store.markAlertSent(task.id);
    assert.equal(again.alertSent, true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
