# Codex 飞书 / Server 酱自动化工具包

把 Codex 自动化生成的 Markdown 日报、周报、活动清单等内容，推送到飞书群或 Server 酱。飞书适合展示结构化卡片，Server 酱适合把手机提醒送到微信相关通知通道。

GitHub 仓库地址：<https://github.com/helloLeila/codex-feishu-automation-kit>

适合这些场景：

- AI 行业日报生成后自动推送。
- 大湾区技术活动清单生成后自动推送。
- 周报、监控结果、调研摘要等 Markdown 文件需要变成通知。
- 想把“配置 webhook / SendKey、测试连接、排查未推送”沉淀成可复用 Codex Skill。

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

默认会进入 4 步引导页。回车会执行当前步骤；执行完成后，该步骤会变绿，并自动把下一步未完成步骤设为当前步骤。全部完成后，回车会退出引导。输入 `b` 可以返回手动菜单，输入 `q` 或 `0` 可以退出引导。

```text
引导配置 · 下一步 1/4
1. 查看配置及安装说明  ▶ 当前
2. 配置推送地址偏好  · 待执行
3. 测试飞书/微信连接  · 待执行
4. codex剪切板一键导入任务  · 待执行
```

第 1 步会显示当前配置和安装说明，提示 `tech-events-assistant.config.json` 这个配置可以修改，并尝试用默认 VS Code 打开这个文件；打开成功会显示“已打开”。

第 4 步会生成 `tech-events-assistant.automation.md`，并尽量把完整 Prompt 复制到剪切板。工具会明确列出你要做的事情：打开 Codex 的「自动化（已安排）」、选择「通过聊天添加」、粘贴 Prompt、按 Enter 直接运行。如果剪切板不可用，直接打开生成的 Markdown 文件复制即可。

第 2 步会先问是否帮你打开取值页面。回车会同时打开飞书自定义机器人文档和 Server 酱登录页；Server 酱登录页链接也会复制到剪切板作为兜底。登录后查看 SendKey，拿到 webhook / SendKey 后回到终端粘贴即可。

第 3 步会直接发送一条测试消息到已配置通道，并显示服务端返回摘要，例如 `HTTP 200，code 0，msg ok`。如果还没配置 webhook / SendKey，它会提示先执行第 2 步。

保存配置时会显示步骤流：

```text
配置推送
│
├─ ✓ 读取现有配置
├─ ✓ 合并本次输入
├─ ✓ 写入用户级配置
└─ ✓ 准备推送脚本

完成    ████████████████████████████████████████████████████████ 100%
        ✓ tech-events-assistant.local.json 已保存
```

不需要安装 npm 依赖；脚本只使用 Node.js 内置模块。Node.js 版本需要 18 或更高。

如果想一次跑完本地检查：

```bash
bash scripts/setup.sh
```

这个脚本会：

1. 检查 Node.js 版本是否为 18 或更高。
2. 检查是否已有用户级私密配置，位置是 `~/.config/codex-feishu-automation-kit/tech-events-assistant.local.json`。
3. 运行 `npm run check` 做语法检查。
4. 运行 `npm test`。
5. 使用示例 Markdown 做推送格式检查，不会真实发送消息。

## 配置文件

这个工具包使用三个明显命名的配置文件：

- `tech-events-assistant.config.json`：普通配置，可以提交到 Git；主要放助手名称、时间窗口、输出偏好、默认推送开关等不含密钥的设置。
- `~/.config/codex-feishu-automation-kit/tech-events-assistant.local.json`：用户级私密配置；保存飞书 webhook、飞书签名密钥、Server 酱 SendKey。`npm run gba` 默认写这里，并设置文件权限为 `0600`。
- 工作区内的 `tech-events-assistant.local.json`：兼容旧工作流，也可覆盖用户级配置；已在 `.gitignore` 中，不要提交。
- `tech-events-assistant.config.example.json`：示例配置，用来给新用户复制参考，不放真实密钥。

推荐在 `npm run gba` 的菜单里选择 `配置推送地址偏好` 输入密钥。它会帮你打开飞书和 Server 酱取值页面；输入留空会保留原值，输入 `clear` 会清空该项；最后选择不保存就不会写入文件。

`.env.local` 仍然兼容旧工作流，但新用户优先使用用户级 `tech-events-assistant.local.json`。

## 去哪里拿密钥

飞书机器人：

1. 打开飞书开放平台文档：<https://open.feishu.cn/document/client-docs/bot-v3/add-custom-bot>
2. 在飞书群里进入“群设置”。
3. 找到“机器人”或“群机器人”，添加“自定义机器人”。
4. 复制生成的 webhook，填到菜单里的飞书 webhook URL。
5. 如果你在机器人安全设置里开启了“签名校验”，把签名密钥填到菜单里的飞书签名密钥。

飞书开放平台入口：<https://open.feishu.cn/>

Server 酱：

1. 打开 Server 酱登录页：<https://sct.ftqq.com/login>
2. 登录或按页面提示完成微信相关绑定。
3. 登录后查看并复制自己的 SendKey，填到菜单里的 Server 酱 SendKey。
4. 微信或公众号相关绑定按 Server 酱网页提示完成；本工具只需要保存 SendKey。

## 在自己的 Codex 工作区使用

如果你的活动文件已经在另一个 Codex 工作区生成，推荐先把本工具包作为全局命令安装或链接：

```bash
npm install -g .
# 或开发时使用：
npm link
```

安装后，任意工作区都可以运行 `codex-feishu-push-gba-events <Markdown文件>`。密钥会从用户级配置读取；同一台电脑、同一个 macOS 用户只需要配置一次。切换 Codex 登录账号后不需要重填密钥，但需要在新账号里重新导入已安排自动化任务。

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

推送到已配置的飞书和 / 或 Server 酱：

```bash
codex-feishu-push-gba-events examples/gba-events-example.md
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
生成 Markdown 文件后，请运行：
codex-feishu-push-gba-events <生成的Markdown文件路径>
这个命令会自动读取环境变量、显式 env 文件、当前工作区配置、用户级配置和 Codex Home 兜底配置；如果飞书和 Server 酱都配置了会两个都推送，如果都未配置会正常跳过并说明未配置推送渠道。
```

读取优先级从高到低是：进程环境变量、`FEISHU_ENV_FILE` / `SERVERCHAN_ENV_FILE`、当前工作区 `.env.local` 和 `tech-events-assistant.local.json`、用户级配置、`$CODEX_HOME/codex-feishu-automation-kit/tech-events-assistant.local.json`。

## 测试连接

`npm run gba` 的第 3 步会直接发送一条测试消息来验证 webhook / SendKey，并显示 `HTTP/code/msg` 摘要。命令里的 `DRY_RUN=1` 是脚本参数名，含义是“不发送，只检查推送格式”，主要用于脚本调试和发布前检查，不会作为正常引导步骤展示。

```bash
FEISHU_DRY_RUN=1 FEISHU_WEBHOOK_URL=<FEISHU_WEBHOOK_URL> node skills/feishu-automation-reporter/scripts/push-ai-daily-to-feishu.mjs examples/ai-daily-example.md
codex-feishu-push-gba-events --dry-run examples/gba-events-example.md
SERVERCHAN_DRY_RUN=1 SERVERCHAN_SENDKEY=<SERVERCHAN_SENDKEY> node skills/feishu-automation-reporter/scripts/push-ai-daily-to-serverchan.mjs examples/ai-daily-example.md
```

## 使用 Skill

`skills/feishu-automation-reporter` 是一个 Codex Skill。把它复制到你的 Codex skills 目录，或通过你的 Codex 环境从该仓库安装。

适合在这些任务中触发：

- 给 Markdown 生成类自动化增加飞书或 Server 酱推送。
- 配置用户级 `tech-events-assistant.local.json`、`.env.local`、飞书 webhook 和 Server 酱 SendKey。
- 生成或改造飞书 interactive card 脚本。
- 生成或改造 Server 酱通知脚本。
- 排查为什么自动化没有推送。
- 测试飞书或 Server 酱连接是否可用。

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

`缺少 FEISHU_WEBHOOK_URL`：没有配置飞书 webhook。检查用户级配置、当前工作区 `tech-events-assistant.local.json` / `.env.local`，或用 `FEISHU_ENV_FILE=/absolute/path/to/.env.local` 指定。

`缺少 SERVERCHAN_SENDKEY`：没有配置 Server 酱 SendKey。检查用户级配置、当前工作区 `tech-events-assistant.local.json` / `.env.local`，或用 `SERVERCHAN_ENV_FILE=/absolute/path/to/.env.local` 指定。

飞书推送失败且提示签名错误：机器人开启了签名校验，但没有配置 `FEISHU_WEBHOOK_SECRET`，或密钥填错。

Server 酱消息不完整：Server 酱适合提醒和摘要，不适合完整替代 Obsidian 原文。建议在 Markdown 中保留来源路径或链接，通知里展示摘要和原始文件路径。

## 安全提醒

- 不要提交 `.env.local`。
- 不要提交 `tech-events-assistant.local.json`。
- 不要把用户级配置文件复制进仓库。
- 不要把真实 webhook、SendKey 或签名密钥写进 README、示例、issue、截图或 prompt。
- 如果密钥泄露，立即在对应平台重置。
- 开源前运行 `docs/release-checklist.md` 里的扫描命令。

## Open WeChat Editor：微信公众号 Markdown 编辑器

启动本地编辑器：

```bash
npm install
npm start
```

浏览器打开 `http://127.0.0.1:3210/`，进入“设置”填写公众号 AppID 和 AppSecret。AppSecret 只提交给本机 Node 服务，不会写入浏览器 `localStorage`；保存后点击“测试连接”。如果返回 `40164`，把运行编辑器的服务端出口公网 IP 加入公众号后台的接口 IP 白名单。

凭证也可以通过环境变量提供：

```bash
WECHAT_APP_ID=wx_your_app_id \
WECHAT_APP_SECRET=your_app_secret \
npm start
```

设置页还可以保存默认作者、封面永久 MediaID、评论开关和自动同步防抖时间。第一次必须手动点击“创建微信草稿”；微信返回 `media_id` 后，编辑阶段停止输入约 15 秒会调用官方更新草稿接口更新同一个草稿。点击“进入审核”后自动同步会暂停，避免覆盖你在微信后台的手工修改。

正文图片可以直接使用 Typora + PicGo 上传到 OSS 的 HTTPS 地址。同步草稿时，本地服务会把 JPG/PNG 图片上传到微信“上传图文消息内图片”接口，并在提交给草稿接口的 HTML 中替换为微信图片地址；同一图片在后续更新中会复用缓存，不会重复上传。已经是 `mmbiz.qpic.cn` 的微信图片会直接保留。图片地址必须是公网 HTTPS，不能使用 `file://`、`/assets/...` 或未公开的本地路径。

当前实现的凭证与同步设计见 [`docs/superpowers/specs/2026-08-20-wechat-sync-config-design.md`](docs/superpowers/specs/2026-08-20-wechat-sync-config-design.md)。真实微信请求只由本地服务端发起；没有 AppID / AppSecret 时，编辑器仍可作为纯本地 Markdown 预览器使用。

### 两种发布模式

编辑器故意把“复制发布”和“微信草稿同步”分开：

- 访客模式：不登录即可写 Markdown、看右侧 375px 预览、选择主题，并点击“复制公众号格式”。剪贴板会同时写入 `text/html` 和纯文本，粘贴到微信公众号后台后保留当前预览的内联样式；这个流程不调用服务器文章或微信 API。
- 登录模式：输入部署者设置的编辑器账号后，才开放服务器文章、主题、设置和“创建/更新微信草稿”。微信 API 请求只从 Node 服务发起，AppSecret 保存在服务器 `.env.local` 或 `/data/config/credentials.json`，不会进入 GitHub、浏览器 localStorage 或登录 Cookie。

在公网临时部署时，复制模式仍可直接使用；草稿模式需要登录。设置页的 AppSecret 输入只适合 `localhost` 或 HTTPS。公网 HTTP 请求提交 AppSecret 会被服务端拒绝（`INSECURE_CREDENTIAL_TRANSPORT`）。客户端把密钥“加密后再通过 HTTP 发送”不能解决这个问题，因为攻击者可以篡改 HTTP 页面里的 JavaScript、截获登录会话或替换加密逻辑；正式部署应使用域名 + HTTPS，临时方案则把密钥写入 ECS 上权限为 `0600` 的 `.env.local`。

开启公网登录保护：

```bash
EDITOR_AUTH_ENABLED=true
EDITOR_AUTH_USER=editor
EDITOR_AUTH_PASSWORD='<至少 16 位的长密码>'
EDITOR_SESSION_SECRET='<随机长字符串>'
```

未配置 `EDITOR_AUTH_USER` / `EDITOR_AUTH_PASSWORD` 时，默认保持本机免登录行为，方便本地开发。

### 用 Docker Compose 启动

如果不想在本机安装 Node.js，可以使用仓库自带的容器配置。首次启动：

```bash
cp .env.example .env.local
# 编辑 .env.local。公网部署时还要设置 EDITOR_AUTH_ENABLED、EDITOR_AUTH_USER、
# EDITOR_AUTH_PASSWORD、EDITOR_SESSION_SECRET；AppSecret 优先写在这个文件里。
docker compose --env-file .env.local up --build
```

#### 中国区镜像源

Dockerfile 的 Node 基础镜像通过 `NODE_BASE_IMAGE` 配置，应用代码、端口和数据目录不会因为换镜像源而改变。Docker Hub 访问慢时，在服务器的 `.env.local` 中改这一行即可：

```dotenv
NODE_BASE_IMAGE=docker.m.daocloud.io/library/node:20-bookworm-slim
```

然后重新构建：

```bash
docker compose --env-file .env.local build --pull
docker compose --env-file .env.local up -d
```

如果服务器使用 Podman，把命令中的 `docker compose` 换成 `podman-compose`：

```bash
podman-compose --env-file .env.local build --pull
podman-compose --env-file .env.local up -d
```

也可以填写你自己的阿里云 ACR、网易云或其他可访问仓库中的完整镜像地址，例如 `registry.cn-beijing.aliyuncs.com/<命名空间>/node:20-bookworm-slim`。镜像地址必须实际提供 `node:20-bookworm-slim` 对应的 Linux/amd64（或服务器架构）manifest；不要只填镜像站域名。部分旧的公共镜像地址会下线或限流，遇到 `manifest unknown`、`unauthorized` 或超时，只需换成另一个可访问地址，不需要修改项目代码。

镜像源只影响“构建时从哪里拉 Node 基础镜像”，不会把 AppSecret、文章数据或主题写进镜像。真实凭证继续放在未跟踪的 `.env.local` 和 `./data` 中。

浏览器打开 `http://127.0.0.1:3210/`。Compose 会把宿主机的 `./data` 挂载到容器 `/data`，并通过 `OPEN_WECHAT_EDITOR_CONFIG_DIR=/data/config` 指定持久化配置目录；其中 `/data/config` 保存设置、凭证、文章和自定义主题。删除容器不会删除这些文件。停止服务：

```bash
docker compose down
```

`PORT` 只改变宿主机端口映射（例如 `PORT=8080` 会使用 `http://127.0.0.1:8080/`），容器内仍监听 `3210`。`WECHAT_API_BASE_URL`、`WECHAT_DEFAULT_AUTHOR` 和 `WECHAT_AUTO_SYNC` 可在 `.env.local` 中预设；也可以进入编辑器“设置”修改并保存。

Docker 容器通过 `HOST=0.0.0.0` 接收端口转发，本机直接运行时默认仍绑定 `127.0.0.1`。AppSecret 只由服务端读取，不会写入浏览器 `localStorage`，也不会被复制进镜像；`.env.local`、`data/` 已被忽略，禁止提交到 Git。首次调用微信接口前，必须把运行容器所在服务器的出口公网 IP 加入微信公众号后台的接口 IP 白名单。

启用登录后，访问根页面仍然开放给访客复制；只有 `/api/articles`、`/api/config`、`/api/themes` 和 `/api/wechat/*` 等云端 API 需要会话 Cookie。登录失败会进入短暂冷却，服务端不会区分“用户不存在”和“密码错误”。

### 数据备份与恢复

停止编辑器后，备份 `data/` 目录即可迁移本机文章和主题：

```bash
docker compose down
tar -czf wechat-editor-data-$(date +%Y%m%d).tar.gz data
```

恢复时先停止服务，再把备份解压回仓库根目录的 `data/`，然后重新执行 `docker compose --env-file .env.local up -d`。不要把 `data/config/credentials.json` 发给他人；其中包含 AppSecret。
