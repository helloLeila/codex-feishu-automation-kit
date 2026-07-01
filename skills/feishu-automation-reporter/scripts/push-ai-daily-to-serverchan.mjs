#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadLocalEnv } from "./lib/env.mjs";
import { extractAiSection, numberedItems, stripMarkdown, truncate } from "./lib/markdown-utils.mjs";
import { sendServerChan } from "./lib/serverchan.mjs";

const localEnv = await loadLocalEnv();
const sendKey = process.env.SERVERCHAN_SENDKEY || localEnv.SERVERCHAN_SENDKEY;
const file = process.argv[2];

if (!sendKey) {
  console.error("缺少 SERVERCHAN_SENDKEY。请设置环境变量或在 .env.local 中配置。");
  process.exit(2);
}

if (!file) {
  console.error("用法：node scripts/push-ai-daily-to-serverchan.mjs <日报Markdown文件>");
  process.exit(2);
}

const text = await readFile(file, "utf8");
const title = text.match(/^#\s+(.+)$/m)?.[1]?.trim() || "AI 行业热点日报";

const compactList = (items, max = 260) =>
  items
    .map((item, index) => `${index + 1}. ${truncate(item, max)}`)
    .join("\n");

const subheadings = (section, limit = 8) =>
  [...section.matchAll(/^###\s+(.+)$/gm)]
    .map((match) => stripMarkdown(match[1]))
    .slice(0, limit);

const summary = compactList(numberedItems(extractAiSection(text, /^## 1\. 今日摘要/m), 5), 260);

const parseHotNews = (sectionText) => {
  const headingMatches = [...sectionText.matchAll(/^###\s+(.+)$/gm)];
  return headingMatches.slice(0, 8).map((match, index) => {
    const next = headingMatches[index + 1];
    const bodyStart = match.index + match[0].length;
    const bodyEnd = next ? next.index : sectionText.length;
    const body = sectionText.slice(bodyStart, bodyEnd);
    const overview = body.match(/- \*\*事件概述\*\*：(.+)/)?.[1] || "";
    const why = body.match(/- \*\*为什么重要\*\*：(.+)/)?.[1] || "";
    const links = body.match(/- \*\*来源链接\*\*：(.+)/)?.[1] || "";
    return [
      `${index + 1}. ${truncate(match[1], 140)}`,
      overview ? `   事件：${truncate(overview, 220)}` : "",
      why ? `   重要性：${truncate(why, 220)}` : "",
      links ? `   来源：${truncate(links, 180)}` : "",
    ].filter(Boolean).join("\n");
  });
};

const hotNews = parseHotNews(extractAiSection(text, /^## 2\. 热点新闻/m))
  .join("\n");

const productUpdates = compactList(subheadings(extractAiSection(text, /^## 3\. 模型与产品更新/m), 8), 180);
const companyPolicy = compactList(subheadings(extractAiSection(text, /^## 4\. 投融资、公司动态与政策监管/m), 8), 180);
const techTrends = compactList(subheadings(extractAiSection(text, /^## 5\. 开源项目、论文或技术趋势/m), 8), 180);

const leads = compactList(numberedItems(extractAiSection(text, /^## 7\. 明日可追踪线索/m), 8), 220);

const desp = [
  `# ${stripMarkdown(title)}`,
  "",
  "## 今日摘要",
  summary || "本节无内容。",
  "",
  "## 热点新闻",
  hotNews || "本节无内容。",
  "",
  "## 模型与产品更新",
  productUpdates || "本节无内容。",
  "",
  "## 公司动态与政策监管",
  companyPolicy || "本节无内容。",
  "",
  "## 开源项目 / 论文 / 技术趋势",
  techTrends || "本节无内容。",
  "",
  "## 明日线索",
  leads || "本节无内容。",
  "",
  `完整日报：${path.resolve(file)}`,
].join("\n");

await sendServerChan({
  sendKey,
  title: "Codex｜AI 行业日报",
  desp,
});
