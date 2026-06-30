#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadLocalEnv } from "./lib/env.mjs";
import { extractAiSection, numberedItems, stripMarkdown, truncate } from "./lib/markdown-utils.mjs";
import { sendWeComMarkdown } from "./lib/wecom.mjs";

const localEnv = await loadLocalEnv();
const webhook = process.env.WECOM_WEBHOOK_URL || localEnv.WECOM_WEBHOOK_URL;
const file = process.argv[2];

if (!webhook) {
  console.error("缺少 WECOM_WEBHOOK_URL。请设置环境变量或在 .env.local 中配置。");
  process.exit(2);
}

if (!file) {
  console.error("用法：node scripts/push-ai-daily-to-wecom.mjs <日报Markdown文件>");
  process.exit(2);
}

const text = await readFile(file, "utf8");
const title = text.match(/^#\s+(.+)$/m)?.[1]?.trim() || "AI 行业热点日报";

const summary = numberedItems(extractAiSection(text, /^## 1\. 今日摘要/m), 5)
  .map((item, index) => `${index + 1}. ${truncate(item, 180)}`)
  .join("\n");

const hotNews = [...extractAiSection(text, /^## 2\. 热点新闻/m).matchAll(/^###\s+(.+)$/gm)]
  .slice(0, 5)
  .map((match, index) => `${index + 1}. ${truncate(match[1], 120)}`)
  .join("\n");

const leads = numberedItems(extractAiSection(text, /^## 7\. 明日可追踪线索/m), 5)
  .map((item, index) => `${index + 1}. ${truncate(item, 160)}`)
  .join("\n");

const markdown = [
  `# ${stripMarkdown(title)}`,
  "",
  "## 今日摘要",
  summary || "本节无内容。",
  "",
  "## 热点新闻",
  hotNews || "本节无内容。",
  "",
  "## 明日线索",
  leads || "本节无内容。",
  "",
  `完整日报：${path.resolve(file)}`,
].join("\n");

await sendWeComMarkdown({ webhook, title, markdown });
