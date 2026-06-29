# 发布前检查清单

开源或发版前按这份清单检查。

## 密钥安全

- [ ] `.env.local` 没有进入 git。
- [ ] README、示例、issue、截图里没有真实 `FEISHU_WEBHOOK_URL`。
- [ ] README、示例、issue、截图里没有真实 `FEISHU_WEBHOOK_SECRET`。
- [ ] 扫描本地私人路径和疑似 webhook：

```bash
rg -n "Users/|Obsidian Vault|open-apis/bot/v2/hook/[0-9a-fA-F-]{8,}" .
```

预期：没有输出。

## 功能验证

```bash
node --check skills/feishu-automation-reporter/scripts/push-ai-daily-to-feishu.mjs
node --check skills/feishu-automation-reporter/scripts/push-gba-events-to-feishu.mjs
FEISHU_DRY_RUN=1 FEISHU_WEBHOOK_URL=https://example.com node skills/feishu-automation-reporter/scripts/push-ai-daily-to-feishu.mjs examples/ai-daily-example.md
FEISHU_DRY_RUN=1 FEISHU_WEBHOOK_URL=https://example.com node skills/feishu-automation-reporter/scripts/push-gba-events-to-feishu.mjs examples/gba-events-example.md
```

预期：

- 两条 `node --check` 命令退出码为 0。
- 两条 dry-run 命令输出 JSON，且 `msg_type` 为 `interactive`。

## GitHub 发布

```bash
git init
git add .
git commit -m "feat: add codex feishu automation kit"
git branch -M main
git remote add origin git@github.com:<owner>/codex-feishu-automation-kit.git
git push -u origin main
```

运行前把 `<owner>` 替换成你的 GitHub 用户名或组织名。
