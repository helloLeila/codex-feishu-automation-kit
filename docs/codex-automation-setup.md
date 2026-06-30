# Codex 自动化接入说明

这篇文档说明工具包的通用接入模式。

## 数据流

```text
Codex 自动化
  -> 生成 Markdown 文件
  -> 运行推送脚本
  -> 脚本读取 FEISHU_WEBHOOK_URL 或 SERVERCHAN_SENDKEY
  -> 脚本生成飞书 interactive card 或 Server 酱 desp 文本
  -> 推送到飞书群或微信相关通知通道
```

## 密钥读取顺序

脚本按顺序读取：

1. 进程环境变量：
   - `FEISHU_WEBHOOK_URL`
   - `FEISHU_WEBHOOK_SECRET`
   - `SERVERCHAN_SENDKEY`
2. `FEISHU_ENV_FILE` 或 `SERVERCHAN_ENV_FILE` 指向的 env 文件。
3. 当前运行目录下的 `.env.local`。

这样可以避免硬编码本地路径，也能兼容本地目录、git worktree 和 CI。

## 为什么飞书和 Server 酱使用不同格式

飞书自定义机器人的普通 `post` 消息在不同客户端里对 Markdown 的渲染并不稳定，因此飞书侧使用 interactive card。

Server 酱的核心接口是 `title + desp`，适合把 Markdown 摘要作为微信相关通知通道的内容。它更适合“提醒我去看”，而不是完整呈现所有细节。

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

## 推荐自动化 prompt 片段

```text
生成 Markdown 文件后，如果环境变量 FEISHU_WEBHOOK_URL 已配置，或当前目录 .env.local 中配置了 FEISHU_WEBHOOK_URL，请运行：
node <feishu-script-path> <生成的Markdown文件路径>
如果环境变量 SERVERCHAN_SENDKEY 已配置，或当前目录 .env.local 中配置了 SERVERCHAN_SENDKEY，请运行：
node <serverchan-script-path> <生成的Markdown文件路径>
如果都未配置，请只生成文件并说明未推送。
```

## 验证与排查

检查语法：

```bash
node --check skills/feishu-automation-reporter/scripts/push-ai-daily-to-feishu.mjs
node --check skills/feishu-automation-reporter/scripts/push-gba-events-to-feishu.mjs
node --check skills/feishu-automation-reporter/scripts/push-ai-daily-to-serverchan.mjs
node --check skills/feishu-automation-reporter/scripts/push-gba-events-to-serverchan.mjs
```

飞书 dry-run：

```bash
FEISHU_DRY_RUN=1 node skills/feishu-automation-reporter/scripts/push-ai-daily-to-feishu.mjs examples/ai-daily-example.md
```

Server 酱 dry-run：

```bash
SERVERCHAN_DRY_RUN=1 SERVERCHAN_SENDKEY=<SERVERCHAN_TEST_SENDKEY> node skills/feishu-automation-reporter/scripts/push-ai-daily-to-serverchan.mjs examples/ai-daily-example.md
```

检查 `.env.local` 是否配置了密钥，但不打印真实值：

```bash
node -e "const fs=require('fs'); const text=fs.readFileSync('.env.local','utf8'); console.log({hasFeishu:/^FEISHU_WEBHOOK_URL=.+/m.test(text), hasServerChan:/^SERVERCHAN_SENDKEY=.+/m.test(text)});"
```
