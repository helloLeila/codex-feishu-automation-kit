# Codex Automation Setup

This guide describes the reusable pattern behind the kit.

## Data Flow

```text
Codex automation
  -> generates Markdown
  -> runs a push script
  -> script reads FEISHU_WEBHOOK_URL
  -> script builds a Feishu interactive card
  -> Feishu custom bot posts to a group
```

## Secret Loading Order

The scripts look for secrets in this order:

1. Process environment variables:
   - `FEISHU_WEBHOOK_URL`
   - `FEISHU_WEBHOOK_SECRET`
2. Env file pointed to by `FEISHU_ENV_FILE`.
3. `.env.local` in the current working directory.

This avoids hard-coded local paths and works in local folders, worktrees, and CI.

## Why Interactive Cards

Feishu custom bot `post` messages do not reliably render full Markdown in every client. Interactive cards let the script split a Markdown report into stable sections such as summary, headlines, candidates, and notes.

## AI Daily Markdown Contract

The AI daily script expects headings like:

```text
# 2026-06-29 AI 行业热点日报
## 1. 今日摘要
## 2. 热点新闻
## 3. 模型与产品更新
## 4. 投融资、公司动态与政策监管
## 5. 开源项目、论文或技术趋势
## 6. 可直接用于选题
## 7. 明日可追踪线索
## 来源列表
```

Missing sections are tolerated, but the card is more useful when headings are stable.

## Event Digest Markdown Contract

The event script expects headings like:

```text
# 检索结果
# 快速卡片
# 完整档案
# 候补链接
# 备注
```

The `快速卡片` section should contain repeated `## 活动 N｜...` blocks with fields such as time, city, value judgment, reason, and link.

## Recommended Codex Prompt Addition

```text
After generating the Markdown file, if FEISHU_WEBHOOK_URL is configured in the environment or .env.local, run:
node <script-path> <generated-markdown-file>
If it is not configured, only generate the file and state that Feishu was not pushed.
```

## Troubleshooting

Check syntax:

```bash
node --check skills/feishu-automation-reporter/scripts/push-ai-daily-to-feishu.mjs
node --check skills/feishu-automation-reporter/scripts/push-gba-events-to-feishu.mjs
```

Check card payload without sending:

```bash
FEISHU_DRY_RUN=1 node skills/feishu-automation-reporter/scripts/push-ai-daily-to-feishu.mjs examples/ai-daily-example.md
```

Check whether a secret exists without printing it:

```bash
node -e "const fs=require('fs'); const text=fs.readFileSync('.env.local','utf8'); console.log({hasWebhook:/^FEISHU_WEBHOOK_URL=.+/m.test(text)});"
```
