import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const localConfigPath = path.join(rootDir, "tech-events-assistant.local.json");
const automationPromptPath = path.join(rootDir, "tech-events-assistant.automation.md");
const neonBar = "█".repeat(56);

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
  assert.equal((stdout.match(/技术活动助手/g) ?? []).length, 2);
  assert.equal(stdout.includes("回车执行当前步骤"), true);
  assert.equal(stdout.includes("进度条演示"), false);
  assert.equal(stderr, "");
});

test("guide advances to the next step and marks previous step complete", async () => {
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
    if (!sentInstall && stdout.includes("回车执行当前步骤")) {
      sentInstall = true;
      child.stdin.write("\n");
    }
    if (!sentExit && stdout.includes("1. 安装 / 更新活动助手  ✓ 已完成")) {
      sentExit = true;
      child.stdin.write("q\n");
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
  assert.equal(stdout.includes("引导配置"), true);
  assert.equal(stdout.includes("1. 安装 / 更新活动助手  ✓ 已完成"), true);
  assert.equal(stdout.includes("2. 配置推送和偏好  ▶ 当前"), true);
  assert.equal(stdout.includes("✓ 安装 / 更新活动助手 已完成"), true);
  assert.equal(stdout.includes("→ 继续下一步：配置推送和偏好"), true);
  assert.equal(stderr, "");
});

test("guide can return to the manual menu", async () => {
  const child = spawn(process.execPath, ["scripts/gba.mjs"], {
    cwd: rootDir,
    env: { ...process.env, NO_COLOR: "1" },
  });
  let stdout = "";
  let stderr = "";
  let sentBack = false;
  let sentExit = false;

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
    if (!sentBack && stdout.includes("回车执行当前步骤")) {
      sentBack = true;
      child.stdin.write("b\n");
    }
    if (!sentExit && stdout.includes("手动菜单")) {
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
  assert.equal(stdout.includes("手动菜单"), true);
  assert.equal(stdout.includes("g 返回引导"), true);
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
      child.stdin.write("2\nn\n\n\n\nn\n");
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
  assert.equal((stdout.match(/技术活动助手/g) ?? []).length, 2);
  assert.equal(stdout.includes("回车执行当前步骤"), true);
  assert.equal(stdout.includes("飞书 webhook URL（飞书群设置 → 机器人 → 自定义机器人）："), true);
  assert.equal(stdout.includes("Server 酱 SendKey（sct.ftqq.com → SendKey 页面）："), true);
  assert.equal(stdout.includes("进度条演示"), false);
  assert.equal(stderr, "");
});

test("configuration helper can open credential pages or show setup links", async () => {
  const child = spawn(process.execPath, ["scripts/gba.mjs"], {
    cwd: rootDir,
    env: { ...process.env, NO_COLOR: "1", TECH_EVENTS_ASSISTANT_SKIP_BROWSER: "1" },
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
      child.stdin.write("2\n\n\n\n\nn\n");
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
  assert.equal(stdout.includes("打开取值页面？"), true);
  assert.equal(stdout.includes("飞书自定义机器人文档：https://open.feishu.cn/document/client-docs/bot-v3/add-custom-bot"), true);
  assert.equal(stdout.includes("Server 酱 SendKey 页面：https://sct.ftqq.com/sendkey"), true);
  assert.equal(stdout.includes("未自动打开浏览器：已按环境变量跳过浏览器打开"), true);
  assert.equal(stdout.includes("Server 酱页面链接已复制到剪贴板"), false);
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
        child.stdin.write("2\nn\nhttps://example.test/hook\n\nclear\ny\n");
      }
      if (!sentExit && stdout.includes("✓ tech-events-assistant.local.json 已保存")) {
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
    assert.equal(stdout.includes(`完成    ${neonBar} 100%`), true);
    assert.equal(stdout.includes("        ✓ tech-events-assistant.local.json 已保存"), true);
    assert.equal(stdout.indexOf("配置推送") < stdout.indexOf(`完成    ${neonBar} 100%`), true);
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

test("automation wizard writes a prompt file and gives one paste step", async () => {
  const originalAutomationPrompt = await readOptionalFile(automationPromptPath);
  try {
    const child = spawn(process.execPath, ["scripts/gba.mjs"], {
      cwd: rootDir,
      env: { ...process.env, NO_COLOR: "1", TECH_EVENTS_ASSISTANT_SKIP_CLIPBOARD: "1" },
    });
    let stdout = "";
    let stderr = "";
    let sentGuide = false;
    let sentExit = false;

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      if (!sentGuide && (stdout.match(/创建 \/ 更新技术活动晨报自动化/g) ?? []).length === 1) {
        sentGuide = true;
        child.stdin.write("5\n");
      }
      if (!sentExit && stdout.includes("✓ 已生成 tech-events-assistant.automation.md")) {
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
    const promptText = await readFile(automationPromptPath, "utf8");

    assert.equal(status, 0);
    assert.equal(stdout.includes("5. 创建 / 更新技术活动晨报自动化"), true);
    assert.equal(stdout.includes("创建技术活动晨报自动化"), true);
    assert.equal(stdout.includes("├─ ✓ 生成技术活动晨报 Prompt"), true);
    assert.equal(stdout.includes("├─ ✓ 写入 tech-events-assistant.automation.md"), true);
    assert.equal(stdout.includes("└─ ✓ 准备手动复制文件"), true);
    assert.equal(stdout.includes(`完成    ${neonBar} 100%`), true);
    assert.equal(stdout.includes("        ✓ 已生成 tech-events-assistant.automation.md"), true);
    assert.equal(stdout.includes("打开 Codex → 自动化（已安排）→ 通过聊天添加 → 粘贴 Prompt → 保存为：线下技术活动情报晨报"), true);
    assert.equal(stdout.includes("不会自动添加或触发 Codex 自动化"), false);
    assert.equal(promptText.includes("检索未来两周"), true);
    assert.equal(promptText.includes("每天 07:00"), true);
    assert.equal(promptText.includes("早上 7 点"), true);
    assert.equal(promptText.includes("Asia/Shanghai"), true);
    assert.equal(promptText.includes("不要编造"), true);
    assert.equal(promptText.includes("node skills/feishu-automation-reporter/scripts/push-gba-events-to-feishu.mjs"), true);
    assert.equal(stderr, "");
  } finally {
    if (originalAutomationPrompt === null) {
      await rm(automationPromptPath, { force: true });
    } else {
      await writeFile(automationPromptPath, originalAutomationPrompt);
    }
  }
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
  assert.equal(result.stdout.includes("本地预检（不发送）"), true);
  assert.equal(result.stdout.includes("├─ ✓ 生成飞书卡片预览"), true);
  assert.equal(result.stdout.includes("└─ ✓ 生成 Server 酱消息预览"), true);
  assert.equal(result.stdout.includes(`完成    ${neonBar} 100%`), true);
  assert.equal(result.stdout.includes("        ✓ 本地预检通过，未真实发送"), true);
});

test("interactive connection check asks before sending a real test message", async () => {
  const child = spawn(process.execPath, ["scripts/gba.mjs"], {
    cwd: rootDir,
    env: { ...process.env, NO_COLOR: "1" },
  });
  let stdout = "";
  let stderr = "";
  let sentCheck = false;
  let sentSkip = false;
  let sentExit = false;

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
    if (!sentCheck && stdout.includes("回车执行当前步骤")) {
      sentCheck = true;
      child.stdin.write("3\n");
    }
    if (!sentSkip && stdout.includes("是否发送一条测试消息到已配置通道")) {
      sentSkip = true;
      child.stdin.write("\n");
    }
    if (!sentExit && stdout.includes("已跳过真实发送测试")) {
      sentExit = true;
      child.stdin.write("q\n");
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
  assert.equal(stdout.includes("本地预检（不发送）"), true);
  assert.equal(stdout.includes("是否发送一条测试消息到已配置通道"), true);
  assert.equal(stdout.includes("已跳过真实发送测试；本地预检已通过"), true);
  assert.equal(stderr, "");
});

test("feishu connection test returns a readable server response summary", async (t) => {
  const originalFetch = globalThis.fetch;
  let requestUrl = "";
  let requestOptions = {};
  t.after(() => {
    globalThis.fetch = originalFetch;
  });
  globalThis.fetch = async (url, options) => {
    requestUrl = url;
    requestOptions = options;
    return new Response(JSON.stringify({ code: 0, msg: "ok" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const { sendFeishuConnectionTest } = await import("../scripts/gba.mjs");
  const summary = await sendFeishuConnectionTest("https://example.test/bot", "");

  assert.equal(summary, "飞书返回：HTTP 200，code 0，msg ok");
  assert.equal(requestUrl, "https://example.test/bot");
  assert.equal(requestOptions.method, "POST");
  assert.equal(JSON.parse(requestOptions.body).msg_type, "text");
});

test("status prints a readable panel instead of raw JSON", () => {
  const result = spawnSync(process.execPath, ["scripts/gba.mjs", "--status"], {
    cwd: rootDir,
    env: { ...process.env, NO_COLOR: "1" },
    encoding: "utf8",
  });

  assert.equal(result.status, 0);
  assert.equal(result.stderr, "");
  assert.equal(result.stdout.includes("状态检查"), true);
  assert.equal(result.stdout.includes("普通配置（可提交，控制助手偏好）"), true);
  assert.equal(result.stdout.includes("本机私密配置（.gitignore，不提交，保存 webhook/SendKey）"), true);
  assert.equal(result.stdout.includes("飞书推送"), true);
  assert.equal(result.stdout.includes("Server 酱推送"), true);
  assert.equal(result.stdout.includes("自动化 Prompt"), true);
  assert.equal(result.stdout.includes("{"), false);
  assert.equal(result.stdout.includes('"push"'), false);
});
