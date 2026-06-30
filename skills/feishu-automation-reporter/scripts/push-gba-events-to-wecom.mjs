#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadLocalEnv } from "./lib/env.mjs";
import { extractTopLevelSection, stripMarkdown, truncate } from "./lib/markdown-utils.mjs";
import { sendWeComMarkdown } from "./lib/wecom.mjs";

const localEnv = await loadLocalEnv();
const webhook = process.env.WECOM_WEBHOOK_URL || localEnv.WECOM_WEBHOOK_URL;
const file = process.argv[2];

if (!webhook) {
  console.error("缺少 WECOM_WEBHOOK_URL。请设置环境变量或在 .env.local 中配置。");
  process.exit(2);
}

if (!file) {
  console.error("用法：node scripts/push-gba-events-to-wecom.mjs <活动Markdown文件>");
  process.exit(2);
}

const text = await readFile(file, "utf8");
const title = text.match(/^#\s+(.+)$/m)?.[1]?.trim() || "大湾区技术活动";

const linesStarting = (prefix, limit = 8) =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith(prefix))
    .slice(0, limit)
    .map((line) => line.replace(prefix, "").trim());

const overview = [
  ...linesStarting("- 时间范围：", 1).map((item) => `- 时间范围：${truncate(item, 120)}`),
  ...linesStarting("- 本次找到：", 1).map((item) => `- 本次找到：${truncate(item, 80)}`),
  ...linesStarting("- 城市分布：", 1).map((item) => `- 城市分布：${truncate(item, 100)}`),
  ...linesStarting("- 最值得优先看：", 1).map((item) => `- 最值得优先看：${truncate(item, 160)}`),
].join("\n");

const cards = [...extractTopLevelSection(text, "快速卡片").matchAll(/^##\s+(.+?)\n([\s\S]*?)(?=\n## |\n# |$)/gm)]
  .slice(0, 6)
  .map((match, index) => {
    const heading = stripMarkdown(match[1]);
    const body = match[2];
    const time = body.match(/^- 时间：(.+)$/m)?.[1] || "官方未明确";
    const city = body.match(/^- 城市：(.+)$/m)?.[1] || "官方未明确";
    const worth = body.match(/^- 值不值得去：(.+)$/m)?.[1] || "官方未明确";
    const reason = body.match(/^- 一句话理由：(.+)$/m)?.[1] || "";
    return `${index + 1}. ${truncate(heading, 80)}\n   时间：${truncate(time, 60)}｜城市：${truncate(city, 30)}｜判断：${truncate(worth, 30)}\n   理由：${truncate(reason, 120)}`;
  })
  .join("\n\n");

const markdown = [
  `# ${stripMarkdown(title)}`,
  "",
  "## 检索概览",
  overview || "本节无内容。",
  "",
  "## 快速卡片",
  cards || "本次未检索到符合条件的活动。",
  "",
  `完整活动清单：${path.resolve(file)}`,
].join("\n");

await sendWeComMarkdown({ webhook, title, markdown });
