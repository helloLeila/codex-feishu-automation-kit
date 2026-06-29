---
name: feishu-automation-reporter
description: Use when configuring Codex automations or Markdown-producing workflows to send Feishu/Lark bot notifications, especially AI daily reports, event digests, weekly summaries, .env.local webhook setup, Feishu interactive cards, dry-run validation, signature verification, and troubleshooting missing pushes.
---

# Feishu Automation Reporter

Use this skill to wire a Markdown-producing Codex automation to a Feishu custom bot.

## Workflow

1. Confirm the automation produces a Markdown file with a stable path.
2. Add a local secret file or environment variables:

```bash
FEISHU_WEBHOOK_URL="https://open.feishu.cn/open-apis/bot/v2/hook/..."
# FEISHU_WEBHOOK_SECRET="optional-signature-secret"
```

3. Keep secrets out of git with `.gitignore`.
4. Choose a bundled script:
   - AI industry daily: `scripts/push-ai-daily-to-feishu.mjs`
   - Greater Bay Area event digest: `scripts/push-gba-events-to-feishu.mjs`
5. Add the push command to the automation prompt after Markdown generation.
6. Validate with `node --check` and `FEISHU_DRY_RUN=1`.

## Recommended Automation Prompt Snippet

For a daily AI report:

```text
After generating the Markdown file, if FEISHU_WEBHOOK_URL is configured in the environment or .env.local, run:
node scripts/push-ai-daily-to-feishu.mjs <generated-markdown-file>
If it is not configured, only generate the file and state that Feishu was not pushed.
```

For an event digest:

```text
After generating the Markdown file, if FEISHU_WEBHOOK_URL is configured in the environment or .env.local, run:
node scripts/push-gba-events-to-feishu.mjs <generated-markdown-file>
If it is not configured, only generate the file and state that Feishu was not pushed.
```

## Validation

Run syntax checks:

```bash
node --check scripts/push-ai-daily-to-feishu.mjs
node --check scripts/push-gba-events-to-feishu.mjs
```

Run dry-runs:

```bash
FEISHU_DRY_RUN=1 node scripts/push-ai-daily-to-feishu.mjs examples/ai-daily-example.md
FEISHU_DRY_RUN=1 node scripts/push-gba-events-to-feishu.mjs examples/gba-events-example.md
```

Run a real push only after confirming the webhook is configured:

```bash
node scripts/push-ai-daily-to-feishu.mjs examples/ai-daily-example.md
```

## Troubleshooting

- `Missing FEISHU_WEBHOOK_URL.`: set the environment variable or create `.env.local`.
- Signature errors: set `FEISHU_WEBHOOK_SECRET` when the bot enables signature verification.
- Card renders raw Markdown headings: split the Markdown into card blocks instead of sending the whole document as one block.
- Worktree automations cannot see `.env.local`: set `FEISHU_ENV_FILE=/absolute/path/to/.env.local`.
