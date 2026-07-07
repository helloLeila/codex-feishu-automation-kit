import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
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
    if (!sentInstall && (stdout.match(/^1\. 安装 \/ 更新活动助手/gm) ?? []).length === 1) {
      sentInstall = true;
      child.stdin.write("1\n");
    }
    if (!sentExit && (stdout.match(/^1\. 安装 \/ 更新活动助手/gm) ?? []).length === 2) {
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
  assert.equal((stdout.match(/^1\. 安装 \/ 更新活动助手/gm) ?? []).length, 2);
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
    if (!sentConfig && (stdout.match(/^1\. 安装 \/ 更新活动助手/gm) ?? []).length === 1) {
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
  assert.equal((stdout.match(/^1\. 安装 \/ 更新活动助手/gm) ?? []).length, 2);
  assert.equal((stdout.match(/技术活动助手/g) ?? []).length, 1);
  assert.equal(stdout.includes("继续选择下一步"), true);
  assert.equal(stdout.includes("飞书 webhook URL（飞书群设置 → 机器人 → 自定义机器人）："), true);
  assert.equal(stdout.includes("Server 酱 SendKey（sct.ftqq.com → SendKey 页面）："), true);
  assert.equal(stdout.includes("进度条演示"), false);
  assert.equal(stderr, "");
});

test("configuration save prints a completed step flow in piped output", async () => {
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
      if (!sentConfig && (stdout.match(/^1\. 安装 \/ 更新活动助手/gm) ?? []).length === 1) {
        sentConfig = true;
        child.stdin.write("2\nhttps://example.test/hook\n\nclear\ny\n");
      }
      if (!sentExit && stdout.includes("完成：tech-events-assistant.local.json 已保存")) {
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
    assert.equal((stdout.match(/保存中/g) ?? []).length, 0);
    assert.equal(stdout.includes("完成  ██████████████████████████████ 100%  已完成"), false);
    assert.equal(stdout.includes("配置推送"), true);
    assert.equal(stdout.includes("├─ ✓ 读取现有配置"), true);
    assert.equal(stdout.includes("├─ ✓ 合并本次输入"), true);
    assert.equal(stdout.includes("├─ ✓ 写入本地配置"), true);
    assert.equal(stdout.includes("└─ ✓ 准备推送脚本"), true);
    assert.equal(stdout.includes("完成：tech-events-assistant.local.json 已保存"), true);
    assert.equal(stdout.indexOf("配置推送") < stdout.indexOf("完成：tech-events-assistant.local.json 已保存"), true);
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

test("run guide explains that Codex automation is not auto-created from the CLI", async () => {
  const child = spawn(process.execPath, ["scripts/gba.mjs"], {
    cwd: rootDir,
    env: { ...process.env, NO_COLOR: "1" },
  });
  let stdout = "";
  let stderr = "";
  let sentGuide = false;
  let sentExit = false;

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
    if (!sentGuide && (stdout.match(/查看活动搜寻接入步骤/g) ?? []).length === 1) {
      sentGuide = true;
      child.stdin.write("5\n");
    }
    if (!sentExit && stdout.includes("不会自动添加或触发 Codex Automation")) {
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
  assert.equal(stdout.includes("5. 查看活动搜寻接入步骤"), true);
  assert.equal(stdout.includes("不会自动添加或触发 Codex Automation"), true);
  assert.equal(stdout.includes("已存在活动搜寻：Codex → Automations → 活动搜寻 → Run now"), true);
  assert.equal(stdout.includes("还没有活动搜寻：打开 docs/codex-automation-setup.md"), true);
  assert.equal(stdout.includes("本工具已准备好配置、dry-run 和推送脚本"), true);
  assert.equal(stderr, "");
});

test("dry-run prints a completed step flow instead of a digital progress bar", () => {
  const result = spawnSync(process.execPath, ["scripts/gba.mjs", "--dry-run"], {
    cwd: rootDir,
    env: { ...process.env, NO_COLOR: "1" },
    encoding: "utf8",
  });

  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  assert.equal(result.stdout.includes("完成  ██████████████████████████████ 100%  已完成"), false);
  assert.equal(result.stdout.includes("预览 / 测试推送"), true);
  assert.equal(result.stdout.includes("├─ ✓ 生成飞书 dry-run"), true);
  assert.equal(result.stdout.includes("└─ ✓ 生成 Server 酱 dry-run"), true);
  assert.equal(result.stdout.includes("完成：dry-run 已通过，未真实发送"), true);
});
