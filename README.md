# Codex 群机器人自动化工具包

把 Codex 自动化生成的 Markdown 日报、周报、活动清单等内容，推送到飞书 / Lark 或企业微信群机器人。

这个仓库适合这些场景：

- AI 行业日报生成后自动推送到群。
- 大湾区技术活动清单生成后自动推送到群。
- 周报、监控结果、调研摘要等 Markdown 文件需要变成群通知。
- 想把“配置 webhook、生成卡片、dry-run 验证、排查未推送”沉淀成可复用 Codex Skill。

## 目录结构

```text
skills/feishu-automation-reporter/
  SKILL.md
  scripts/
    lib/
    push-ai-daily-to-feishu.mjs
    push-gba-events-to-feishu.mjs
    push-ai-daily-to-wecom.mjs
    push-gba-events-to-wecom.mjs
examples/
  .env.local.example
  ai-daily-example.md
  gba-events-example.md
docs/
  codex-automation-setup.md
  release-checklist.md
scripts/
  setup.sh
```

## 环境要求

- Node.js 18 或更高版本。
- 一个飞书 / Lark 自定义机器人 webhook，或一个企业微信群机器人 webhook。
- 一个由 Codex 自动化或其他流程生成的 Markdown 文件。

脚本只使用 Node.js 内置模块和现代 Node 自带的 `fetch`，不需要安装 npm 依赖。

## 一键配置

运行：

```bash
bash scripts/setup.sh
```

脚本会做三件事：

1. 如果没有 `.env.local`，从 `examples/.env.local.example` 复制一份。
2. 检查 Node.js 是否可用。
3. 使用示例 Markdown 跑飞书和企业微信 dry-run 验证命令。

然后编辑 `.env.local`：

```bash
FEISHU_WEBHOOK_URL="https://open.feishu.cn/open-apis/bot/v2/hook/replace-me"
# WECOM_WEBHOOK_URL="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=replace-me"
```

如果机器人开启了签名校验，再加：

```bash
FEISHU_WEBHOOK_SECRET="replace-me"
```

`.env.local` 已被 `.gitignore` 忽略，不应提交到 GitHub。

## 推送 AI 日报

推送到飞书：

```bash
node skills/feishu-automation-reporter/scripts/push-ai-daily-to-feishu.mjs examples/ai-daily-example.md
```

推送到企业微信：

```bash
node skills/feishu-automation-reporter/scripts/push-ai-daily-to-wecom.mjs examples/ai-daily-example.md
```

只生成飞书卡片 JSON，不发送：

```bash
FEISHU_DRY_RUN=1 node skills/feishu-automation-reporter/scripts/push-ai-daily-to-feishu.mjs examples/ai-daily-example.md
```

只生成企业微信消息 JSON，不发送：

```bash
WECOM_DRY_RUN=1 WECOM_WEBHOOK_URL=https://example.com node skills/feishu-automation-reporter/scripts/push-ai-daily-to-wecom.mjs examples/ai-daily-example.md
```

## 推送大湾区活动清单

推送到飞书：

```bash
node skills/feishu-automation-reporter/scripts/push-gba-events-to-feishu.mjs examples/gba-events-example.md
```

推送到企业微信：

```bash
node skills/feishu-automation-reporter/scripts/push-gba-events-to-wecom.mjs examples/gba-events-example.md
```

只生成飞书卡片 JSON，不发送：

```bash
FEISHU_DRY_RUN=1 node skills/feishu-automation-reporter/scripts/push-gba-events-to-feishu.mjs examples/gba-events-example.md
```

只生成企业微信消息 JSON，不发送：

```bash
WECOM_DRY_RUN=1 WECOM_WEBHOOK_URL=https://example.com node skills/feishu-automation-reporter/scripts/push-gba-events-to-wecom.mjs examples/gba-events-example.md
```

## 在 Codex 自动化里使用

把下面内容加到自动化 prompt 的结尾，要求自动化在生成 Markdown 后执行推送。

AI 日报：

```text
生成 Markdown 文件后，如果环境变量 FEISHU_WEBHOOK_URL 已配置，或当前目录 .env.local 中配置了 FEISHU_WEBHOOK_URL，请运行：
node skills/feishu-automation-reporter/scripts/push-ai-daily-to-feishu.mjs <生成的Markdown文件路径>
如果环境变量 WECOM_WEBHOOK_URL 已配置，或当前目录 .env.local 中配置了 WECOM_WEBHOOK_URL，请运行：
node skills/feishu-automation-reporter/scripts/push-ai-daily-to-wecom.mjs <生成的Markdown文件路径>
如果都未配置，请只生成文件并说明未推送。
```

大湾区活动：

```text
生成 Markdown 文件后，如果环境变量 FEISHU_WEBHOOK_URL 已配置，或当前目录 .env.local 中配置了 FEISHU_WEBHOOK_URL，请运行：
node skills/feishu-automation-reporter/scripts/push-gba-events-to-feishu.mjs <生成的Markdown文件路径>
如果环境变量 WECOM_WEBHOOK_URL 已配置，或当前目录 .env.local 中配置了 WECOM_WEBHOOK_URL，请运行：
node skills/feishu-automation-reporter/scripts/push-gba-events-to-wecom.mjs <生成的Markdown文件路径>
如果都未配置，请只生成文件并说明未推送。
```

## 使用 Skill

`skills/feishu-automation-reporter` 是一个 Codex Skill。把它复制到你的 Codex skills 目录，或通过你的 Codex 环境从该仓库安装。

适合在这些任务中触发：

- 给 Markdown 生成类自动化增加飞书或企业微信推送。
- 配置 `.env.local`、飞书 webhook 和企业微信 webhook。
- 生成或改造飞书 interactive card 脚本。
- 排查为什么自动化没有推送。
- 使用 `FEISHU_DRY_RUN=1` 验证卡片结构。

## 验证命令

```bash
node --check skills/feishu-automation-reporter/scripts/push-ai-daily-to-feishu.mjs
node --check skills/feishu-automation-reporter/scripts/push-gba-events-to-feishu.mjs
node --check skills/feishu-automation-reporter/scripts/push-ai-daily-to-wecom.mjs
node --check skills/feishu-automation-reporter/scripts/push-gba-events-to-wecom.mjs
FEISHU_DRY_RUN=1 FEISHU_WEBHOOK_URL=https://example.com node skills/feishu-automation-reporter/scripts/push-ai-daily-to-feishu.mjs examples/ai-daily-example.md
FEISHU_DRY_RUN=1 FEISHU_WEBHOOK_URL=https://example.com node skills/feishu-automation-reporter/scripts/push-gba-events-to-feishu.mjs examples/gba-events-example.md
WECOM_DRY_RUN=1 WECOM_WEBHOOK_URL=https://example.com node skills/feishu-automation-reporter/scripts/push-ai-daily-to-wecom.mjs examples/ai-daily-example.md
WECOM_DRY_RUN=1 WECOM_WEBHOOK_URL=https://example.com node skills/feishu-automation-reporter/scripts/push-gba-events-to-wecom.mjs examples/gba-events-example.md
```

## 安全提醒

- 不要提交 `.env.local`。
- 不要把真实 webhook 写进 README、示例、issue、截图或 prompt。
- 如果 webhook 泄露，立即在机器人设置里重置。
- worktree 或 CI 场景建议使用 `FEISHU_ENV_FILE=/absolute/path/to/.env.local` 或 `WECOM_ENV_FILE=/absolute/path/to/.env.local` 指定密钥文件路径。
