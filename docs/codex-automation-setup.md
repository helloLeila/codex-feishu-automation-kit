# Codex 自动化接入说明

这篇文档说明如何把一个“生成 Markdown 文件”的 Codex 自动化，改造成“生成文件后自动推送飞书 / Server 酱”的工作流。

## 数据流

```text
Codex 自动化
  -> 生成 Markdown 文件
  -> 运行推送命令
  -> 命令读取环境变量 / 显式 env 文件 / 工作区配置 / 用户级配置
  -> 脚本生成飞书 interactive card 或 Server 酱 desp 文本
  -> 推送到飞书群或微信相关通知通道
```

## 准备网址

飞书：

- 飞书开放平台：<https://open.feishu.cn/>
- 自定义机器人文档：<https://open.feishu.cn/document/client-docs/bot-v3/add-custom-bot>

Server 酱：

- Server 酱官网：<https://sct.ftqq.com/>
- Server 酱登录页：<https://sct.ftqq.com/login>

GitHub：

- 本工具包仓库：<https://github.com/helloLeila/codex-feishu-automation-kit>

## 密钥配置

推荐在你的 Codex 工作区根目录运行：

```bash
npm run gba
```

然后在菜单里选择 `配置推送地址偏好`。工具会先帮你打开飞书自定义机器人文档和 Server 酱登录页；登录后查看 SendKey。密钥默认保存到 `~/.config/codex-feishu-automation-kit/tech-events-assistant.local.json`，并设置权限 `0600`。

旧工作流仍然可以使用 `.env.local`：

```bash
FEISHU_WEBHOOK_URL="<FEISHU_WEBHOOK_URL>"
# FEISHU_WEBHOOK_SECRET="<FEISHU_WEBHOOK_SECRET>"
SERVERCHAN_SENDKEY="<SERVERCHAN_SENDKEY>"
```

说明：

- `FEISHU_WEBHOOK_URL`：飞书群自定义机器人的 webhook。
- `FEISHU_WEBHOOK_SECRET`：可选。只有飞书机器人开启签名校验时才需要。
- `SERVERCHAN_SENDKEY`：Server 酱后台拿到的 SendKey。

工作区内的 `tech-events-assistant.local.json` 和 `.env.local` 必须加入 `.gitignore`，不要提交。用户级配置在仓库外，也不要复制进仓库。

## 密钥读取顺序

脚本先合并低优先级文件，再让高优先级配置覆盖：

1. `$CODEX_HOME/codex-feishu-automation-kit/tech-events-assistant.local.json`。
2. `~/.config/codex-feishu-automation-kit/tech-events-assistant.local.json`。
3. 当前运行目录下的 `.env.local`。
4. 当前运行目录下的 `tech-events-assistant.local.json`。
5. `FEISHU_ENV_FILE` 或 `SERVERCHAN_ENV_FILE` 指向的 env 文件。
6. 进程环境变量：
   - `FEISHU_WEBHOOK_URL`
   - `FEISHU_WEBHOOK_SECRET`
   - `SERVERCHAN_SENDKEY`

后读取的同名值覆盖先读取的值；进程环境变量优先级最高。这样可以避免硬编码本地路径，也能兼容本地目录、git worktree 和 CI。

## 在已有工作区使用 GBA 推送命令

从本仓库根目录安装或链接全局命令：

```bash
npm install -g .
# 或开发时：
npm link
```

之后任意工作区都可以运行 `codex-feishu-push-gba-events <Markdown文件>`。同一台电脑、同一个 macOS 用户只需要配置一次密钥；切换 Codex 登录账号后不需要重填密钥，但需要重新导入已安排自动化任务。

## 为什么飞书和 Server 酱使用不同格式

飞书自定义机器人的普通 `post` 消息在不同客户端里对 Markdown 的渲染并不稳定，因此飞书侧使用 interactive card。

Server 酱的核心接口是 `title + desp`，适合把 Markdown 摘要作为微信相关通知通道的内容。它更适合“提醒我去看”，而不是完整呈现所有细节。完整正文建议继续保存在 Obsidian 或仓库 Markdown 文件里。

## AI 日报 Markdown 结构约定

AI 日报脚本默认识别这些标题：

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

缺少某些章节时脚本不会崩溃，但标题稳定时卡片效果最好。

## 活动清单 Markdown 结构约定

活动脚本默认识别这些标题：

```text
# 检索结果
# 快速卡片
# 完整档案
# 候补链接
# 备注
```

`快速卡片` 章节里建议使用多个 `## 活动 N｜...` 区块，并包含时间、城市、是否值得去、一句话理由和链接。

## 推荐自动化 prompt：AI 日报

```text
搜集过去 24 小时内值得 AI 自媒体博主和 AI 从业者关注的 AI 行业热点，并生成 Markdown 日报文件。

生成 Markdown 文件后，如果环境变量 FEISHU_WEBHOOK_URL 或当前配置中有飞书 webhook，请运行飞书推送脚本；如果环境变量 SERVERCHAN_SENDKEY 或当前配置中有 Server 酱 SendKey，请运行 Server 酱推送脚本。

如果两者都配置，请两个都推送；如果都未配置，请只生成文件并说明未推送。
```

## 推荐自动化 prompt：线下技术活动

更省事的方式：运行 `npm run gba`，按默认 4 步引导走到 `codex剪切板一键导入任务`。工具会读取 `tech-events-assistant.config.json`，生成 `tech-events-assistant.automation.md` 并尽量复制到剪切板，然后列出要做的事情：打开 Codex 的「自动化（已安排）」、选择「通过聊天添加」、粘贴 Prompt、按 Enter 直接运行，并在自动化列表里点击新任务查看效果。

名称、频率、运行时间、时区、检索区域、城市、领域、来源和交通出发点都来自配置文件：

```json
{
  "automation": {
    "name": "线下技术活动情报晨报",
    "frequency": "每天",
    "time": "07:00"
  },
  "eventSearch": {
    "regionName": "大湾区",
    "windowDays": 15,
    "travelOrigin": "深大地铁站",
    "cities": {
      "深圳": "高含金量和中含金量均可收录"
    },
    "topicPriority": [
      "AI Coding",
      "代码智能体",
      "云原生 / 数据库 / 后端工程 / 前端工程"
    ],
    "sources": [
      "Luma",
      "Meetup",
      "开发者社区"
    ]
  }
}
```

要从深圳 / 大湾区改到上海 / 长三角，不要手改生成后的 `tech-events-assistant.automation.md`。请先改 `tech-events-assistant.config.json` 的 `eventSearch`，再重新执行第 4 步生成新的 Prompt。

## 验证与排查

检查语法：

```bash
node --check scripts/push-ai-daily-to-feishu.mjs
node --check scripts/push-gba-events-to-feishu.mjs
node --check scripts/push-ai-daily-to-serverchan.mjs
node --check scripts/push-gba-events-to-serverchan.mjs
```

飞书推送格式检查（不发送）：

```bash
FEISHU_DRY_RUN=1 FEISHU_WEBHOOK_URL=<FEISHU_WEBHOOK_URL> node scripts/push-ai-daily-to-feishu.mjs ai-daily/YYYY-MM-DD-ai-daily.md
```

Server 酱推送格式检查（不发送）：

```bash
SERVERCHAN_DRY_RUN=1 SERVERCHAN_SENDKEY=<SERVERCHAN_SENDKEY> node scripts/push-ai-daily-to-serverchan.mjs ai-daily/YYYY-MM-DD-ai-daily.md
```

GBA 聚合命令格式检查（不发送）：

```bash
codex-feishu-push-gba-events --dry-run gba-events/YYYY-MM-DD-gba-events.md
```

检查用户级 `tech-events-assistant.local.json` 是否配置了密钥，但不打印真实值：

```bash
node -e "const fs=require('fs'), os=require('os'), path=require('path'); const p=path.join(os.homedir(), '.config/codex-feishu-automation-kit/tech-events-assistant.local.json'); const cfg=JSON.parse(fs.readFileSync(p,'utf8')); console.log({hasFeishu:Boolean(cfg.push?.feishuWebhookUrl), hasServerChan:Boolean(cfg.push?.serverChanSendKey)});"
```

常见问题：

- `缺少 FEISHU_WEBHOOK_URL`：用户级配置、当前运行目录配置和显式 env 文件里都没有飞书配置。
- `缺少 SERVERCHAN_SENDKEY`：用户级配置、当前运行目录配置和显式 env 文件里都没有 Server 酱配置。
- worktree 读不到密钥：优先使用用户级配置；如需覆盖，可用 `FEISHU_ENV_FILE=/absolute/path/to/.env.local` 或 `SERVERCHAN_ENV_FILE=/absolute/path/to/.env.local` 指定密钥文件。
- 飞书签名错误：检查机器人安全设置是否开启签名校验，并确认 `FEISHU_WEBHOOK_SECRET` 正确。
- Server 酱内容看起来比原文少：这是设计取舍。通知展示摘要，完整内容保留在原始 Markdown 文件。
