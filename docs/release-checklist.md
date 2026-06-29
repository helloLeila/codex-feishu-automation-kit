# Release Checklist

Use this before publishing the repository.

## Secret Safety

- [ ] `.env.local` is not present in git.
- [ ] No real `FEISHU_WEBHOOK_URL` appears in docs, examples, issues, or screenshots.
- [ ] No real `FEISHU_WEBHOOK_SECRET` appears in docs, examples, issues, or screenshots.
- [ ] Search for local private paths:

```bash
rg -n "Users/|Obsidian Vault|open-apis/bot/v2/hook/[0-9a-fA-F-]{8,}" .
```

Expected: no output.

## Validation

```bash
node --check skills/feishu-automation-reporter/scripts/push-ai-daily-to-feishu.mjs
node --check skills/feishu-automation-reporter/scripts/push-gba-events-to-feishu.mjs
FEISHU_DRY_RUN=1 FEISHU_WEBHOOK_URL=https://example.com node skills/feishu-automation-reporter/scripts/push-ai-daily-to-feishu.mjs examples/ai-daily-example.md
FEISHU_DRY_RUN=1 FEISHU_WEBHOOK_URL=https://example.com node skills/feishu-automation-reporter/scripts/push-gba-events-to-feishu.mjs examples/gba-events-example.md
```

Expected:

- Both `node --check` commands exit with code 0.
- Both dry-run commands print JSON with `msg_type: "interactive"`.

## GitHub Publish

```bash
git init
git add .
git commit -m "feat: add codex feishu automation kit"
git branch -M main
git remote add origin git@github.com:<owner>/codex-feishu-automation-kit.git
git push -u origin main
```

Replace `<owner>` before running the remote command.
