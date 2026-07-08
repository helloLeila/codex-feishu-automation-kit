# 飞书 / Server 酱推送配置操作手册

这份手册回答两个问题：

1. 飞书卡片和 Server 酱推送是不是已经在仓库里配置好了。
2. 新用户怎么从 0 配置、测试、导入 Codex 自动化并看到推送效果。

## 先看结论

仓库里已经有“推送能力”和“消息模板”，但没有提交真实密钥。

- 公开配置在 `tech-events-assistant.config.json`。它只放助手名称、时间窗口、输出偏好、是否启用飞书和 Server 酱等普通配置。
- 本机私密配置在 `tech-events-assistant.local.json`。它保存飞书 webhook、飞书签名密钥、Server 酱 SendKey，已经写进 `.gitignore`，不要提交。
- 旧工作流也支持 `.env.local`。它同样已经写进 `.gitignore`，不要提交。
- 飞书卡片模板在 `skills/feishu-automation-reporter/scripts/push-gba-events-to-feishu.mjs`。
- Server 酱消息模板在 `skills/feishu-automation-reporter/scripts/push-gba-events-to-serverchan.mjs`。
- Server 酱实际发送请求在 `skills/feishu-automation-reporter/scripts/lib/serverchan.mjs`。

当前仓库默认的 `tech-events-assistant.config.json` 里有：

```json
{
  "push": {
    "feishu": true,
    "serverChan": true
  }
}
```

这表示默认启用两个推送通道，但不代表真实 webhook / SendKey 已经配置。真实密钥需要用户自己填到本机私密配置里。

## 配置文件分别负责什么

`tech-events-assistant.config.json`

- 可以提交到 Git。
- 不放密钥。
- 控制助手名称、自动化名称和时间、检索区域、城市、领域、来源、输出语言、卡片内容取舍、推送通道开关。

`tech-events-assistant.config.example.json`

- 是给新用户复制的模板。
- 如果当前目录已经有 `tech-events-assistant.config.json`，只改 example 不会影响当前运行结果。
- `npm run gba` 只有在缺少 `tech-events-assistant.config.json` 时，才会从 example 复制一份正式配置。

`tech-events-assistant.local.json`

- 由 `npm run gba` 的配置步骤生成或更新。
- 不提交到 Git。
- 保存真实推送密钥。
- 推荐新用户使用这个文件。

示例结构：

```json
{
  "push": {
    "feishuWebhookUrl": "<FEISHU_WEBHOOK_URL>",
    "feishuWebhookSecret": "<FEISHU_WEBHOOK_SECRET，可选>",
    "serverChanSendKey": "<SERVERCHAN_SENDKEY>"
  }
}
```

`.env.local`

- 兼容旧用户。
- 不提交到 Git。
- 可以写成：

```bash
FEISHU_WEBHOOK_URL="<FEISHU_WEBHOOK_URL>"
FEISHU_WEBHOOK_SECRET="<FEISHU_WEBHOOK_SECRET，可选>"
SERVERCHAN_SENDKEY="<SERVERCHAN_SENDKEY>"
```

脚本读取时会先合并本地文件，再让进程环境变量覆盖本地值。合并顺序是 `.env.local`、`tech-events-assistant.local.json`、`FEISHU_ENV_FILE` / `SERVERCHAN_ENV_FILE` 指定的额外 env 文件；后读取的同名值覆盖先读取的值。最后，命令行进程里的 `FEISHU_WEBHOOK_URL`、`FEISHU_WEBHOOK_SECRET`、`SERVERCHAN_SENDKEY` 优先级最高。

## 地点和领域在哪里改

活动自动化的地点、城市、领域和来源都在 `tech-events-assistant.config.json` 的 `eventSearch` 里。

例如从大湾区改成上海 / 杭州，可以改成：

```json
{
  "automation": {
    "name": "华东技术活动晨报",
    "frequency": "每天",
    "time": "08:30"
  },
  "eventSearch": {
    "regionName": "长三角",
    "targetAudience": "AI 工程师、数据库开发者",
    "windowDays": 21,
    "expectedEventCount": 6,
    "travelOrigin": "人民广场",
    "cities": {
      "上海": "高含金量和中含金量均可收录",
      "杭州": "只收录高含金量"
    },
    "topicPriority": [
      "AI Agent 工程化",
      "数据库内核",
      "云原生与开发者工具"
    ],
    "topicDeprioritize": [
      "泛商业沙龙",
      "招商路演"
    ],
    "sources": [
      "上海开发者社区",
      "杭州技术社区",
      "高校计算机学院",
      "Luma",
      "Meetup"
    ]
  }
}
```

改完配置后，需要重新执行第 4 步 `导入自动化`，让 `tech-events-assistant.automation.md` 和剪贴板里的 Prompt 重新生成。新 Prompt 会带上新的区域、城市、领域、来源、出发点和自动化时间。

## 飞书卡片已经配置了什么

活动清单推送到飞书时，脚本会生成飞书 interactive card。

对应文件：

```text
skills/feishu-automation-reporter/scripts/push-gba-events-to-feishu.mjs
```

里面已经配置了：

- 消息类型：`interactive`
- 卡片宽屏：`wide_screen_mode: true`
- 卡片头部：`<eventSearch.regionName>活动｜<Markdown 标题>`
- 卡片颜色：`template: "green"`
- 卡片内容：
  - 检索概览
  - 快速卡片
  - 候补链接
  - 备注
  - 完整 Markdown 文件路径

用户一般不需要改这个文件。只要活动 Markdown 按 Prompt 里的结构生成，脚本会自动截取并整理成飞书卡片。

## Server 酱已经配置了什么

活动清单推送到 Server 酱时，脚本会把 Markdown 整理成 `title + desp`。

对应文件：

```text
skills/feishu-automation-reporter/scripts/push-gba-events-to-serverchan.mjs
skills/feishu-automation-reporter/scripts/lib/serverchan.mjs
```

里面已经配置了：

- 标题：`Codex｜<eventSearch.regionName>活动`
- 正文：
  - 检索概览
  - 快速卡片
  - 候补链接
  - 备注
  - 完整 Markdown 文件路径
- 请求地址：由 `SERVERCHAN_SENDKEY` 拼出 Server 酱发送接口。

Server 酱更适合做手机提醒，所以内容会比飞书卡片更像摘要。完整内容仍然保存在生成的 Markdown 文件里。

## 第一次配置推送

在仓库根目录运行：

```bash
npm run gba
```

进入引导后，执行第 1 步：

```text
> [Enter] 执行  1 配置推送和偏好
```

按提示填写：

1. 飞书 webhook URL：从飞书群的自定义机器人里复制。
2. 飞书签名密钥：可选。只有机器人开启签名校验时才填。
3. Server 酱 SendKey：从 Server 酱登录页复制。

输入规则：

- 直接回车：保留旧值。
- 输入 `clear`：清空当前值。
- 最后选择保存：写入 `tech-events-assistant.local.json`。
- 最后选择不保存：原配置保持不变。

配置完成后，可以查看本机是否已经有密钥，但不要打印真实值：

```bash
node -e "const fs=require('fs'); const p='tech-events-assistant.local.json'; const cfg=fs.existsSync(p)?JSON.parse(fs.readFileSync(p,'utf8')):{}; console.log({hasFeishu:Boolean(cfg.push?.feishuWebhookUrl), hasServerChan:Boolean(cfg.push?.serverChanSendKey)});"
```

## 测试真实连接

继续在 `npm run gba` 引导里执行第 2 步：

```text
> [Enter] 执行  2 测试真实连接
```

成功时会看到类似：

```text
飞书连接成功，测试消息已送达飞书群（HTTP 200，code 0，返回成功）
Server 酱连接成功，测试消息已送达微信（HTTP 200，code 0，返回成功）
完成  ██████████████████████ 100%
```

如果某个通道没配置，它会提示缺少哪个密钥。先回到第 1 步补齐，再重新测试。

## 查看当前配置状态

执行第 3 步：

```text
> [Enter] 执行  3 查看配置状态
```

这一页只面向用户展示“现在能不能推送”：

- 飞书：是否能发到飞书群。
- Server 酱：是否能发到微信相关通知通道。
- Codex 自动化：Prompt 是否准备好。

这里不会展示真实 webhook 或 SendKey。

## 导入 Codex 自动化

执行第 4 步：

```text
> [Enter] 执行  4 导入 Codex 自动化配置
```

这一步会生成：

```text
tech-events-assistant.automation.md
```

如果系统剪贴板可用，完整 Prompt 会自动复制；如果不可用，就打开这个文件手动复制。

在 Codex 中添加自动化：

1. 打开左侧「自动化（已安排）」。
2. 点击「通过聊天添加」。
3. 粘贴刚才复制的 Prompt。
4. 按 Enter 直接运行。
5. 在自动化会看到新增一个自动化推送任务，点击运行查看效果。

Prompt 里已经写好名称、频率、运行时间和时区，所以不需要用户再手动填名称或运行时间。

## 自动化实际做什么

自动化创建后，每天会按 Prompt 执行：

1. 从运行当天 00:00 开始，按 `eventSearch.windowDays` 检索配置区域内的线下技术活动。
2. 生成 Markdown 活动清单。
3. 如果检测到飞书配置，运行飞书推送脚本。
4. 如果检测到 Server 酱配置，运行 Server 酱推送脚本。
5. 如果两个都配置，就两个都推送。
6. 如果都没配置，只生成 Markdown，并说明未推送。

推送命令已经写在生成的 Prompt 里：

```bash
node skills/feishu-automation-reporter/scripts/push-gba-events-to-feishu.mjs <生成的Markdown文件路径>
node skills/feishu-automation-reporter/scripts/push-gba-events-to-serverchan.mjs <生成的Markdown文件路径>
```

## 常见问题

`tech-events-assistant.config.json` 里已经有 `feishu: true`，为什么还不能发？

它只是启用通道，不包含真实 webhook。必须在 `tech-events-assistant.local.json` 或 `.env.local` 里配置密钥。

为什么不把 webhook 和 SendKey 直接放仓库里？

这些都是私密密钥。放进 GitHub 后，别人可以直接向你的飞书群或微信通知通道发消息。

飞书签名密钥一定要填吗？

不一定。只有飞书自定义机器人开启“签名校验”时才需要填 `feishuWebhookSecret`。

Server 酱消息为什么比飞书少？

Server 酱用于提醒，正文会做摘要。完整活动清单保存在自动化生成的 Markdown 文件里。

自动化运行后没推送怎么办？

先在本地运行 `npm run gba`，执行第 2 步测试真实连接；如果本地连接成功，再看自动化运行日志里有没有执行推送脚本，以及自动化运行目录是否能读到 `tech-events-assistant.local.json`。
