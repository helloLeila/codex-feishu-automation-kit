# Codex 自动化接入说明

这篇文档说明如何把一个“生成 Markdown 文件”的 Codex 自动化，改造成“生成文件后自动推送飞书 / Server 酱”的工作流。

## 数据流

```text
Codex 自动化
  -> 生成 Markdown 文件
  -> 运行推送脚本
  -> 脚本读取 tech-events-assistant.local.json / .env.local / 环境变量
  -> 脚本生成飞书 interactive card 或 Server 酱 desp 文本
  -> 推送到飞书群或微信相关通知通道
```

## 准备网址

飞书：

- 飞书开放平台：<https://open.feishu.cn/>
- 自定义机器人文档：<https://open.feishu.cn/document/client-docs/bot-v3/add-custom-bot>

Server 酱：

- Server 酱官网：<https://sct.ftqq.com/>

GitHub：

- 本工具包仓库：<https://github.com/helloLeila/codex-feishu-automation-kit>

## 密钥配置

推荐在你的 Codex 工作区根目录运行：

```bash
npm run gba
```

然后在菜单里选择 `配置推送和偏好`。密钥会保存到 `tech-events-assistant.local.json`，这个文件不要提交。

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

`tech-events-assistant.local.json` 和 `.env.local` 必须加入 `.gitignore`，不要提交。

## 密钥读取顺序

脚本按顺序读取：

1. 进程环境变量：
   - `FEISHU_WEBHOOK_URL`
   - `FEISHU_WEBHOOK_SECRET`
   - `SERVERCHAN_SENDKEY`
2. `FEISHU_ENV_FILE` 或 `SERVERCHAN_ENV_FILE` 指向的 env 文件。
3. 当前运行目录下的 `tech-events-assistant.local.json`。
4. 当前运行目录下的 `.env.local`。

这样可以避免硬编码本地路径，也能兼容本地目录、git worktree 和 CI。

## 把脚本复制到已有工作区

从本仓库根目录执行：

```bash
mkdir -p /path/to/your-codex-workspace/scripts/lib
cp skills/feishu-automation-reporter/scripts/push-ai-daily-to-feishu.mjs /path/to/your-codex-workspace/scripts/
cp skills/feishu-automation-reporter/scripts/push-gba-events-to-feishu.mjs /path/to/your-codex-workspace/scripts/
cp skills/feishu-automation-reporter/scripts/push-ai-daily-to-serverchan.mjs /path/to/your-codex-workspace/scripts/
cp skills/feishu-automation-reporter/scripts/push-gba-events-to-serverchan.mjs /path/to/your-codex-workspace/scripts/
cp skills/feishu-automation-reporter/scripts/lib/*.mjs /path/to/your-codex-workspace/scripts/lib/
cp tech-events-assistant.config.example.json /path/to/your-codex-workspace/tech-events-assistant.config.json
```

复制后，在目标工作区运行 `npm run gba`，用菜单填入真实密钥。

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

生成 Markdown 文件后，如果环境变量 FEISHU_WEBHOOK_URL 已配置，或当前目录 tech-events-assistant.local.json / .env.local 中配置了飞书 webhook，请运行：
node scripts/push-ai-daily-to-feishu.mjs <生成的Markdown文件路径>

如果环境变量 SERVERCHAN_SENDKEY 已配置，或当前目录 tech-events-assistant.local.json / .env.local 中配置了 Server 酱 SendKey，请运行：
node scripts/push-ai-daily-to-serverchan.mjs <生成的Markdown文件路径>

如果两者都配置，请两个都推送；如果都未配置，请只生成文件并说明未推送。
```

## 推荐自动化 prompt：大湾区活动

更省事的方式：运行 `npm run gba`，按默认 5 步引导走到 `创建 / 更新活动搜寻自动化`。工具会生成 `tech-events-assistant.automation.md` 并尽量复制到剪贴板。新建 Codex Automation 时建议保存为“活动搜寻”，时间设置为每天 07:00（Asia/Shanghai，早上 7 点）。下面的 prompt 仍保留给需要手动复制或二次修改的人。

```text
建议自动化时间：每天 07:00（Asia/Shanghai，早上 7 点）。

检索未来两周（从本周一 00:00 至下周日 23:59）大湾区值得 AI、互联网、开发者、科研人群关注的线下真实技术活动，生成 Markdown 活动清单文件。

目标不是只找高校讲座，而是尽量找满 10 个可公开核验、真实可去、技术主题明确的活动。

结果结构尽量按 4:3:3 倾向组织：
1. 4 个高校 / 研究院 / 学术机构的高含金量技术讲座、研讨会、Workshop。
2. 3 个社会类开发者社区活动，如 Meetup、Luma、开源社区、独立技术社区线下聚会。
3. 3 个产业 / 工程实践型但仍然纯技术导向的活动，如 AI 工程、Agent、前端、后端、云原生、数据库、机器人、具身智能等开发者活动。

如果某一类实在找不满，不要编造，也不要凑数；但要先优先补 Luma、Meetup、开源社区、技术社区官方活动页，不要默认只靠学校官网。

检索顺序建议固定为：
1. 先扫 Luma、Meetup、开源社区、技术社区活动页。
2. 再扫高校、研究院、学院官网讲座页。
3. 最后补官方技术社区或主办方官网活动页。

深圳可以同时收录高含金量和中含金量的真实技术社区活动；广州、珠海、香港、澳门仍以高含金量为主。

生成 Markdown 文件后，如果环境变量 FEISHU_WEBHOOK_URL 已配置，或当前目录 tech-events-assistant.local.json / .env.local 中配置了飞书 webhook，请运行：
node scripts/push-gba-events-to-feishu.mjs <生成的Markdown文件路径>

如果环境变量 SERVERCHAN_SENDKEY 已配置，或当前目录 tech-events-assistant.local.json / .env.local 中配置了 Server 酱 SendKey，请运行：
node scripts/push-gba-events-to-serverchan.mjs <生成的Markdown文件路径>

如果两者都配置，请两个都推送；如果都未配置，请只生成文件并说明未推送。
```

## 验证与排查

检查语法：

```bash
node --check scripts/push-ai-daily-to-feishu.mjs
node --check scripts/push-gba-events-to-feishu.mjs
node --check scripts/push-ai-daily-to-serverchan.mjs
node --check scripts/push-gba-events-to-serverchan.mjs
```

飞书连接测试（不发送）：

```bash
FEISHU_DRY_RUN=1 FEISHU_WEBHOOK_URL=<FEISHU_WEBHOOK_URL> node scripts/push-ai-daily-to-feishu.mjs ai-daily/YYYY-MM-DD-ai-daily.md
```

Server 酱连接测试（不发送）：

```bash
SERVERCHAN_DRY_RUN=1 SERVERCHAN_SENDKEY=<SERVERCHAN_SENDKEY> node scripts/push-ai-daily-to-serverchan.mjs ai-daily/YYYY-MM-DD-ai-daily.md
```

检查 `tech-events-assistant.local.json` 是否配置了密钥，但不打印真实值：

```bash
node -e "const fs=require('fs'); const cfg=JSON.parse(fs.readFileSync('tech-events-assistant.local.json','utf8')); console.log({hasFeishu:Boolean(cfg.push?.feishuWebhookUrl), hasServerChan:Boolean(cfg.push?.serverChanSendKey)});"
```

常见问题：

- `缺少 FEISHU_WEBHOOK_URL`：当前运行目录没有 `tech-events-assistant.local.json` / `.env.local`，或里面没有飞书配置。
- `缺少 SERVERCHAN_SENDKEY`：当前运行目录没有 `tech-events-assistant.local.json` / `.env.local`，或里面没有 Server 酱配置。
- worktree 读不到密钥：在自动化 prompt 中显式使用 `FEISHU_ENV_FILE=/absolute/path/to/.env.local` 或 `SERVERCHAN_ENV_FILE=/absolute/path/to/.env.local`。
- 飞书签名错误：检查机器人安全设置是否开启签名校验，并确认 `FEISHU_WEBHOOK_SECRET` 正确。
- Server 酱内容看起来比原文少：这是设计取舍。通知展示摘要，完整内容保留在原始 Markdown 文件。
