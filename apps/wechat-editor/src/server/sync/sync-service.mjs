import { classifySyncError } from "./sync-errors.mjs";

function requestFingerprint(payload = {}) {
  return `${payload.title || ""}|${payload.content || ""}|${payload.thumb_media_id || ""}`.slice(0, 512);
}

function isUnknownOutcome(error) {
  return ["ETIMEDOUT", "ECONNRESET", "UND_ERR_CONNECT_TIMEOUT", "WECHAT_RESPONSE_UNKNOWN"].includes(error?.code) || error?.unknownOutcome === true;
}

export function createSyncService({ articleStore, taskStore, getClient, metadataService, coverProcessor, mailer, retryDelayMs = 250 } = {}) {
  if (!articleStore || !taskStore || !getClient) throw new Error("sync service 缺少 articleStore、taskStore 或 getClient");

  async function enqueue({ articleId, mode = "full", payload = {}, ownerId = null } = {}) {
    let article = await articleStore.get(articleId);
    if (!article) throw Object.assign(new Error("文章不存在。"), { code: "ARTICLE_NOT_FOUND", status: 404 });
    let nextPayload = { ...payload };
    if (mode === "regenerate_metadata") {
      if (!metadataService) throw Object.assign(new Error("AI 元数据服务尚未配置。"), { code: "AI_NOT_CONFIGURED", status: 503 });
      const generated = await metadataService.generate({ markdown: article.markdown, title: article.title, includeCover: true });
      article = await articleStore.update(article.id, { title: generated.title, metadata: { ...(article.metadata || {}), digest: generated.digest, coverPrompt: generated.coverPrompt, coverSourceUrl: generated.cover?.sourceUrl || '' } });
      nextPayload = { ...nextPayload, title: generated.title, digest: generated.digest, coverSourceUrl: generated.cover?.sourceUrl || '' };
      mode = "full";
    }
    if (!article.revision) article = await articleStore.update(article.id, { revision: 1 });
    const result = await taskStore.enqueue({ articleId: article.id, revision: article.revision, mode, ownerId, payload: nextPayload, requestFingerprint: requestFingerprint(nextPayload) });
    return { ...result, article };
  }

  async function execute(taskId) {
    const task = await taskStore.get(taskId);
    if (!task) return null;
    if (!["queued", "retry_wait"].includes(task.status)) return task;
    const article = await articleStore.get(task.articleId);
    if (!article || Number(article.revision) !== Number(task.revision)) return taskStore.transition(task.id, "stale");
    await taskStore.transition(task.id, "running", { revision: task.revision });
    let payload = { ...(task.payload || {}) };
    let submittedUnknown = false;
    try {
      const client = await getClient();
      if (payload.coverSourceUrl && !payload.thumb_media_id) {
        if (!coverProcessor || typeof client.uploadPermanentImage !== "function") throw Object.assign(new Error("封面上传服务尚未配置。"), { code: "COVER_UPLOAD_NOT_CONFIGURED", status: 503 });
        const processed = await coverProcessor.processUrl(payload.coverSourceUrl);
        const uploaded = await client.uploadPermanentImage(processed.buffer, "cover.jpg", processed.mime);
        payload = { ...payload, thumb_media_id: uploaded.media_id };
        await articleStore.update(article.id, { metadata: { ...(article.metadata || {}), coverMediaId: uploaded.media_id } }, { bumpRevision: false });
      }
      let result;
      if (task.mode === "body_only") {
        if (!article.wechat?.mediaId) throw Object.assign(new Error("body_only 同步需要已绑定的微信草稿。"), { code: "DRAFT_MEDIA_ID_REQUIRED" });
        result = await client.updateDraft(article.wechat.mediaId, payload, article.wechat.index || 0);
      } else if (article.wechat?.mediaId) {
        result = await client.updateDraft(article.wechat.mediaId, payload, article.wechat.index || 0);
      } else {
        try {
          result = await client.addDraft(payload);
        } catch (error) {
          if (isUnknownOutcome(error)) {
            submittedUnknown = true;
            await taskStore.markSubmittedUnknown(task.id, { requestFingerprint: task.requestFingerprint, error: { message: error.message, code: error.code || "WECHAT_RESPONSE_UNKNOWN" } });
          }
          throw error;
        }
      }
      const current = await articleStore.get(article.id);
      if (!current || Number(current.revision) !== Number(task.revision)) return taskStore.transition(task.id, "stale");
      const mediaId = result?.media_id || article.wechat?.mediaId || null;
      await articleStore.update(article.id, { wechat: { ...(article.wechat || {}), mediaId, status: "synced", lastSyncError: null, retryable: false, syncedAt: new Date().toISOString() } });
      return taskStore.transition(task.id, "synced", { mediaId, revision: task.revision, result: { mediaId } });
    } catch (error) {
      if (submittedUnknown) {
        await articleStore.update(article.id, { wechat: { ...(article.wechat || {}), status: "submitted_unknown", retryable: false, lastSyncError: error.message, paused: true } });
        throw Object.assign(new Error("微信草稿创建结果未知，任务已暂停；请先查询微信草稿，禁止重复创建。"), { code: "SUBMITTED_UNKNOWN", status: 502, cause: error });
      }
      const classification = classifySyncError(error);
      const failed = await taskStore.recordFailure(task.id, { retryable: classification.retryable, message: error.message, code: classification.code });
      if (failed?.status === "failed_permanent" && !failed.alertSent && mailer) {
        try {
          await mailer.sendSyncFailure({ articleId: task.articleId, taskId: task.id, message: error.message, attempts: failed.attempts });
          await taskStore.markAlertSent(task.id);
        } catch {
          // Notification failure must not hide the sync failure state.
        }
      }
      await articleStore.update(article.id, { wechat: { ...(article.wechat || {}), status: "sync-failed", retryable: Boolean(failed?.retryable), lastSyncError: error.message, paused: failed?.status === "failed_permanent" } });
      throw error;
    }
  }

  async function executeWithRetry(taskId, { delayMs = retryDelayMs } = {}) {
    let lastError = null;
    while (true) {
      try {
        return await execute(taskId);
      } catch (error) {
        lastError = error;
        const task = await taskStore.get(taskId);
        if (!task || task.status !== "retry_wait") throw error;
        const delay = Math.max(0, Number(delayMs || 0) * (2 ** Math.max(0, Number(task.attempts || 1) - 1)));
        if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    // The loop exits only by returning or throwing; keep the local binding for debuggers.
    throw lastError;
  }

  async function resolveSubmittedUnknown(taskId, { mediaId } = {}) {
    const task = await taskStore.get(taskId);
    if (!task) throw Object.assign(new Error("同步任务不存在。"), { code: "SYNC_TASK_NOT_FOUND", status: 404 });
    if (task.status !== "submitted_unknown") {
      throw Object.assign(new Error("只有 submitted_unknown 任务可以人工收敛。"), { code: "SYNC_TASK_NOT_RESOLVABLE", status: 409 });
    }
    const normalizedMediaId = String(mediaId || "").trim();
    if (!normalizedMediaId) throw Object.assign(new Error("人工收敛需要填写微信草稿 media_id。"), { code: "MEDIA_ID_REQUIRED", status: 400 });
    const article = await articleStore.get(task.articleId);
    if (!article) throw Object.assign(new Error("文章不存在。"), { code: "ARTICLE_NOT_FOUND", status: 404 });
    if (Number(article.revision) !== Number(task.revision)) {
      await taskStore.transition(task.id, "stale", { revision: task.revision });
      throw Object.assign(new Error("文章已经产生新 revision，未知结果不能绑定到新版本。"), { code: "STALE_REVISION", status: 409 });
    }
    const now = new Date().toISOString();
    await articleStore.update(article.id, {
      wechat: {
        ...(article.wechat || {}),
        mediaId: normalizedMediaId,
        status: "synced",
        paused: false,
        retryable: false,
        lastSyncError: null,
        syncedAt: now,
      },
    }, { bumpRevision: false });
    return taskStore.transition(task.id, "synced", {
      revision: task.revision,
      mediaId: normalizedMediaId,
      result: { mediaId: normalizedMediaId, recovered: true },
      resolvedAt: now,
    });
  }

  return { enqueue, execute, executeWithRetry, resolveSubmittedUnknown, isUnknownOutcome };
}

export { isUnknownOutcome, requestFingerprint };
