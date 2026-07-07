#!/usr/bin/env node

import { createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadLocalEnv } from "./lib/env.mjs";

const localEnv = await loadLocalEnv();
const webhook = process.env.FEISHU_WEBHOOK_URL || localEnv.FEISHU_WEBHOOK_URL;
const secret = process.env.FEISHU_WEBHOOK_SECRET || localEnv.FEISHU_WEBHOOK_SECRET;
const file = process.argv[2];

if (!webhook) {
  console.error("缺少 FEISHU_WEBHOOK_URL。请设置环境变量、.env.local 或 tech-events-assistant.local.json。");
  process.exit(2);
}

if (!file) {
  console.error("用法：node scripts/push-ai-daily-to-feishu.mjs <日报Markdown文件>");
  process.exit(2);
}

const text = await readFile(file, "utf8");
const title = text.match(/^#\s+(.+)$/m)?.[1]?.trim() || "AI 行业热点日报";

const extractSection = (headingPattern, nextHeadingPattern = /\n## \d+\./) => {
  const start = text.search(headingPattern);
  if (start === -1) return "";
  const afterStart = text.slice(start).replace(/^## .+\n/, "");
  const next = afterStart.search(nextHeadingPattern);
  return (next === -1 ? afterStart : afterStart.slice(0, next)).trim();
};

const stripMarkdown = (value) =>
  value
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/^#+\s+/gm, "")
    .trim();

const truncate = (value, max = 180) => {
  const normalized = stripMarkdown(value).replace(/\s+/g, " ");
  return normalized.length > max ? `${normalized.slice(0, max - 1)}...` : normalized;
};

const numberedItems = (section, limit = 8) =>
  section
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^\d+\.\s+/.test(line))
    .slice(0, limit)
    .map((line) => line.replace(/^\d+\.\s+/, ""));

const subheadings = (section, limit = 8) =>
  [...section.matchAll(/^###\s+(.+)$/gm)]
    .map((match) => stripMarkdown(match[1].replace(/^\d+(\.\d+)?\s+/, "")))
    .slice(0, limit);

const boldTitle = (value) => `**${stripMarkdown(value)}**`;
const sectionBlock = (heading, body) => ({
  tag: "div",
  text: {
    tag: "lark_md",
    content: `${boldTitle(heading)}\n${body || "本节无内容。"}`,
  },
});

const hr = () => ({ tag: "hr" });

const cleanList = (items, limit = 8, max = 220) =>
  items
    .slice(0, limit)
    .map((item, index) => `${index + 1}. ${truncate(item, max)}`)
    .join("\n");

const summaryItems = numberedItems(extractSection(/^## 1\. 今日摘要/m), 5).map((item) => {
  const match = item.match(/^\*\*(.+?)\*\*[：:]\s*(.+)$/);
  return match
    ? `${boldTitle(match[1])}：${truncate(match[2], 170)}`
    : truncate(item, 210);
});

const parseHotNews = (sectionText) => {
  const headingMatches = [...sectionText.matchAll(/^###\s+(.+)$/gm)];
  return headingMatches.slice(0, 6).map((match, index) => {
    const next = headingMatches[index + 1];
    const bodyStart = match.index + match[0].length;
    const bodyEnd = next ? next.index : sectionText.length;
    const heading = stripMarkdown(match[1].replace(/^\d+(\.\d+)?\s+/, ""));
    const body = sectionText.slice(bodyStart, bodyEnd);
    const overview = body.match(/- \*\*事件概述\*\*：(.+)/)?.[1] || "";
    const why = body.match(/- \*\*为什么重要\*\*：(.+)/)?.[1] || "";
    return `${boldTitle(heading)}\n- 事件：${truncate(overview, 150)}\n- 重要性：${truncate(why, 150)}`;
  });
};

const productUpdates = subheadings(extractSection(/^## 3\. 模型与产品更新/m), 6);
const companyPolicy = subheadings(extractSection(/^## 4\. 投融资、公司动态与政策监管/m), 6);
const techTrends = subheadings(extractSection(/^## 5\. 开源项目、论文或技术趋势/m), 6);
const topicIdeas = numberedItems(extractSection(/^## 6\. 可直接用于选题/m), 5);
const leads = numberedItems(extractSection(/^## 7\. 明日可追踪线索/m), 7);
const sources = extractSection(/^## 来源列表/m, /\n\z/)
  .split("\n")
  .map((line) => line.trim())
  .filter((line) => line.startsWith("- "))
  .slice(0, 10)
  .map((line) => stripMarkdown(line.replace(/^- /, "")));

const elements = [
  sectionBlock("今日摘要", cleanList(summaryItems, 5, 260)),
  hr(),
  sectionBlock("热点新闻", parseHotNews(extractSection(/^## 2\. 热点新闻/m)).join("\n\n")),
  hr(),
  sectionBlock("模型与产品更新", cleanList(productUpdates, 6, 160)),
  sectionBlock("公司动态与政策监管", cleanList(companyPolicy, 6, 160)),
  sectionBlock("开源项目 / 论文 / 技术趋势", cleanList(techTrends, 6, 160)),
  hr(),
  sectionBlock("可直接用的选题标题", cleanList(topicIdeas, 5, 120)),
  sectionBlock("明日可追踪线索", cleanList(leads, 7, 180)),
];

if (sources.length) {
  elements.push(hr(), sectionBlock("来源列表", sources.map((source) => `- ${truncate(source, 180)}`).join("\n")));
}

elements.push({
  tag: "note",
  elements: [
    {
      tag: "plain_text",
      content: `完整日报：${path.resolve(file)}`,
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
        content: `AI日报｜${title}`,
      },
      template: "blue",
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
