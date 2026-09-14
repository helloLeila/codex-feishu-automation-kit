# Open WeChat Editor：实现状态、产品设计与后续开发手册

> 文档状态：当前实现基线
>
> 更新时间：2026-09-05
>
> 适用仓库：`codex-feishu-automation-kit`

本文是微信公众号 Markdown 编辑器的单一事实源。已有专题设计稿仍然保留，专题稿用于解释决策背景；本文用于回答“现在有什么、哪些还没有、后续应该怎么继续开发”。

## 一. 项目定位

### 1.1 产品目标

Open WeChat Editor 是一个本地优先、可自托管的微信公众号文章排版工具：

1. 用户在左侧编写或粘贴 Markdown。
2. 中间区域显示接近微信公众号正文宽度的 375px 只读预览。
3. 同一份渲染结果用于预览、富文本复制、HTML 导出和微信草稿正文，避免四套样式漂移。
4. 用户可以选择内置主题，或导入受控 JSON 主题。
5. 不登录时走“复制公众号格式”流程，手动粘贴到微信公众号后台。
6. 登录后可保存文章、主题和配置，并通过服务端调用微信官方 API 创建或更新草稿。
7. 进入审核后暂停自动同步，给用户在微信后台人工调整和发布的空间。

### 1.2 产品边界

当前项目不是秀米或 135 的网页自动化克隆，也不使用微信公众号后台 Cookie 或模拟点击。微信相关能力只通过服务端调用官方接口；最终发布默认由用户在微信公众平台确认。

## 二. 当前实现状态总表

状态定义：

- **已完成**：代码、接口和 UI 已存在，并有测试或运行验证。
- **部分完成**：主链路可用，但仍有明确限制或缺少完整闭环。
- **未完成**：只有设计、占位或尚未实现。
- **不承诺**：当前产品边界明确排除，不应被后续模型误认为缺陷。

| 能力 | 状态 | 当前行为 | 主要位置 |
| --- | --- | --- | --- |
| Markdown 左侧编辑 | 已完成 | 支持粘贴、编辑、快捷格式操作 | `apps/wechat-editor/src/app.mjs` |
| 375px 文章预览 | 已完成 | 只读公众号风格画布 | `apps/wechat-editor/src/app.mjs`、静态资源 |
| 左右联动滚动 | 已完成 | 编辑区与预览区按比例同步 | `apps/wechat-editor/src/app.mjs` |
| 左右宽度拖拽 | 已完成 | 可调整编辑区/预览区占比 | `apps/wechat-editor/src/app.mjs` |
| 本机实时保存 | 已完成 | 浏览器 localStorage 自动恢复编辑内容 | `apps/wechat-editor/src/app.mjs` |
| 服务端文章保存 | 已完成 | 登录后保存到配置目录下的 JSON 文件 | `article-store.mjs` |
| Markdown 导入/导出 | 已完成 | 下载原始 Markdown，导入文件或文本 | `app.mjs` |
| 微信兼容 HTML 导出 | 已完成 | 样式内联，适合留档和手动导入 | `wechat-html.mjs` |
| 富文本复制 | 已完成 | 剪贴板同时写入 `text/html` 与纯文本 | `app.mjs` |
| 内置主题 | 已完成 | 清晰阅读、编辑绿、科技蓝三套主题 | `theme-schema.mjs`、主题目录 |
| 自定义主题 JSON | 已完成 | 校验、保存、导入、导出，内置主题只读 | `theme-schema.mjs` |
| 主题影响导出 | 已完成 | 预览、复制、HTML、草稿使用同一主题快照 | `markdown-renderer.mjs`、`wechat-html.mjs` |
| 编辑器登录 | 已完成 | Cookie 会话保护云端 API | `server/auth.mjs` |
| 配置中心 | 已完成 | 保存作者、封面、评论、同步和微信配置 | `server/config-store.mjs` |
| 微信连接诊断 | 已完成 | 服务端获取 token，提示白名单和凭证错误 | `wechat-client.mjs` |
| 图片预检查 | 已完成 | 检查 HTTPS、可访问性、JPG/PNG、大小 | `wechat-client.mjs` |
| OSS 图片上传到微信 | 已完成 | 同步前把公网 HTTPS 图片上传到微信正文图片接口 | `wechat-client.mjs` |
| 创建微信草稿 | 已完成 | 用户明确确认后调用 `draft/add` | `app.mjs`、服务端路由 |
| 更新同一个草稿 | 已完成 | 保存 `media_id`，后续调用 `draft/update` | `app.mjs`、服务端路由 |
| 自动同步防抖 | 已完成 | 编辑停止约 15 秒后更新绑定草稿 | `app.mjs` |
| 审核状态暂停同步 | 已完成 | 进入审核后不覆盖微信后台手工修改 | `app.mjs` |
| 默认手动发布 | 已完成 | 打开微信后台，用户人工审核并发布 | 产品流程 |
| 微信后台反向同步 Markdown | 未完成 | 微信后台修改不能自动还原为 Markdown | 产品边界 |
| 本地图片直接上传 | 部分完成 | 支持已有公网图片 URL；没有完整的编辑器内置图床上传 | 后续 P1 |
| 135/秀米 API | 不承诺 | 不依赖私有平台 API | 产品边界 |
| 多人协作与多设备同步 | 未完成 | 当前没有用户、团队和冲突合并模型 | 后续 P2 |
| 数据库 | 不承诺（当前阶段） | 使用 `/data` 下 JSON 文件，适合单用户自托管 | 架构决策 |
| HTTPS 域名部署 | 未完成 | 当前公网验证为 HTTP IP 入口 | 部署限制 |
| GitHub Actions 自动部署 | 未完成 | 当前需要服务器手动拉取和 Compose 重建 | 后续 P1 |
| 官方 API 自动发布 | 部分完成/默认关闭 | 发布权限、接口和账号能力需单独验证 | 后续 P1 |

## 三. 已完成能力的详细说明

### 3.1 编辑与预览

编辑器保留 Markdown 作为源数据。右侧预览是渲染结果，不直接作为第二份可编辑富文本数据。这样可以保证 Markdown 可导出、主题切换不破坏正文结构、同一文章可重新渲染为不同主题，微信导出不依赖浏览器当前 DOM 的偶然状态。

预览画布固定为 375px 文章宽度，模拟手机阅读区域。编辑器与预览支持联动滚动；布局分隔条可以拖拽调整左右比例。预览本身是只读的，内容修改入口统一在 Markdown 区。

### 3.2 本机保存与服务端保存

当前存在两层保存：

1. **本机草稿恢复**：浏览器使用固定 storage key 保存编辑中的 Markdown、当前主题和界面状态。刷新或服务重启后可以恢复最近内容。
2. **服务端文章保存**：登录后通过 `/api/articles` 保存文章、元数据、主题快照和微信绑定信息，文件位于配置目录或 Docker 挂载的 `/data` 中。

本机 localStorage 不是云端备份，也不会在设备之间同步。需要迁移时应备份 Docker 宿主机的 `data/` 目录。

### 3.3 主题系统

主题采用受控 JSON token，而不是任意 CSS 或 JavaScript。典型字段包括颜色、字号、行高、段落间距、引用、代码块、表格和图片圆角。

主题规则：内置主题只读；用户可以复制内置主题为自己的主题，再编辑和导出 JSON；JSON 导入必须经过 Schema 校验；禁止在主题包中执行 JavaScript、注入任意 HTML 或加载不受控脚本；新文章使用全局默认主题；已有文章保存主题 ID、版本和快照，修改默认主题不会悄悄改变旧文章。

### 3.4 微信草稿同步

同步链路如下：

```text
Markdown -> Markdown AST/HTML -> 主题 token 渲染 -> 微信兼容内联 HTML
         -> 图片预检查 -> 未缓存图片上传到微信 -> 创建或更新同一个 media_id
```

第一次创建草稿必须由用户点击并确认标题、摘要、作者、封面、评论设置和主题。成功后保存微信返回的 `media_id`。后续编辑只更新该草稿，禁止同步失败时静默创建新草稿。

点击“进入审核”时，系统先保存本地内容，执行最后一次同步，然后把文章切换到审核状态并暂停自动同步。用户在微信后台完成微调后，点击“手动发布”。当前不会把微信后台的修改自动写回 Markdown。

## 四. 当前未完成与待办清单

### 4.1 P0：发布链路必须稳定

1. **发布状态闭环**：区分“本机已保存、草稿同步中、草稿已同步、审核中、已发布、失败”，所有按钮提供进行中、成功、失败和重试状态。
2. **草稿冲突检测**：恢复编辑前通过 `draft/get` 对比远端规范化哈希，发现微信后台已修改时要求用户选择覆盖或另存为本地文章。
3. **图片失败可恢复**：逐张展示失败原因；图片上传失败时不更新草稿，并允许只重试图片准备阶段。
4. **发布前最终确认**：展示标题、摘要、封面、主题、正文预览和目标公众号，确认后才执行发布动作。
5. **接口契约测试**：补齐创建、更新、删除草稿和图片上传的模拟微信响应测试，覆盖 `40001`、`40125`、`40164`、`45166` 等错误。

### 4.2 P1：减少用户操作

1. 编辑器内置“选择图片”并上传到可配置 OSS/S3 兼容图床，自动插入 Markdown 图片地址。
2. 增加文章元数据面板：标题、摘要、作者、封面、原文链接、评论设置。
3. 增加“复制公众号格式”兼容性检测，明确提示浏览器剪贴板权限和微信后台粘贴结果。
4. 增加 GitHub Actions 或服务器 webhook 自动部署：构建镜像、健康检查、滚动替换容器、失败回滚。
5. 增加版本号、构建提交号和数据目录状态展示。
6. 加入文章历史版本、发布快照和一键恢复。
7. 预览区增加浏览器设备框架可选项，但正文宽度仍以 375px 为默认基准。

### 4.3 P2：扩展能力

1. 多账号或多公众号配置隔离。
2. 多用户登录、角色权限和团队文章库。
3. SQLite/PostgreSQL 存储与迁移工具。
4. 从微信复制 HTML 后“另存为新文章”的半自动解析器；该功能必须允许人工校正，不能承诺无损还原 Markdown。
5. 主题市场或主题包版本管理。
6. 统计文章同步历史和失败原因，但不引入无关的 SaaS 数据看板。

## 五. 产品交互设计

### 5.1 编辑器工作台

```text
┌──────────────────────────────────────────────────────────────────────┐
│ 文件/文章名   保存状态   撤销 重做   预览   复制公众号格式   导出   设置 │
├───────────────┬───────────────────────────────┬──────────────────────┤
│ Markdown      │ 文章预览（375px，可滚动）      │ 当前文章/同步信息      │
│ 编辑区        │                               │ 标题、摘要、主题、草稿  │
│               │                               │ 状态、发布操作          │
└───────────────┴───────────────────────────────┴──────────────────────┘
```

设计约束：顶部只放高频动作；Markdown 是唯一正文编辑入口；右侧预览用于确认最终视觉效果；“复制”和“同步草稿”是两个清晰的发布通道；审核期间自动同步按钮显示暂停原因。

### 5.2 两种发布模式

#### 1. 访客复制模式

无需登录、无需 AppID/AppSecret：粘贴 Markdown、选择主题、查看 375px 预览、点击“复制公众号格式”、在微信公众号后台粘贴、人工调整并发布。

剪贴板同时提供 `text/html` 和纯文本。微信能够读取 HTML 时保留内联样式；若浏览器或目标编辑器只接受纯文本，用户会看到无样式文本，这是目标编辑器能力差异。

#### 2. 登录同步模式

登录编辑器账号，设置 AppID、AppSecret、默认作者和封面 MediaID，测试连接并确认服务器出口 IP 已加入微信白名单，点击“创建微信草稿”，后续编辑停止约 15 秒后自动更新同一个草稿，点击“进入审核”暂停同步，在微信公众平台人工检查、调整并发布。

## 六. 系统架构与数据流

### 6.1 运行时架构

```text
浏览器 -> 静态编辑器 UI / localStorage / fetch /api/*
                 |
                 v
Node.js 单体服务 -> 静态文件、渲染、JSON 存储、认证、微信 API 客户端
                 |
                 +-> /data/config/settings.json
                 +-> /data/config/credentials.json
                 +-> /data/articles/*.json
                 +-> 微信 API、OSS 图片源
```

当前选择 Node.js 单体服务的原因是前端和服务端共用 JavaScript 渲染模型，Node 18+ 自带 `fetch`、`FormData` 和 `Blob`，无需 Java/Python 服务，也无需数据库才能启动。Docker 只是部署封装，不改变应用结构。

### 6.2 关键数据模型

文章至少包含：

```json
{
  "id": "local-article-id",
  "title": "文章标题",
  "content": "# Markdown 正文",
  "themeId": "editor-green",
  "themeVersion": 1,
  "themeSnapshot": {},
  "wechat": {
    "mediaId": null,
    "index": 0,
    "status": "local|draft|reviewing|published|failed",
    "lastRemoteHash": null,
    "lastSyncedAt": null
  },
  "updatedAt": "ISO-8601"
}
```

凭证单独保存，绝不进入文章 JSON、浏览器 localStorage、Git 提交或 Docker 镜像；生产部署时文件权限应限制为运行用户可读，建议 `0600`。

## 七. API 接口清单

| 方法 | 路径 | 作用 | 是否需要登录 |
| --- | --- | --- | --- |
| GET | `/api/health` | 健康检查、运行状态 | 否 |
| GET | `/api/auth/session` | 查询当前会话 | 否 |
| POST | `/api/auth/login` | 登录编辑器 | 否 |
| POST | `/api/auth/logout` | 注销会话 | 是 |
| GET | `/api/config` | 读取脱敏配置 | 是 |
| PUT/POST | `/api/config` | 保存配置和凭证 | 是 |
| GET | `/api/articles` | 文章列表 | 是 |
| POST | `/api/articles` | 创建文章 | 是 |
| GET | `/api/articles/:id` | 读取文章 | 是 |
| PUT | `/api/articles/:id` | 更新文章 | 是 |
| DELETE | `/api/articles/:id` | 删除本机文章 | 是 |
| GET | `/api/themes` | 主题列表 | 按访客策略开放 |
| POST | `/api/themes` | 创建自定义主题 | 是 |
| PUT | `/api/themes/:id` | 更新自定义主题 | 是 |
| DELETE | `/api/themes/:id` | 删除自定义主题 | 是 |
| POST | `/api/wechat/diagnose` | 测试 token 与连接 | 是 |
| POST | `/api/wechat/images/inspect` | 检查正文图片 | 是 |
| POST | `/api/wechat/draft/add` | 创建微信草稿 | 是 |
| POST | `/api/wechat/draft/update` | 更新微信草稿 | 是 |
| DELETE | `/api/wechat/draft/:mediaId` | 删除微信草稿 | 是 |

## 八. 图片与 OSS 设计

Typora 推荐使用 PicGo 或同类上传器，把图片上传到阿里云 OSS，Markdown 中保存公网 HTTPS URL。图片不要求和 `.md` 文件在同一目录；重要的是地址在编辑器服务端和微信服务器都可访问。

同步草稿前，服务端检查图片地址，并把 JPG/PNG 上传到微信正文图片接口，替换为微信返回地址。已经是 `mmbiz.qpic.cn` 的地址可以复用。

约束：使用公网 HTTPS；正文图片支持 JPG/PNG；单张不超过 10MB；`file://`、相对路径、`data:` 不能直接同步；私有 OSS Bucket 必须提供稳定签名 URL 或改为微信可抓取的公开 HTTPS 地址；任何图片失败都不能部分更新草稿。

## 九. 配置与安全

### 9.1 本地开发

```bash
cp .env.example .env.local
npm start
```

打开 `http://127.0.0.1:3210/`。本机 HTTP 适合填写 AppSecret，因为请求不会离开本机网络边界。

### 9.2 Docker 部署

服务器已安装 Docker 时，最少操作是执行一键脚本：

```bash
curl -fsSL https://raw.githubusercontent.com/helloLeila/codex-feishu-automation-kit/codex/test-local-commit-flow/scripts/deploy-wechat-editor.sh | bash
```

脚本会自动完成代码克隆或更新、交互式生成 `.env.local`、限制配置文件权限、构建 Docker 镜像、启动 Compose 服务和健康检查。默认目录是 `/opt/open-wechat-editor`，默认端口是 80。后续重复执行同一命令即可更新部署；不会覆盖已有 `.env.local` 或 `/data` 数据。

如果旧线上实例已经部署但未开启登录，使用：

```bash
curl -fsSL https://raw.githubusercontent.com/helloLeila/codex-feishu-automation-kit/codex/test-local-commit-flow/scripts/deploy-wechat-editor.sh \
  | bash -s -- --enable-login
```

该模式只更新登录四项配置并重启容器，不会覆盖公众号配置、文章或主题数据。

```bash
cp .env.example .env.local
# 设置 EDITOR_AUTH_ENABLED、EDITOR_AUTH_USER、EDITOR_AUTH_PASSWORD、
# EDITOR_SESSION_SECRET；AppID/AppSecret 可写入服务器 .env.local
docker compose --env-file .env.local up --build -d
```

Compose 将宿主机 `./data` 挂载到容器 `/data`。升级时：

```bash
git pull
docker compose --env-file .env.local build --pull
docker compose --env-file .env.local up -d
docker compose ps
curl -fsS http://127.0.0.1/api/health
```

当前没有 GitHub Actions 自动部署。后续实现自动部署时，推荐“构建镜像 → 推送私有镜像仓库 → 触发服务器拉取 → 健康检查 → 保留上一版本回滚”。GitHub 只保存代码，不保存文章、主题运行数据或凭证。

### 9.3 公网安全边界

公网部署必须启用编辑器登录。AppSecret 不进入浏览器 localStorage、URL、日志、GitHub 或镜像。HTTP 页面不能安全承载公网 AppSecret 输入；正式方案是域名 + HTTPS + 反向代理；临时 IP 方案应把凭证预置在服务器受限文件中，避免在公网页面输入。微信公众号后台必须加入运行容器所在服务器的出口公网 IP 白名单。

## 十. 错误处理与恢复规则

错误提示必须告诉用户发生在哪一步、是否已经改变远端状态、下一步做什么。核心不变量：本机保存失败不能清空当前内容；图片准备未全部成功时不能更新草稿；草稿更新失败不能自动创建新草稿；审核状态下不能静默覆盖微信后台内容；删除文章默认只删本机数据。

## 十一. 测试与验收标准

每次修改至少执行：

```bash
npm run check
npm test
git diff --check
```

功能验收：Markdown 渲染完整；三套主题影响预览、复制、HTML 和草稿；刷新可恢复；访客复制不要求登录；登录后可保存配置和诊断微信；图片检查区分常见失败类型；创建后更新复用 `media_id`；审核后不自动覆盖远端；失败时本机文章仍可编辑；Docker 重建后 `/data` 数据仍在。

## 十二. 后续模型/开发者启动说明

后续对话应先阅读本文，再阅读 `README.md`、两份专题设计稿，以及 `apps/wechat-editor/src/` 下的渲染、存储、认证、微信客户端和主题文件。

开发前运行 `git status --short`，保护用户已有修改；完成后运行 `npm run check`、`npm test` 和 `git diff --check`。不要把 `.env.local`、`data/`、AppSecret、Token、Cookie 或真实微信响应提交到 Git。

## 十三. 可直接交给后续模型的提示词

```text
你正在继续开发 codex-feishu-automation-kit 仓库中的 Open WeChat Editor。

先读取 docs/wechat-editor-status-and-design.md（当前真实状态和待办的单一事实源），再读取 README.md、docs/superpowers/specs/2026-08-20-wechat-sync-config-design.md、docs/superpowers/specs/2026-07-13-open-wechat-editor-design.md，以及 apps/wechat-editor/src/ 下的 app.mjs、markdown-renderer.mjs、wechat-html.mjs、server/wechat-client.mjs、server/config-store.mjs、server/article-store.mjs、theme-schema.mjs。

继续实现编辑器，但保留这些产品决策：Markdown 是唯一正文编辑源；右侧是 375px 只读预览；复制发布与微信草稿同步分离；进入审核后暂停自动同步；Docker/Compose 是部署基线；微信请求只能由服务端发起；不接管微信后台网页，不使用 Cookie 自动点击，不承诺 HTML 无损反向转换 Markdown。

先运行 git status --short，保护现有修改。优先级是：P0 发布状态闭环、草稿冲突检测、图片失败恢复、发布前确认、微信接口契约测试；P1 编辑器内图床上传、文章元数据、自动部署、版本快照和健康状态；P2 多用户、多公众号、数据库和半自动 HTML 转 Markdown。

完成后说明修改文件和行为变化，运行 npm run check、npm test、git diff --check；涉及 UI 时启动本地服务并验证关键交互；更新本文状态；不声称执行过未执行的命令或完成未验证的部署。
```

## 十四. 当前公网部署记录

截至 2026-09-05，已验证部署基线：ECS 公网 IP `47.115.33.37`；项目目录 `/opt/open-wechat-editor`；入口 `http://47.115.33.37/`；健康接口 `http://47.115.33.37/api/health`；宿主机端口 `80 -> 容器 3210`；容器运行正常，`authEnabled: true`；已验证提交 `4db7c49`。

该入口仍是 HTTP IP 访问，不等同于正式 HTTPS 生产环境。长期公网使用应补齐域名、HTTPS、反向代理、备份和自动部署回滚。

## 十五. 维护规则

新能力进入状态总表；有明确限制的能力标记为“部分完成”；决定不做的能力放入“产品边界/不承诺”；API、数据模型、部署命令变更时同步修改本文和测试；真实凭证、用户文章和服务器私有数据只存在运行环境，不进入本文。
