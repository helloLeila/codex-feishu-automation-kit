import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const localConfigPath = path.join(rootDir, "tech-events-assistant.local.json");

async function readOptionalFile(filePath) {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function listLocalConfigBackups() {
  const names = await readdir(rootDir);
  return new Set(names.filter((name) => name.startsWith("tech-events-assistant.local.json.bak-")));
}

test("menu returns after an action so the next number is handled by the CLI", async () => {
  const child = spawn(process.execPath, ["scripts/gba.mjs"], {
    cwd: rootDir,
    env: { ...process.env, NO_COLOR: "1" },
  });
  let stdout = "";
  let stderr = "";
  let sentInstall = false;
  let sentExit = false;

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
    if (!sentInstall && (stdout.match(/安装 \/ 更新活动助手/g) ?? []).length === 1) {
      sentInstall = true;
      child.stdin.write("1\n");
    }
    if (!sentExit && (stdout.match(/安装 \/ 更新活动助手/g) ?? []).length === 2) {
      sentExit = true;
      child.stdin.write("0\n");
      child.stdin.end();
    }
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  const status = await new Promise((resolve) => {
    child.on("exit", (code) => resolve(code));
  });

  assert.equal(status, 0);
  assert.equal((stdout.match(/安装 \/ 更新活动助手/g) ?? []).length, 2);
  assert.equal((stdout.match(/技术活动助手/g) ?? []).length, 1);
  assert.equal(stdout.includes("继续选择下一步"), true);
  assert.equal(stdout.includes("进度条演示"), false);
  assert.equal(stderr, "");
});

test("configuration can be skipped without breaking the menu loop", async () => {
  const child = spawn(process.execPath, ["scripts/gba.mjs"], {
    cwd: rootDir,
    env: { ...process.env, NO_COLOR: "1" },
  });
  let stdout = "";
  let stderr = "";
  let sentConfig = false;
  let sentExit = false;

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
    if (!sentConfig && (stdout.match(/安装 \/ 更新活动助手/g) ?? []).length === 1) {
      sentConfig = true;
      child.stdin.write("2\n\n\n\nn\n");
    }
    if (!sentExit && stdout.includes("未保存，原配置保持不变")) {
      sentExit = true;
      child.stdin.write("0\n");
      child.stdin.end();
    }
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });

  const status = await new Promise((resolve) => {
    child.on("exit", (code) => resolve(code));
  });

  assert.equal(status, 0);
  assert.equal(stdout.includes("未保存，原配置保持不变"), true);
  assert.equal((stdout.match(/安装 \/ 更新活动助手/g) ?? []).length, 2);
  assert.equal((stdout.match(/技术活动助手/g) ?? []).length, 1);
  assert.equal(stdout.includes("继续选择下一步"), true);
  assert.equal(stdout.includes("飞书 webhook URL（飞书群设置 → 机器人 → 自定义机器人）："), true);
  assert.equal(stdout.includes("Server 酱 SendKey（sct.ftqq.com → SendKey 页面）："), true);
  assert.equal(stdout.includes("进度条演示"), false);
  assert.equal(stderr, "");
});

test("configuration save shows a progress bar before saved status", async () => {
  const originalLocalConfig = await readOptionalFile(localConfigPath);
  const originalBackups = await listLocalConfigBackups();
  try {
    const child = spawn(process.execPath, ["scripts/gba.mjs"], {
      cwd: rootDir,
      env: { ...process.env, NO_COLOR: "1" },
    });
    let stdout = "";
    let stderr = "";
    let sentConfig = false;
    let sentExit = false;

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (!sentConfig && (stdout.match(/安装 \/ 更新活动助手/g) ?? []).length === 1) {
        sentConfig = true;
        child.stdin.write("2\nhttps://example.test/hook\n\nclear\ny\n");
      }
      if (!sentExit && stdout.includes("已保存：tech-events-assistant.local.json")) {
        sentExit = true;
        child.stdin.write("0\n");
        child.stdin.end();
      }
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });

    const status = await new Promise((resolve) => {
      child.on("exit", (code) => resolve(code));
    });

    assert.equal(status, 0);
    assert.equal(stdout.includes("保存中  █████"), true);
    assert.equal(stdout.includes("完成  ████████████████████ 100%  已完成"), true);
    assert.equal(stdout.indexOf("保存中  █████") < stdout.indexOf("已保存：tech-events-assistant.local.json"), true);
    assert.equal(stderr, "");
  } finally {
    const currentBackups = await listLocalConfigBackups();
    await Promise.all(
      [...currentBackups]
        .filter((name) => !originalBackups.has(name))
        .map((name) => rm(path.join(rootDir, name), { force: true })),
    );
    if (originalLocalConfig === null) {
      await rm(localConfigPath, { force: true });
    } else {
      await writeFile(localConfigPath, originalLocalConfig);
    }
  }
});
