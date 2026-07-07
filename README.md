# Codex 飞书 / Server 酱自动化工具包

把 Codex 自动化生成的 Markdown 日报、周报、活动清单等内容，推送到飞书群或 Server 酱。飞书适合展示结构化卡片，Server 酱适合把手机提醒送到微信相关通知通道。

GitHub 仓库地址：<https://github.com/helloLeila/codex-feishu-automation-kit>

适合这些场景：

- AI 行业日报生成后自动推送。
- 大湾区技术活动清单生成后自动推送。
- 周报、监控结果、调研摘要等 Markdown 文件需要变成通知。
- 想把“配置 webhook / SendKey、生成卡片、dry-run 验证、排查未推送”沉淀成可复用 Codex Skill。

## 快速开始

先克隆仓库并进入目录：

```bash
git clone https://github.com/helloLeila/codex-feishu-automation-kit.git
cd codex-feishu-automation-kit
```

运行一个入口：

```bash
npm run gba
```

你会看到一个彩色菜单：

```text
1. 安装 / 更新活动助手
2. 配置推送和偏好
3. 预览 / 测试推送
4. 检查状态
5. 查看活动搜寻接入步骤
0. 退出
```

第 5 项不会自动添加或触发 Codex 桌面端里的 Automation；它会告诉你已有自动化时怎么 Run now、没有自动化时去哪里复制 prompt 新建。这个工具负责把本地配置、推送脚本和 dry-run 检查收拢好。

保存配置时会显示步骤流：

```text
配置推送
│
├─ ✓ 读取现有配置
├─ ✓ 合并本次输入
├─ ✓ 写入本地配置
└─ ✓ 准备推送脚本

完成：tech-events-assistant.local.json 已保存
```

不需要安装 npm 依赖；脚本只使用 Node.js 内置模块。Node.js 版本需要 18 或更高。

如果想一次跑完本地检查：

```bash
bash scripts/setup.sh
```

这个脚本会：

1. 检查 Node.js 版本是否为 18 或更高。
2. 检查是否已有 `tech-events-assistant.local.json`，不会自动写入占位密钥。
3. 运行 `npm run check` 做语法检查。
4. 运行 `npm test`。
5. 使用示例 Markdown 做 dry-run，不会真实发送消息。

## 配置文件

这个工具包使用三个明显命名的配置文件：

- `tech-events-assistant.config.json`：普通配置，可以提交。
- `tech-events-assistant.local.json`：本机私密配置，保存飞书 webhook、飞书签名密钥、Server 酱 SendKey，不提交。
- `tech-events-assistant.config.example.json`：示例配置。

推荐在 `npm run gba` 的菜单里选择 `配置推送和偏好` 输入密钥。输入留空会保留原值，输入 `clear` 会清空该项；最后选择不保存就不会写入文件。

`.env.local` 仍然兼容旧工作流，但新用户优先使用 `tech-events-assistant.local.json`。

## 去哪里拿密钥

飞书机器人：

1. 打开飞书开放平台文档：<https://open.feishu.cn/document/client-docs/bot-v3/add-custom-bot>
2. 在飞书群里进入“群设置”。
3. 找到“机器人”或“群机器人”，添加“自定义机器人”。
4. 复制生成的 webhook，填到菜单里的飞书 webhook URL。
5. 如果你在机器人安全设置里开启了“签名校验”，把签名密钥填到菜单里的飞书签名密钥。

飞书开放平台入口：<https://open.feishu.cn/>

Server 酱：

1. 打开 Server 酱官网：<https://sct.ftqq.com/>
2. 登录后进入 SendKey 页面。
3. 复制自己的 SendKey，填到菜单里的 Server 酱 SendKey。
4. 按 Server 酱页面提示绑定微信相关通知通道。

## 在自己的 Codex 工作区使用

如果你的日报和活动文件已经在另一个 Codex 工作区生成，可以把脚本复制过去。从本仓库根目录执行：

```bash
mkdir -p /path/to/your-codex-workspace/scripts/lib
cp skills/feishu-automation-reporter/scripts/push-ai-daily-to-feishu.mjs /path/to/your-codex-workspace/scripts/
cp skills/feishu-automation-reporter/scripts/push-gba-events-to-feishu.mjs /path/to/your-codex-workspace/scripts/
cp skills/feishu-automation-reporter/scripts/push-ai-daily-to-serverchan.mjs /path/to/your-codex-workspace/scripts/
cp skills/feishu-automation-reporter/scripts/push-gba-events-to-serverchan.mjs /path/to/your-codex-workspace/scripts/
cp skills/feishu-automation-reporter/scripts/lib/*.mjs /path/to/your-codex-workspace/scripts/lib/
cp tech-events-assistant.config.example.json /path/to/your-codex-workspace/tech-events-assistant.config.json
```

把 `/path/to/your-codex-workspace` 替换成你的实际工作区路径。复制完成后，在目标工作区运行 `npm run gba`，用菜单配置真实密钥。

## 推送 AI 日报

推送到飞书：

```bash
node skills/feishu-automation-reporter/scripts/push-ai-daily-to-feishu.mjs examples/ai-daily-example.md
```

推送到 Server 酱：

```bash
node skills/feishu-automation-reporter/scripts/push-ai-daily-to-serverchan.mjs examples/ai-daily-example.md
```

如果你已经把脚本复制到自己的工作区 `scripts/` 目录，命令改成：

```bash
node scripts/push-ai-daily-to-feishu.mjs ai-daily/YYYY-MM-DD-ai-daily.md
node scripts/push-ai-daily-to-serverchan.mjs ai-daily/YYYY-MM-DD-ai-daily.md
```

## 推送大湾区活动清单

推送到飞书：

```bash
node skills/feishu-automation-reporter/scripts/push-gba-events-to-feishu.mjs examples/gba-events-example.md
```

推送到 Server 酱：

```bash
node skills/feishu-automation-reporter/scripts/push-gba-events-to-serverchan.mjs examples/gba-events-example.md
```

如果你已经把脚本复制到自己的工作区 `scripts/` 目录，命令改成：

```bash
node scripts/push-gba-events-to-feishu.mjs gba-events/YYYY-MM-DD-gba-events.md
node scripts/push-gba-events-to-serverchan.mjs gba-events/YYYY-MM-DD-gba-events.md
```

## Codex 自动化提示词模板

把下面片段追加到对应自动化 prompt 的结尾。重点是让 Codex 在生成 Markdown 后，根据 `tech-events-assistant.local.json`、`.env.local` 或环境变量自动决定是否推送。

AI 行业日报：

```text
生成 Markdown 文件后，如果环境变量 FEISHU_WEBHOOK_URL 已配置，或当前目录 tech-events-assistant.local.json / .env.local 中配置了飞书 webhook，请运行：
node scripts/push-ai-daily-to-feishu.mjs <生成的Markdown文件路径>
如果环境变量 SERVERCHAN_SENDKEY 已配置，或当前目录 tech-events-assistant.local.json / .env.local 中配置了 Server 酱 SendKey，请运行：
node scripts/push-ai-daily-to-serverchan.mjs <生成的Markdown文件路径>
如果两者都配置，请两个都推送；如果都未配置，请只生成文件并说明未推送。
```

大湾区活动清单：

```text
生成 Markdown 文件后，如果环境变量 FEISHU_WEBHOOK_URL 已配置，或当前目录 tech-events-assistant.local.json / .env.local 中配置了飞书 webhook，请运行：
node scripts/push-gba-events-to-feishu.mjs <生成的Markdown文件路径>
如果环境变量 SERVERCHAN_SENDKEY 已配置，或当前目录 tech-events-assistant.local.json / .env.local 中配置了 Server 酱 SendKey，请运行：
node scripts/push-gba-events-to-serverchan.mjs <生成的Markdown文件路径>
如果两者都配置，请两个都推送；如果都未配置，请只生成文件并说明未推送。
```

如果你的自动化运行在 git worktree、CI 或其他目录，推荐把 env 文件路径写清楚：

```text
如果当前目录读不到 tech-events-assistant.local.json 或 .env.local，请使用 FEISHU_ENV_FILE=/absolute/path/to/.env.local 或 SERVERCHAN_ENV_FILE=/absolute/path/to/.env.local 指定密钥文件。
```

## Dry-run 验证

dry-run 只生成请求内容，不会真实发送。

```bash
FEISHU_DRY_RUN=1 FEISHU_WEBHOOK_URL=<FEISHU_WEBHOOK_URL> node skills/feishu-automation-reporter/scripts/push-ai-daily-to-feishu.mjs examples/ai-daily-example.md
FEISHU_DRY_RUN=1 FEISHU_WEBHOOK_URL=<FEISHU_WEBHOOK_URL> node skills/feishu-automation-reporter/scripts/push-gba-events-to-feishu.mjs examples/gba-events-example.md
SERVERCHAN_DRY_RUN=1 SERVERCHAN_SENDKEY=<SERVERCHAN_SENDKEY> node skills/feishu-automation-reporter/scripts/push-ai-daily-to-serverchan.mjs examples/ai-daily-example.md
SERVERCHAN_DRY_RUN=1 SERVERCHAN_SENDKEY=<SERVERCHAN_SENDKEY> node skills/feishu-automation-reporter/scripts/push-gba-events-to-serverchan.mjs examples/gba-events-example.md
```

## 使用 Skill

`skills/feishu-automation-reporter` 是一个 Codex Skill。把它复制到你的 Codex skills 目录，或通过你的 Codex 环境从该仓库安装。

适合在这些任务中触发：

- 给 Markdown 生成类自动化增加飞书或 Server 酱推送。
- 配置 `tech-events-assistant.local.json`、`.env.local`、飞书 webhook 和 Server 酱 SendKey。
- 生成或改造飞书 interactive card 脚本。
- 生成或改造 Server 酱通知脚本。
- 排查为什么自动化没有推送。
- 使用 dry-run 验证卡片或请求结构。

## 目录结构

```text
skills/feishu-automation-reporter/
  SKILL.md
  scripts/
    lib/
    push-ai-daily-to-feishu.mjs
    push-gba-events-to-feishu.mjs
    push-ai-daily-to-serverchan.mjs
    push-gba-events-to-serverchan.mjs
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

脚本只使用 Node.js 内置模块和现代 Node 自带的 `fetch`，不需要安装 npm 依赖。

## 常见问题

`缺少 FEISHU_WEBHOOK_URL`：没有配置飞书 webhook。检查 `tech-events-assistant.local.json` 或 `.env.local` 是否在当前运行目录，或用 `FEISHU_ENV_FILE=/absolute/path/to/.env.local` 指定。

`缺少 SERVERCHAN_SENDKEY`：没有配置 Server 酱 SendKey。检查 `tech-events-assistant.local.json` 或 `.env.local` 是否在当前运行目录，或用 `SERVERCHAN_ENV_FILE=/absolute/path/to/.env.local` 指定。

飞书推送失败且提示签名错误：机器人开启了签名校验，但没有配置 `FEISHU_WEBHOOK_SECRET`，或密钥填错。

Server 酱消息不完整：Server 酱适合提醒和摘要，不适合完整替代 Obsidian 原文。建议在 Markdown 中保留来源路径或链接，通知里展示摘要和原始文件路径。

## 安全提醒

- 不要提交 `.env.local`。
- 不要提交 `tech-events-assistant.local.json`。
- 不要把真实 webhook、SendKey 或签名密钥写进 README、示例、issue、截图或 prompt。
- 如果密钥泄露，立即在对应平台重置。
- 开源前运行 `docs/release-checklist.md` 里的扫描命令。
