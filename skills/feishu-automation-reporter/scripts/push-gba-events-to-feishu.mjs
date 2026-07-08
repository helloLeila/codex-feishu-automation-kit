#!/usr/bin/env node

import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { configuredEventTitle, loadReporterConfig } from "./lib/config.mjs";
import { loadLocalEnv } from "./lib/env.mjs";
import { extractLabeledValue } from "./lib/markdown-utils.mjs";

const localEnv = await loadLocalEnv();
const reporterConfig = await loadReporterConfig();
const eventTitle = configuredEventTitle(reporterConfig);
const webhook = process.env.FEISHU_WEBHOOK_URL || localEnv.FEISHU_WEBHOOK_URL;
const secret = process.env.FEISHU_WEBHOOK_SECRET || localEnv.FEISHU_WEBHOOK_SECRET;
const file = process.argv[2];

if (!webhook) {
  console.error("缺少 FEISHU_WEBHOOK_URL。请设置环境变量、.env.local 或 tech-events-assistant.local.json。");
  process.exit(2);
}

if (!file) {
  console.error("用法：node scripts/push-gba-events-to-feishu.mjs <活动Markdown文件>");
  process.exit(2);
}

const text = await readFile(file, "utf8");
const title = text.match(/^#\s+(.+)$/m)?.[1]?.trim() || "大湾区技术活动";

const stripMarkdown = (value) =>
  value
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/^#+\s+/gm, "")
    .trim();

const truncate = (value, max = 220) => {
  const normalized = stripMarkdown(value).replace(/\s+/g, " ");
  return normalized.length > max ? `${normalized.slice(0, max - 1)}...` : normalized;
};

const extractSection = (heading) => {
  const start = text.search(new RegExp(`^# ${heading}$`, "m"));
  if (start === -1) return "";
  const afterStart = text.slice(start).replace(/^# .+\n/, "");
  const next = afterStart.search(/\n# /);
  return (next === -1 ? afterStart : afterStart.slice(0, next)).trim();
};

const linesStarting = (prefix, limit = 8) =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith(prefix))
    .slice(0, limit)
    .map((line) => line.replace(prefix, "").trim());

const firstField = (source, labels, fallback = "") => extractLabeledValue(source, labels) || fallback;

const quickCards = [...extractSection("快速卡片").matchAll(/(?:^|\n)##\s+(.+?)\n([\s\S]*?)(?=\n## |\n# |$)/g)]
  .slice(0, 8)
  .map((match) => {
    const heading = stripMarkdown(match[1]);
    const body = match[2];
    const time = firstField(body, "时间", "官方未明确");
    const city = firstField(body, "城市", "官方未明确");
    const topic = firstField(body, "主题", "");
    const highlights = extractLabeledValue(body, ["内容看点", "看点"], {
      multiline: true,
      separator: " ",
    });
    const worth = firstField(body, "值不值得去", "官方未明确");
    const reason = firstField(body, "一句话理由", "");
    const link = firstField(body, "链接", "");
    return [
      `**${heading}**`,
      `- 时间：${truncate(time, 80)}`,
      `- 城市：${truncate(city, 40)}`,
      topic ? `- 主题：${truncate(topic, 90)}` : "",
      highlights ? `- 内容：${truncate(highlights, 180)}` : "",
      `- 判断：${truncate(worth, 40)}`,
      reason ? `- 理由：${truncate(reason, 140)}` : "",
      link ? `- 链接：${truncate(link, 140)}` : "",
    ].filter(Boolean).join("\n");
  });

const sectionBlock = (heading, body) => ({
  tag: "div",
  text: {
    tag: "lark_md",
    content: `**${heading}**\n${body || "本次未检索到符合条件的内容。"}`,
  },
});

const summary = [
  ["时间范围", 120],
  ["本次找到", 80],
  ["城市分布", 100],
  ["最值得优先看", 160],
]
  .map(([label, max]) => {
    const value = firstField(text, label);
    return value ? `- ${label}：${truncate(value, max)}` : "";
  })
  .filter(Boolean)
  .join("\n") || [
  ...linesStarting("- 时间范围：", 1).map((item) => `- 时间范围：${truncate(item, 120)}`),
  ...linesStarting("- 本次找到：", 1).map((item) => `- 本次找到：${truncate(item, 80)}`),
  ...linesStarting("- 城市分布：", 1).map((item) => `- 城市分布：${truncate(item, 100)}`),
  ...linesStarting("- 最值得优先看：", 1).map((item) => `- 最值得优先看：${truncate(item, 160)}`),
].join("\n");

const candidates = extractSection("候补链接")
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line.startsWith("- "))
  .slice(0, 6)
  .map((line) => truncate(line, 180))
  .join("\n");

const notes = extractSection("备注")
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line.startsWith("- "))
  .slice(0, 4)
  .map((line) => truncate(line, 180))
  .join("\n");

const elements = [
  sectionBlock("检索概览", summary),
  { tag: "hr" },
  sectionBlock("快速卡片", quickCards.join("\n\n")),
];

if (candidates) {
  elements.push({ tag: "hr" }, sectionBlock("候补链接", candidates));
}

if (notes) {
  elements.push(sectionBlock("备注", notes));
}

elements.push({
  tag: "note",
  elements: [
    {
      tag: "plain_text",
      content: `完整活动清单：${path.resolve(file)}`,
    },
  ],
});

const payload = {
  msg_type: "interactive",
  card: {
    config: {
      wide_screen_mode: true,
    },
    header: {
      title: {
        tag: "plain_text",
        content: `${eventTitle}｜${title}`,
      },
      template: "green",
    },
    elements,
  },
};

if (process.env.FEISHU_DRY_RUN === "1") {
  console.log(JSON.stringify(payload, null, 2));
  process.exit(0);
}

const requestPayload = {
  msg_type: payload.msg_type,
  card: payload.card,
};

// 飞书签名校验要求用 "timestamp\nsecret" 做 HMAC-SHA256。
if (secret) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const sign = createHmac("sha256", `${timestamp}\n${secret}`).digest("base64");
  requestPayload.timestamp = timestamp;
  requestPayload.sign = sign;
}

const response = await fetch(webhook, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(requestPayload),
});

const body = await response.text();
if (!response.ok) {
  console.error(`飞书 webhook 请求失败：HTTP ${response.status}`);
  console.error(body);
  process.exit(1);
}

let result;
try {
  result = JSON.parse(body);
} catch {
  result = { raw: body };
}

if (result.code && result.code !== 0) {
  console.error("飞书 webhook 返回错误：");
  console.error(JSON.stringify(result, null, 2));
  process.exit(1);
}

console.log("飞书通知已发送。");
