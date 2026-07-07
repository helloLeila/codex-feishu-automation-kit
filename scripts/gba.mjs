#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { access, copyFile } from "node:fs/promises";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { fileURLToPath } from "node:url";

import {
  bold,
  cartoonProgressLine,
  color,
  completionLine,
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

async function fileExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function printBanner() {
  console.log(color("╭────────────────────────────────────╮", "cyan"));
  console.log(`${color("│", "cyan")} ${bold("大湾区技术活动助手")}  ${color("🤖 找活动 · 配推送 · 查状态", "yellow")} ${color("│", "cyan")}`);
  console.log(color("╰────────────────────────────────────╯", "cyan"));
}

async function runProgressDemo() {
  for (const percent of [0, 20, 50, 80, 100]) {
    await new Promise((resolve) => setTimeout(resolve, 80));
    console.log(cartoonProgressLine(percent));
  }
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

async function configurePush() {
  const rl = createInterface({ input, output });
  const current = await readLocalConfig(rootDir);

  console.log(color("输入留空 = 保留原值；输入 clear = 清空该项。最后确认保存前不会写文件。", "gray"));
  const feishuWebhookUrl = await rl.question("飞书 webhook URL：");
  const feishuWebhookSecret = await rl.question("飞书签名密钥（可空）：");
  const serverChanSendKey = await rl.question("Server 酱 SendKey：");
  const saveAnswer = await rl.question("保存到 tech-events-assistant.local.json？输入 y 保存：");
  rl.close();

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

async function menu() {
  const rl = createInterface({ input, output });
  printBanner();
  console.log("");
  console.log("1. 安装 / 更新活动助手");
  console.log("2. 配置推送和偏好");
  console.log("3. 预览 / 测试推送");
  console.log("4. 检查状态");
  console.log("5. 运行 / 引导一次活动搜寻");
  console.log("6. 进度条演示");
  console.log("0. 退出");
  const choice = await rl.question(color("\n选择一个数字：", "cyan"));
  rl.close();

  if (choice === "1") return installOrUpdate();
  if (choice === "2") return configurePush();
  if (choice === "3") return runDryRun();
  if (choice === "4") return printStatus();
  if (choice === "5") return guideRunOnce();
  if (choice === "6") return runProgressDemo();
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

  if (argv.includes("--demo-progress")) {
    await runProgressDemo();
    return;
  }

  if (argv.includes("--help") || argv.includes("-h")) {
    printBanner();
    console.log("用法：npm run gba");
    console.log("可选：node scripts/gba.mjs --status | --dry-run | --demo-progress");
    return;
  }

  await menu();
}

main(process.argv.slice(2)).catch((error) => {
  console.error(color(error.message, "red"));
  process.exitCode = 1;
});
