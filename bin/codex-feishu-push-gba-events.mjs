#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadLocalEnv } from "../skills/feishu-automation-reporter/scripts/lib/env.mjs";

const rootDir = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

function printUsage() {
  console.log("用法：codex-feishu-push-gba-events [--dry-run] <活动Markdown文件>");
}

function runPushScript({ label, script, file, env }) {
  console.log(`${label}${env.FEISHU_DRY_RUN === "1" || env.SERVERCHAN_DRY_RUN === "1" ? " dry-run 预览" : "推送"}`);
  const result = spawnSync(process.execPath, [script, file], {
    cwd: process.cwd(),
    env,
    encoding: "utf8",
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) process.exit(result.status ?? 1);
}

async function main(argv) {
  if (argv.includes("--help") || argv.includes("-h")) {
    printUsage();
    return;
  }

  const dryRun = argv.includes("--dry-run");
  const file = argv.find((arg) => !arg.startsWith("-"));
  if (!file) {
    printUsage();
    process.exitCode = 2;
    return;
  }

  const localEnv = await loadLocalEnv();
  const feishuWebhook = process.env.FEISHU_WEBHOOK_URL || localEnv.FEISHU_WEBHOOK_URL;
  const feishuSecret = process.env.FEISHU_WEBHOOK_SECRET || localEnv.FEISHU_WEBHOOK_SECRET;
  const serverChanSendKey = process.env.SERVERCHAN_SENDKEY || localEnv.SERVERCHAN_SENDKEY;

  if (!feishuWebhook && !serverChanSendKey) {
    console.log("未配置推送渠道，已跳过推送。");
    return;
  }

  const childEnv = {
    ...process.env,
    FEISHU_WEBHOOK_URL: feishuWebhook || "",
    FEISHU_WEBHOOK_SECRET: feishuSecret || "",
    SERVERCHAN_SENDKEY: serverChanSendKey || "",
  };

  if (feishuWebhook) {
    runPushScript({
      label: "飞书",
      script: path.join(rootDir, "skills/feishu-automation-reporter/scripts/push-gba-events-to-feishu.mjs"),
      file,
      env: {
        ...childEnv,
        FEISHU_DRY_RUN: dryRun ? "1" : childEnv.FEISHU_DRY_RUN,
      },
    });
  }

  if (serverChanSendKey) {
    runPushScript({
      label: "Server 酱",
      script: path.join(rootDir, "skills/feishu-automation-reporter/scripts/push-gba-events-to-serverchan.mjs"),
      file,
      env: {
        ...childEnv,
        SERVERCHAN_DRY_RUN: dryRun ? "1" : childEnv.SERVERCHAN_DRY_RUN,
      },
    });
  }
}

main(process.argv.slice(2)).catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
