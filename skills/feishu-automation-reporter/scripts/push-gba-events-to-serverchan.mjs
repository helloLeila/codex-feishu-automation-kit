#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { configuredEventTitle, loadReporterConfig } from "./lib/config.mjs";
import { loadLocalEnv } from "./lib/env.mjs";
import { extractTopLevelSection, stripMarkdown, truncate } from "./lib/markdown-utils.mjs";
import { sendServerChan } from "./lib/serverchan.mjs";

const localEnv = await loadLocalEnv();
const reporterConfig = await loadReporterConfig();
const eventTitle = configuredEventTitle(reporterConfig);
const sendKey = process.env.SERVERCHAN_SENDKEY || localEnv.SERVERCHAN_SENDKEY;
const file = process.argv[2];

if (!sendKey) {
  console.error("缺少 SERVERCHAN_SENDKEY。请设置环境变量、.env.local 或 tech-events-assistant.local.json。");
  process.exit(2);
}

if (!file) {
  console.error("用法：node scripts/push-gba-events-to-serverchan.mjs <活动Markdown文件>");
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
  ...linesStarting("- 时间范围：", 1).map((item) => `- 时间范围：${truncate(item, 140)}`),
  ...linesStarting("- 本次找到：", 1).map((item) => `- 本次找到：${truncate(item, 100)}`),
  ...linesStarting("- 城市分布：", 1).map((item) => `- 城市分布：${truncate(item, 120)}`),
  ...linesStarting("- 最值得优先看：", 1).map((item) => `- 最值得优先看：${truncate(item, 180)}`),
].join("\n");

const cards = [...extractTopLevelSection(text, "快速卡片").matchAll(/^##\s+(.+?)\n([\s\S]*?)(?=\n## |\n# |$)/gm)]
  .slice(0, 10)
  .map((match, index) => {
    const heading = stripMarkdown(match[1]);
    const body = match[2];
    const time = body.match(/^- 时间：(.+)$/m)?.[1] || "官方未明确";
    const city = body.match(/^- 城市：(.+)$/m)?.[1] || "官方未明确";
    const topic = body.match(/^- 主题：(.+)$/m)?.[1] || "官方未明确";
    const worth = body.match(/^- 值不值得去：(.+)$/m)?.[1] || "官方未明确";
    const reason = body.match(/^- 一句话理由：(.+)$/m)?.[1] || "";
    const link = body.match(/^- 链接：(.+)$/m)?.[1] || "";
    return [
      `${index + 1}. ${truncate(heading, 100)}`,
      `   时间：${truncate(time, 80)}｜城市：${truncate(city, 40)}｜判断：${truncate(worth, 40)}`,
      `   主题：${truncate(topic, 120)}`,
      reason ? `   理由：${truncate(reason, 180)}` : "",
      link ? `   链接：${truncate(link, 180)}` : "",
    ].filter(Boolean).join("\n");
  })
  .join("\n\n");

const candidates = extractTopLevelSection(text, "候补链接")
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line.startsWith("- "))
  .slice(0, 10)
  .map((line) => truncate(line, 220))
  .join("\n");

const notes = extractTopLevelSection(text, "备注")
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line.startsWith("- "))
  .slice(0, 6)
  .map((line) => truncate(line, 220))
  .join("\n");

const desp = [
  `# ${stripMarkdown(title)}`,
  "",
  "## 检索概览",
  overview || "本节无内容。",
  "",
  "## 快速卡片",
  cards || "本次未检索到符合条件的活动。",
  "",
  "## 候补链接",
  candidates || "本节无内容。",
  "",
  "## 备注",
  notes || "本节无内容。",
  "",
  `完整活动清单：${path.resolve(file)}`,
].join("\n");

await sendServerChan({
  sendKey,
  title: `Codex｜${eventTitle}`,
  desp,
});
