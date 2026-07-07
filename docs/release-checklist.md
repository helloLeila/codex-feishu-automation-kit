# 发布前检查清单

开源或发版前按这份清单检查。

## 密钥安全

- [ ] `.env.local` 没有进入 git。
- [ ] `tech-events-assistant.local.json` 没有进入 git。
- [ ] README、示例、issue、截图里没有真实 `FEISHU_WEBHOOK_URL` 或 `SERVERCHAN_SENDKEY`。
- [ ] README、示例、issue、截图里没有真实 `FEISHU_WEBHOOK_SECRET`。
- [ ] 文档里只使用 `<FEISHU_WEBHOOK_URL>`、`<SERVERCHAN_SENDKEY>` 这类占位符，不写完整 webhook 形状。
- [ ] 扫描本地私人路径和疑似密钥：

```bash
rg -n "Users/|Obsidian Vault|open-apis/bot/v2/hook/[0-9a-fA-F-]{8,}|SCT[0-9a-zA-Z]{12,}|qyapi\\.weixin" . --glob '!docs/release-checklist.md'
```

预期：没有输出。

## 文档完整性

- [ ] README 包含 GitHub 仓库地址。
- [ ] README 包含飞书开放平台、自定义机器人文档、Server 酱登录页和 SendKey 获取说明。
- [ ] README 包含 `npm run gba`、`tech-events-assistant.config.json` 和 `tech-events-assistant.local.json` 说明。
- [ ] README 说明第 2 步会帮助打开飞书 / Server 酱取值页面。
- [ ] README 包含 AI 日报和大湾区活动的 Codex 自动化 prompt 片段。
- [ ] README 包含复制脚本到已有 Codex 工作区的命令。
- [ ] `docs/codex-automation-setup.md` 包含密钥读取顺序和排查方法。

## 功能验证

```bash
npm run check
npm test
npm run gba -- --dry-run
```

预期：

- 四条 `node --check` 命令退出码为 0。
- `npm run gba -- --dry-run` 显示“推送格式检查（不发送）”。
- 飞书卡片和 Server 酱消息预览均生成成功，且不会真实发送。

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
