#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { access, copyFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline";
import { stdin as input, stdout as output } from "node:process";
import { fileURLToPath } from "node:url";

import {
  cartoonProgressLine,
  color,
  completionLine,
  digitalProgressLine,
  renderBannerLines,
  spinnerFrame,
  statusLine,
} from "./lib/terminal-ui.mjs";
import {
  CONFIG_FILE,
  EXAMPLE_CONFIG_FILE,
  LOCAL_CONFIG_FILE,
  applySecretInputs,
  hasConfiguredPush,
  loadAssistantConfig,
  readLocalConfig,
  redactPushConfig,
  writeLocalConfig,
} from "./lib/tech-events-config.mjs";
import { loadLocalEnv } from "../skills/feishu-automation-reporter/scripts/lib/env.mjs";

const rootDir = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

function createPromptSession() {
  const rl = createInterface({ input, output, crlfDelay: Infinity });
  const queuedLines = [];
  const waiters = [];
  let closed = false;

  rl.on("line", (line) => {
    const waiter = waiters.shift();
    if (waiter) {
      waiter.resolve(line);
    } else {
      queuedLines.push(line);
    }
  });

  rl.on("close", () => {
    closed = true;
    while (waiters.length) {
      waiters.shift().reject(new Error("输入已结束"));
    }
  });

  return {
    question(prompt) {
      output.write(prompt);
      if (queuedLines.length) return Promise.resolve(queuedLines.shift());
      if (closed) return Promise.reject(new Error("输入已结束"));
      return new Promise((resolve, reject) => {
        waiters.push({ resolve, reject });
      });
    },
    close() {
      rl.close();
    },
  };
}

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function printBanner() {
  console.log(renderBannerLines().join("\n"));
}

async function installOrUpdate() {
  const configPath = path.join(rootDir, CONFIG_FILE);
  const examplePath = path.join(rootDir, EXAMPLE_CONFIG_FILE);

  console.log(`${spinnerFrame(0)} 检查配置文件`);
  if (!(await fileExists(configPath))) {
    await copyFile(examplePath, configPath);
    console.log(statusLine(`已从 ${EXAMPLE_CONFIG_FILE} 创建 ${CONFIG_FILE}`, "ok"));
  } else {
    console.log(statusLine(`${CONFIG_FILE} 已存在，保留当前配置`, "ok"));
  }

  console.log(completionLine());
}

async function runSaveProgress() {
  for (const percent of [25, 50, 75]) {
    console.log(digitalProgressLine(percent, { label: "保存中" }));
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  console.log(completionLine());
}

async function printStatus() {
  const config = await loadAssistantConfig(rootDir);
  const localEnv = await loadLocalEnv(rootDir);
  const publicConfigPath = path.join(rootDir, CONFIG_FILE);
  const localConfigPath = path.join(rootDir, LOCAL_CONFIG_FILE);
  const pushConfigured =
    hasConfiguredPush(config) ||
    Boolean(localEnv.FEISHU_WEBHOOK_URL || localEnv.SERVERCHAN_SENDKEY);

  console.log(statusLine(`${CONFIG_FILE}: ${await fileExists(publicConfigPath) ? "存在" : "缺失"}`, "info"));
  console.log(statusLine(`${LOCAL_CONFIG_FILE}: ${await fileExists(localConfigPath) ? "存在" : "未配置，可跳过"}`, "info"));
  console.log(statusLine(`推送密钥: ${pushConfigured ? "已配置" : "未配置"}`, pushConfigured ? "ok" : "warn"));
  console.log(JSON.stringify(redactPushConfig(config), null, 2));
}

async function configurePush(rl) {
  const ownsReadline = !rl;
  const reader = rl ?? createPromptSession();
  const current = await readLocalConfig(rootDir);

  console.log(color("输入留空 = 保留原值；输入 clear = 清空该项。最后确认保存前不会写文件。", "gray"));
  const feishuWebhookUrl = await reader.question("飞书 webhook URL（飞书群设置 → 机器人 → 自定义机器人）：");
  const feishuWebhookSecret = await reader.question("飞书签名密钥（可空，开启签名校验才填）：");
  const serverChanSendKey = await reader.question("Server 酱 SendKey（sct.ftqq.com → SendKey 页面）：");
  const saveAnswer = await reader.question("保存到 tech-events-assistant.local.json？输入 y 保存：");
  if (ownsReadline) reader.close();

  const result = applySecretInputs(
    current,
    { feishuWebhookUrl, feishuWebhookSecret, serverChanSendKey },
    { save: saveAnswer.trim().toLowerCase() === "y" },
  );

  if (!result.saved) {
    console.log(statusLine("未保存，原配置保持不变", "warn"));
    return;
  }

  const writeResult = await writeLocalConfig(rootDir, result.config);
  await runSaveProgress();
  console.log(statusLine(`已保存：${path.basename(writeResult.filePath)}`, "ok"));
  if (writeResult.backupCreated) {
    console.log(statusLine(`已备份旧配置：${path.basename(writeResult.backupPath)}`, "info"));
  }
}

function runDryRun() {
  const commands = [
    {
      env: { FEISHU_DRY_RUN: "1", FEISHU_WEBHOOK_URL: "dry-run-webhook-url" },
      args: [
        "skills/feishu-automation-reporter/scripts/push-gba-events-to-feishu.mjs",
        "examples/gba-events-example.md",
      ],
    },
    {
      env: { SERVERCHAN_DRY_RUN: "1", SERVERCHAN_SENDKEY: "dry-run-sendkey" },
      args: [
        "skills/feishu-automation-reporter/scripts/push-gba-events-to-serverchan.mjs",
        "examples/gba-events-example.md",
      ],
    },
  ];

  for (const command of commands) {
    const result = spawnSync(process.execPath, command.args, {
      cwd: rootDir,
      env: { ...process.env, ...command.env },
      encoding: "utf8",
    });
    if (result.status !== 0) {
      process.stderr.write(result.stderr);
      process.exitCode = result.status;
      return;
    }
  }

  console.log(completionLine());
  console.log(statusLine("飞书和 Server 酱 dry-run 已通过，未真实发送", "ok"));
}

function guideRunOnce() {
  console.log(color("Codex 桌面端暂未暴露稳定的 CLI 自动化运行接口，所以这里不假装能强行触发。", "yellow"));
  console.log("打开 Codex → Automations → 活动搜寻 → Run now。");
  console.log("本工具负责把配置、推送测试和排查步骤收拢到一个入口。");
}

function printMenu(options = {}) {
  if (options.compact) {
    console.log(color("── 继续选择下一步（0 退出）──", "gray"));
  } else {
    printBanner();
    console.log("");
  }
  console.log("1. 安装 / 更新活动助手");
  console.log("2. 配置推送和偏好");
  console.log("3. 预览 / 测试推送");
  console.log("4. 检查状态");
  console.log("5. 运行 / 引导一次活动搜寻");
  console.log("0. 退出");
}

async function handleChoice(choice, rl) {
  if (choice === "0") return false;
  if (choice === "1") await installOrUpdate();
  else if (choice === "2") await configurePush(rl);
  else if (choice === "3") runDryRun();
  else if (choice === "4") await printStatus();
  else if (choice === "5") guideRunOnce();
  else {
    console.log(statusLine("没识别这个选项，输入 0 可以退出", "warn"));
  }
  return true;
}

async function menu() {
  const rl = createPromptSession();
  let keepGoing = true;
  let compact = false;
  try {
    while (keepGoing) {
      printMenu({ compact });
      const choice = await rl.question(color("\n选择一个数字：", "cyan"));
      keepGoing = await handleChoice(choice.trim(), rl);
      if (keepGoing) {
        compact = true;
        console.log("");
      }
    }
  } catch (error) {
    if (error.message !== "输入已结束") throw error;
  }
  rl.close();
  console.log(statusLine("已退出", "info"));
}

async function main(argv) {
  const printProgress = argv.find((arg) => arg.startsWith("--print-progress="));
  if (printProgress) {
    console.log(cartoonProgressLine(printProgress.split("=")[1]));
    return;
  }

  if (argv.includes("--status")) {
    await printStatus();
    return;
  }

  if (argv.includes("--dry-run")) {
    runDryRun();
    return;
  }

  if (argv.includes("--help") || argv.includes("-h")) {
    printBanner();
    console.log("用法：npm run gba");
    console.log("可选：node scripts/gba.mjs --status | --dry-run");
    return;
  }

  await menu();
}

main(process.argv.slice(2)).catch((error) => {
  console.error(color(error.message, "red"));
  process.exitCode = 1;
});
