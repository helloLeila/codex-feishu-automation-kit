import { randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { staleRevisionError } from "./sync-errors.mjs";

const TASK_FILE = "sync-tasks.json";
const ACTIVE_STATES = new Set(["queued", "running", "retry_wait", "submitted_unknown"]);

function now() {
  return new Date().toISOString();
}

async function readTasks(path) {
  try {
    const value = JSON.parse(await readFile(path, "utf8"));
    return Array.isArray(value) ? value : [];
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
}

async function writeTasks(path, tasks) {
  await mkdir(join(path, ".."), { recursive: true, mode: 0o700 });
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, `${JSON.stringify(tasks, null, 2)}\n`, { mode: 0o600 });
  await chmod(temp, 0o600);
  await rename(temp, path);
  await chmod(path, 0o600);
}

function taskKey(task) {
  return `${task.articleId}:${task.revision}`;
}

export function createSyncTaskStore({ directory, maxAttempts = 3 } = {}) {
  if (!directory) throw new Error("同步任务存储需要配置 directory");
  const path = join(directory, TASK_FILE);
  let lock = Promise.resolve();

  async function serial(operation) {
    const next = lock.then(operation, operation);
    lock = next.catch(() => {});
    return next;
  }

  async function find(id) {
    const tasks = await readTasks(path);
    return tasks.find((task) => task.id === id) || null;
  }

  return {
    directory,
    async list() {
      return readTasks(path);
    },
    async get(id) {
      return find(id);
    },
    async enqueue(input = {}) {
      return serial(async () => {
        const tasks = await readTasks(path);
        const existing = tasks.find((task) => task.articleId === input.articleId && Number(task.revision) === Number(input.revision) && ACTIVE_STATES.has(task.status));
        if (existing) return { created: false, task: existing };
        const timestamp = now();
        const task = {
          id: `sync-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`,
          key: `${input.articleId}:${input.revision}`,
          articleId: String(input.articleId || ""),
          ownerId: input.ownerId || null,
          revision: Number(input.revision || 0),
          mode: input.mode || "full",
          status: "queued",
          attempts: 0,
          maxAttempts,
          alertSent: false,
          requestFingerprint: input.requestFingerprint || null,
          payload: input.payload || {},
          createdAt: timestamp,
          updatedAt: timestamp,
          error: null,
        };
        tasks.unshift(task);
        await writeTasks(path, tasks);
        return { created: true, task };
      });
    },
    async transition(id, status, patch = {}) {
      return serial(async () => {
        const tasks = await readTasks(path);
        const index = tasks.findIndex((task) => task.id === id);
        if (index === -1) return null;
        const current = tasks[index];
        if (patch.revision !== undefined && Number(patch.revision) !== Number(current.revision)) throw staleRevisionError();
        const next = { ...current, ...patch, status, updatedAt: now() };
        delete next.revisionCheck;
        tasks[index] = next;
        await writeTasks(path, tasks);
        return next;
      });
    },
    async recordFailure(id, { retryable = false, message = "同步失败", code = null } = {}) {
      return serial(async () => {
        const tasks = await readTasks(path);
        const index = tasks.findIndex((task) => task.id === id);
        if (index === -1) return null;
        const current = tasks[index];
        const attempts = Number(current.attempts || 0) + 1;
        const permanent = !retryable || attempts >= Number(current.maxAttempts || maxAttempts);
        const next = {
          ...current,
          attempts,
          status: permanent ? "failed_permanent" : "retry_wait",
          retryable: !permanent,
          error: { message: String(message), code },
          updatedAt: now(),
        };
        tasks[index] = next;
        await writeTasks(path, tasks);
        return next;
      });
    },
    async markAlertSent(id) {
      return serial(async () => {
        const tasks = await readTasks(path);
        const index = tasks.findIndex((task) => task.id === id);
        if (index === -1) return null;
        tasks[index] = { ...tasks[index], alertSent: true, updatedAt: now() };
        await writeTasks(path, tasks);
        return tasks[index];
      });
    },
    async markSubmittedUnknown(id, patch = {}) {
      return this.transition(id, "submitted_unknown", { ...patch, submittedUnknownAt: now() });
    },
    async activeForArticle(articleId) {
      const tasks = await readTasks(path);
      return tasks.filter((task) => task.articleId === articleId && ACTIVE_STATES.has(task.status));
    },
    taskKey,
  };
}

export { ACTIVE_STATES, TASK_FILE };
