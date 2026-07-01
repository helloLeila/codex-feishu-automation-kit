---
name: feishu-automation-reporter
description: 用于把 Codex 自动化或 Markdown 生成流程接入飞书 / Lark / Server 酱通知，特别适合 AI 日报、活动清单、周报摘要、.env.local 密钥配置、飞书卡片、Server 酱 SendKey、dry-run 验证、签名校验和未推送排查。
---

# 飞书 / Server 酱自动化推送

当用户希望把 Codex 自动化或其他 Markdown 生成流程推送到飞书 / Lark 或 Server 酱时，使用这个 Skill。

典型场景：

- AI 行业日报生成后推送飞书或 Server 酱。
- 大湾区活动清单生成后推送飞书或 Server 酱。
- 飞书负责完整卡片展示，Server 酱负责手机提醒。
- 配置 `.env.local`、webhook、SendKey、签名校验、dry-run 验证和未推送排查。

## 官方入口

- 飞书开放平台：`https://open.feishu.cn/`
- 飞书自定义机器人文档：`https://open.feishu.cn/document/client-docs/bot-v3/add-custom-bot`
- Server 酱官网：`https://sct.ftqq.com/`
- 工具包仓库：`https://github.com/helloLeila/codex-feishu-automation-kit`

## 工作流

1. 确认自动化会生成一个稳定路径的 Markdown 文件。
2. 配置本地 secret 文件或环境变量：

```bash
FEISHU_WEBHOOK_URL="<FEISHU_WEBHOOK_URL>"
# FEISHU_WEBHOOK_SECRET="<FEISHU_WEBHOOK_SECRET>"
SERVERCHAN_SENDKEY="<SERVERCHAN_SENDKEY>"
```

3. 确认 `.gitignore` 忽略 `.env.local`。
4. 选择脚本：
   - AI 行业日报到飞书：`scripts/push-ai-daily-to-feishu.mjs`
   - AI 行业日报到 Server 酱：`scripts/push-ai-daily-to-serverchan.mjs`
   - 大湾区活动清单到飞书：`scripts/push-gba-events-to-feishu.mjs`
   - 大湾区活动清单到 Server 酱：`scripts/push-gba-events-to-serverchan.mjs`
5. 在自动化 prompt 的 Markdown 生成步骤之后追加推送命令。
6. 使用 `node --check`、`FEISHU_DRY_RUN=1` 和 `SERVERCHAN_DRY_RUN=1` 验证。

## 给用户的配置说明

飞书 webhook 获取路径：

1. 进入飞书群设置。
2. 添加自定义机器人。
3. 复制 webhook，填入 `FEISHU_WEBHOOK_URL`。
4. 如果开启签名校验，复制签名密钥，填入 `FEISHU_WEBHOOK_SECRET`。

Server 酱 SendKey 获取路径：

1. 打开 `https://sct.ftqq.com/`。
2. 登录后进入 SendKey 页面。
3. 复制 SendKey，填入 `SERVERCHAN_SENDKEY`。
4. 按页面提示绑定微信相关通知通道。

不要展示、打印或提交真实 webhook、SendKey、签名密钥。

## 复制到已有工作区

如果用户不是直接在本仓库运行，而是在自己的 Codex 工作区运行，复制这些文件：

```bash
mkdir -p scripts/lib
cp skills/feishu-automation-reporter/scripts/push-ai-daily-to-feishu.mjs scripts/
cp skills/feishu-automation-reporter/scripts/push-gba-events-to-feishu.mjs scripts/
cp skills/feishu-automation-reporter/scripts/push-ai-daily-to-serverchan.mjs scripts/
cp skills/feishu-automation-reporter/scripts/push-gba-events-to-serverchan.mjs scripts/
cp skills/feishu-automation-reporter/scripts/lib/*.mjs scripts/lib/
```

## 推荐自动化 prompt 片段

AI 日报：

```text
生成 Markdown 文件后，如果环境变量 FEISHU_WEBHOOK_URL 已配置，或当前目录 .env.local 中配置了 FEISHU_WEBHOOK_URL，请运行：
node scripts/push-ai-daily-to-feishu.mjs <生成的Markdown文件路径>
如果环境变量 SERVERCHAN_SENDKEY 已配置，或当前目录 .env.local 中配置了 SERVERCHAN_SENDKEY，请运行：
node scripts/push-ai-daily-to-serverchan.mjs <生成的Markdown文件路径>
如果两者都配置，请两个都推送；如果都未配置，请只生成文件并说明未推送。
```

活动清单：

```text
生成 Markdown 文件后，如果环境变量 FEISHU_WEBHOOK_URL 已配置，或当前目录 .env.local 中配置了 FEISHU_WEBHOOK_URL，请运行：
node scripts/push-gba-events-to-feishu.mjs <生成的Markdown文件路径>
如果环境变量 SERVERCHAN_SENDKEY 已配置，或当前目录 .env.local 中配置了 SERVERCHAN_SENDKEY，请运行：
node scripts/push-gba-events-to-serverchan.mjs <生成的Markdown文件路径>
如果两者都配置，请两个都推送；如果都未配置，请只生成文件并说明未推送。
```

## 验证命令

```bash
node --check scripts/push-ai-daily-to-feishu.mjs
node --check scripts/push-gba-events-to-feishu.mjs
node --check scripts/push-ai-daily-to-serverchan.mjs
node --check scripts/push-gba-events-to-serverchan.mjs
```

dry-run：

```bash
FEISHU_DRY_RUN=1 node scripts/push-ai-daily-to-feishu.mjs examples/ai-daily-example.md
FEISHU_DRY_RUN=1 node scripts/push-gba-events-to-feishu.mjs examples/gba-events-example.md
SERVERCHAN_DRY_RUN=1 SERVERCHAN_SENDKEY=<SERVERCHAN_SENDKEY> node scripts/push-ai-daily-to-serverchan.mjs examples/ai-daily-example.md
SERVERCHAN_DRY_RUN=1 SERVERCHAN_SENDKEY=<SERVERCHAN_SENDKEY> node scripts/push-gba-events-to-serverchan.mjs examples/gba-events-example.md
```

## 排查

- `缺少 FEISHU_WEBHOOK_URL`：配置环境变量或创建 `.env.local`。
- `缺少 SERVERCHAN_SENDKEY`：配置环境变量或创建 `.env.local`。
- 飞书签名错误：机器人开启签名校验时，需要配置 `FEISHU_WEBHOOK_SECRET`。
- 飞书卡片里 Markdown 标题原样显示：不要整篇 Markdown 直接塞进一个文本块，应拆成多个 card elements。
- worktree 自动化读不到 `.env.local`：使用 `FEISHU_ENV_FILE=/absolute/path/to/.env.local` 或 `SERVERCHAN_ENV_FILE=/absolute/path/to/.env.local` 指定密钥文件。
