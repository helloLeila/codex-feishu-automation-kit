import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

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
