# 开源微信公众号编辑器设计稿

日期：2026-07-13
状态：待用户书面确认
项目代号：Open WeChat Editor

## 1. 产品定义

Open WeChat Editor 是一个本地优先、开源、自托管的微信公众号 Markdown 编辑器。

用户在左侧粘贴或编辑 Markdown，右侧实时查看只读的公众号样式预览。文章在本机自动保存；第一次由用户明确创建微信草稿，之后在本地编辑阶段自动更新同一个草稿。用户进入审核阶段后，系统停止自动同步，待用户确认最终草稿后才允许发布。

核心体验：

```text
粘贴文章
  -> 本机实时保存
  -> 公众号样式实时预览
  -> 创建微信草稿
  -> 编辑阶段自动更新同一个草稿
  -> 进入审核，暂停自动同步
  -> 人工确认最终草稿
  -> 手动发布或显式调用官方发布 API
```

产品不依赖秀米、135 或其他私有排版 API，不使用微信公众号后台 Cookie，不模拟浏览器点击，只调用微信官方服务端 API。

## 2. 目标与非目标

### 2.1 第一阶段目标

1. 提供类似掘金的 Markdown 编辑与实时预览体验。
2. 支持直接粘贴 Markdown、普通文本和图片，支持导入 `.md` 文件。
3. 本机自动保存，刷新、崩溃和重启后可恢复。
4. 使用同一渲染核心生成预览、复制富文本、导出 HTML 和微信草稿正文。
5. 使用微信官方 API 创建和更新草稿，持续绑定同一个 `media_id`。
6. 编辑阶段支持防抖自动同步微信草稿，并提供“立即同步”。
7. 进入微信审核后暂停自动同步，防止覆盖微信后台修改。
8. 模板可切换、复制、导入和导出；第一版内置一套模板，架构支持后续三套以上模板。
9. 发布前必须人工确认，任何内容变化都会使确认失效。
10. 用户克隆仓库后只需安装 Node.js、运行 `npm install` 和 `npm start`。

### 2.2 第一阶段非目标

- 不做右侧富文本直接编辑、拖拽排版或秀米式组件搭建。
- 不做云账号、多人协作、多设备实时同步。
- 不做多公众号授权平台；第一阶段按单用户、单公众号设计。
- 不承诺微信 HTML 无损反向转换为 Markdown。
- 不做 Word、飞书文档或复杂网页的结构化导入。
- 不做定时群发、无人值守发布或批量营销。
- 不要求 Docker、Nginx、Java、Python 或数据库。
- 不接入 135、秀米私有 API，不做它们的网页自动化。

## 3. 已确定的产品决策

| 决策 | 选择 | 原因 |
|---|---|---|
| 编辑方式 | 左侧 Markdown，右侧只读预览 | 开发和维护成本可控，行为稳定 |
| 运行方式 | 本地 Node 服务 + 浏览器界面 | AppSecret 不进入浏览器，调用微信 API 不受前端跨域限制 |
| 代码组织 | 前后端分层，部署不分离 | 代码清晰，但用户只有一个进程和端口 |
| 数据位置 | 操作系统用户数据目录 | 更新或重新克隆代码不会丢文章 |
| 本机保存 | IndexedDB 崩溃缓冲 + Node 原子写文件 | 同时覆盖刷新、崩溃和磁盘持久化 |
| 微信同步 | 首次显式创建，之后防抖自动更新 | 避免未经许可创建远端数据，也避免每次输入都请求微信 |
| 审核交接 | 进入审核后暂停同步 | 不覆盖用户在微信后台的精修 |
| 发布 | 必须人工确认；默认手动发布，官方 API 发布可配置 | 防止误发并兼容账号权限差异 |
| 模板 | 数据驱动、版本化、可复制 | 第一版一套，后续扩展不重写渲染器 |
| 存储 | Markdown、JSON 和资源文件 | 开放、可迁移、无需数据库 |

## 4. 用户体验设计

### 4.1 首次启动

用户执行：

```bash
git clone https://github.com/helloLeila/codex-feishu-automation-kit.git
cd codex-feishu-automation-kit
npm install
npm start
```

`npm start` 的职责：

1. 检查编辑器构建产物是否存在或已过期。
2. 首次运行时自动构建。
3. 仅监听 `127.0.0.1`。
4. 启动一个本地端口，默认 `3210`；被占用时选择可用端口。
5. 自动打开默认浏览器。
6. 若未完成配置，进入首次设置向导。

首次设置向导分为四步：

1. **公众号配置**：填写 `AppID`、`AppSecret`。
2. **连接诊断**：检测出口 IP，提示配置微信 API IP 白名单，测试 token 获取与接口权限。
3. **写作默认值**：默认作者、评论设置、文章目录、默认模板、默认封面。
4. **同步与发布**：设置自动同步草稿；发布模式默认 `manual`，有权限时可选择 `official_api`。

配置保存后，后续 `npm start` 直接恢复上次打开的文章。

### 4.2 主编辑器

```text
┌──────────────────────────────────────────────────────────────┐
│ 文章库  新建  导入  导出  模板  设置   本机已保存  微信已同步 │
│                                      [立即同步] [进入审核]   │
├─────────────────────────────┬────────────────────────────────┤
│ Markdown 编辑区              │ 微信公众号预览                 │
│                             │                                │
│ # 标题                      │       排版后的标题             │
│                             │                                │
│ 正文内容……                  │  排版后的正文内容……            │
│                             │                                │
└─────────────────────────────┴────────────────────────────────┘
```

主编辑器包含：

- CodeMirror Markdown 编辑区。
- 375px 手机宽度的公众号预览；宽屏时可切换桌面阅读宽度。
- Markdown 工具栏：标题、粗体、引用、列表、分割线、代码、链接、图片和表格。
- 粘贴普通文本或 Markdown。
- 粘贴、拖入和选择本地图片。
- 本机保存状态与微信同步状态分别显示。
- 新建、导入、导出、复制富文本、选择模板、立即同步、进入审核和设置。

右侧预览不能直接编辑。用户的任何正文修改都在左侧完成，避免 Markdown 与富文本双源冲突。

第一次点击“创建微信草稿”时，系统打开文章信息确认框。标题默认取第一个一级标题，摘要默认取正文摘要，作者和封面使用文章值或全局默认值；用户确认标题、摘要、作者、封面、评论设置和当前模板后，系统才调用微信接口。缺少必需的封面或标题时禁止创建草稿，并直接说明如何补齐。

### 4.3 文章库

文章库展示：

- 标题、最近修改时间和当前模板。
- 本机状态：已保存、保存失败、已恢复。
- 微信状态：仅本机、待同步、同步中、已同步、微信有修改、冲突、草稿被删除、同步失败。
- 审核状态：编辑中、审核中、已确认。
- 发布状态：未发布、提交中、处理中、已发布、发布失败。

支持搜索、按最近修改排序、打开历史版本和删除本地文章。删除已绑定微信草稿的文章时，默认只删除本机数据；删除微信草稿必须是另一个明确操作并再次确认。

### 4.4 审核与发布

用户点击“进入审核”时，系统：

1. 立即保存本机文章。
2. 创建发布前历史快照。
3. 完成最后一次微信草稿同步。
4. 使用 `draft/get` 回读草稿并核对规范化哈希。
5. 将文章切换为 `reviewing`，暂停自动同步。
6. 提供“打开微信公众平台”和“返回编辑”两个动作。

审核期间，本地编辑器默认只读。用户若选择“返回编辑”，确认状态立即失效，系统重新进入编辑阶段；下一次覆盖微信前必须再次检查远端是否已变化。

用户确认草稿时，确认绑定到以下内容的哈希：

```text
文章正文 + 标题 + 摘要 + 作者 + 封面 + 评论设置 + 模板版本
```

只要其中任意一项变化，确认自动失效。

发布模式：

- `manual`：默认。用户确认后打开微信公众平台，在微信后台手动发布。
- `official_api`：仅在账号拥有发布接口权限且用户明确启用后可用。点击发布时再次展示账号、标题、封面、摘要和最终预览；二次确认后调用官方发布接口，并轮询发布结果。

不存在自动发布、定时发布或后台静默发布。

## 5. 系统架构

### 5.1 仓库边界

编辑器作为当前仓库中的独立应用工作区：

```text
apps/wechat-editor/
├── package.json
├── src/
│   ├── core/
│   ├── client/
│   └── server/
├── themes/
│   └── default/
├── scripts/
└── tests/
```

当前 `scripts/`、`bin/`、`skills/` 和已有自动化保持原状。根 `package.json` 增加 npm workspaces 和编辑器命令，但继续保留 `npm run gba`。

生产环境只有一个本地进程和端口：

```text
GET  /              -> 构建后的 React 应用
/api/*               -> 本地 Node API
```

开发模式可在内部使用 Vite 代理，但开发者仍只执行 `npm run dev`。

### 5.2 技术栈

| 层 | 技术 |
|---|---|
| 语言 | TypeScript |
| 前端 | React + Vite |
| Markdown 编辑器 | CodeMirror 6 |
| Markdown 解析 | markdown-it 与必要插件 |
| 代码高亮 | highlight.js |
| HTML 清洗 | sanitize-html |
| CSS 内联 | juice 或等价、可测试的内联器 |
| 本地 HTTP 服务 | Node.js + Fastify |
| 微信请求 | Node 原生 `fetch` |
| 单元测试 | Vitest；已有 CLI 继续使用 `node:test` |
| 端到端测试 | Playwright |

编辑器要求 Node.js 22 或更高版本。为保证克隆后的统一体验，根项目的最低 Node 版本同步提升到 22，并在 README、`scripts/setup.sh` 和发布检查中明确说明。

### 5.3 核心模块

#### ArticleStore

负责文章、资源、修订和同步元数据的本地持久化，不调用微信 API。

```ts
interface ArticleStore {
  create(input: NewArticle): Promise<Article>;
  get(id: string): Promise<Article>;
  save(id: string, change: ArticleChange, baseRevision: number): Promise<Article>;
  list(): Promise<ArticleSummary[]>;
  snapshot(id: string, reason: SnapshotReason): Promise<ArticleRevision>;
}
```

#### Renderer

负责将 Markdown 与主题快照编译为安全、微信兼容、使用内联样式的 HTML。

```ts
interface Renderer {
  render(markdown: string, theme: ThemeSnapshot): RenderResult;
}
```

同一 `RenderResult` 用于右侧预览、复制富文本、HTML 导出和微信草稿，禁止维护四套不同渲染逻辑。

#### ThemeRegistry

负责内置主题、用户主题、主题版本和 Schema 校验。用户主题仅允许 JSON token 和受控组件样式，不允许执行 JavaScript。

#### WechatClient

微信 API 的低层封装，包括：

- `TokenProvider`
- `AssetUploader`
- `DraftGateway`
- `PublishGateway`

低层客户端不负责编辑状态、自动保存或 UI 提示。

#### DraftSyncService

负责同步队列、请求合并、哈希核对、冲突检测、失败重试和 `media_id` 绑定。

#### ConfigStore

负责公开设置、敏感凭据、环境变量覆盖、配置迁移、备份和脱敏读取。微信配置不写入现有 `tech-events-assistant.*` 文件。

## 6. 数据设计

### 6.1 数据目录

配置与文章都位于用户目录，不位于 Git 克隆目录。

```text
macOS:   ~/Library/Application Support/open-wechat-editor/
Windows: %APPDATA%\open-wechat-editor\
Linux:   ~/.local/share/open-wechat-editor/
```

用户可以在设置中把文章目录改为可见目录，例如 `~/Documents/公众号文章/`。

```text
open-wechat-editor/
├── config/
│   ├── settings.json
│   └── credentials.json
├── cache/
│   └── access-token.json
└── articles/
    └── <article-id>/
        ├── article.md
        ├── metadata.json
        ├── article.wechat.html
        ├── assets/
        └── revisions/
```

### 6.2 文章元数据

```ts
interface ArticleMetadata {
  schemaVersion: 1;
  id: string;
  title: string;
  author: string;
  digest: string;
  coverAssetId: string | null;
  themeId: string;
  themeVersion: string;
  themeSnapshotHash: string;
  localRevision: number;
  contentHash: string;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string;
  wechat: {
    mediaId: string | null;
    accountId: string | null;
    autoSyncEnabled: boolean;
    lastSyncedRevision: number | null;
    lastSyncedHash: string | null;
    remoteBaselineHash: string | null;
    lastSyncedAt: string | null;
    publishId: string | null;
    articleUrl: string | null;
  };
  state: {
    local: LocalState;
    sync: SyncState;
    review: ReviewState;
    publish: PublishState;
    approvalHash: string | null;
  };
}
```

状态使用四组正交字段，而不是一个无法维护的巨大枚举：

```text
local:   dirty | saving | saved | error | recovered
sync:    local_only | creating | pending | syncing | synced |
         remote_changed | conflict | remote_deleted | error
review:  editing | reviewing | approved
publish: idle | submitting | processing | published | failed
```

## 7. 本机自动保存与恢复

### 7.1 保存策略

本机保存与微信同步是两条独立链路。

1. 编辑器发生变化时，立即将操作日志写入 IndexedDB。
2. 用户停止输入约 800ms 后，调用本地 API 保存文章。
3. Node 服务校验 `baseRevision`，写入临时文件，`fsync` 后原子替换正式文件。
4. 保存成功后返回递增的服务端修订号和内容哈希。
5. UI 显示“正在保存”“已保存 HH:mm:ss”或明确错误。

快捷键 `Command/Ctrl + S` 立即触发磁盘保存。

### 7.2 自动恢复

应用启动时：

1. 读取上次打开的文章 ID。
2. 读取磁盘文章和服务端修订号。
3. 检查 IndexedDB 是否存在更新的崩溃日志。
4. 若浏览器日志更新，先创建磁盘快照，再恢复日志并标记 `recovered`。
5. 若恢复存在歧义，展示本机版本对比，不静默丢弃任一版本。

刷新页面、浏览器崩溃、Node 进程重启和电脑重启后均应恢复最后内容、图片引用、光标位置和滚动位置。

### 7.3 多标签页保护

- 使用 `BroadcastChannel` 通知同一文章已在其他标签页打开。
- 保存请求携带 `baseRevision`。
- 服务端发现修订落后时拒绝覆盖并返回冲突。
- 用户必须选择重新加载新版本或复制为新文章。

### 7.4 历史版本

以下时点必须创建快照：

- 同步微信前。
- 进入审核前。
- 处理冲突前。
- 发布前。
- 用户手动创建版本时。

默认保留最近 20 个自动快照和所有发布快照；保留策略可配置。

## 8. Markdown、图片与渲染

### 8.1 Markdown 能力

第一版支持：

- 一级至三级标题。
- 段落、粗体、斜体、删除线和高亮。
- 有序与无序列表。
- 引用、分割线、链接和图片。
- 行内代码和代码块。
- 表格。

原始 HTML 默认关闭或经过严格 allowlist 清洗。脚本、事件属性、iframe、表单和危险 URL 协议必须删除。

### 8.2 图片流程

图片先持久化到本机 `assets/`，成功后才把引用写入 Markdown。

```text
粘贴/拖入图片
  -> 验证 MIME、大小和尺寸
  -> 计算 SHA-256
  -> 原子写入 assets/
  -> 插入相对路径
  -> 预览
```

同步微信时：

1. 扫描最终 HTML 的本地图片。
2. 根据 SHA-256 查询上传缓存。
3. 上传未缓存图片并获得微信图片 URL。
4. 所有图片准备成功后再更新草稿。
5. 替换 HTML 中的图片地址。
6. 封面使用符合微信要求的素材 ID。

任何图片上传失败都不能损坏本机文章或部分覆盖微信草稿。

### 8.3 预览一致性

右侧预览在隔离容器中渲染最终 HTML。预览、复制、导出和同步必须共享：

- 同一个 Markdown AST。
- 同一个主题快照。
- 同一个 HTML 清洗器。
- 同一个 CSS 内联结果。

微信同步成功后以 `draft/get` 返回内容作为远端基准，并保存规范化哈希和 `article.wechat.html` 快照。

## 9. 模板系统

### 9.1 主题包结构

```text
themes/default/
├── theme.json
├── tokens.json
├── components.json
└── preview.css
```

主题清单包含：

```ts
interface ThemeManifest {
  schemaVersion: 1;
  id: string;
  name: string;
  version: string;
  author: string;
  description: string;
  tokens: ThemeTokens;
  components: ComponentStyles;
}
```

`ThemeTokens` 包含颜色、字体、字号、行高、间距、圆角、边框和图片行为。第一版 UI 可以锁定字号，只开放模板选择、主色、背景、标题样式、引用样式和间距；数据模型不写死这些值。

### 9.2 用户操作

- 新文章使用全局默认主题。
- 内置主题不可直接修改，但可以“复制为我的模板”。
- 用户主题支持修改安全 token、重命名、导入和导出 JSON。
- 第一版内置 `default`；后续增加 `tech-blue` 和 `editorial-red`。
- 已有文章固定主题版本和快照。升级全局主题不会悄悄改变旧文章。
- 用户必须点击“应用新版模板”才会更新旧文章，并立即使审核确认失效。

### 9.3 安全限制

主题导入必须通过 JSON Schema 校验。禁止：

- JavaScript 和事件处理器。
- 任意远程脚本、字体或样式资源。
- 可覆盖编辑器外层 UI 的选择器。
- 微信不支持或会导致正文不可编辑的复杂布局。

## 10. 导入、导出与复制

### 10.1 导入

第一版支持：

- 直接粘贴 Markdown。
- 粘贴普通文本。
- 导入单个 `.md` 文件。
- 拖入 `.md` 文件。
- 粘贴、拖入或选择图片。

导入 `.md` 时复制进应用文章库，不默认修改原文件。

### 10.2 导出

- 导出 Markdown。
- 导出微信兼容、样式已内联的 HTML。
- 复制公众号富文本。
- 导出文章包：Markdown、最终 HTML、元数据、主题快照和本地图片。

HTML、飞书、Word 和微信草稿反向导入放入后续阶段。微信 HTML 转 Markdown 必须标记为有损转换，不能静默覆盖原文。

## 11. 微信配置与官方 API

### 11.1 配置存储

非敏感设置与敏感凭据分离：

```text
config/settings.json
config/credentials.json
```

凭据文件在支持的系统上设置为仅当前用户可读写。环境变量优先级高于文件：

```text
命令行参数
  > 环境变量
  > 工作区私密覆盖
  > 用户级配置
  > 项目公开默认值
```

支持的核心环境变量：

```text
WECHAT_APP_ID
WECHAT_APP_SECRET
WECHAT_API_BASE_URL
WECHAT_DEFAULT_AUTHOR
WECHAT_DEFAULT_THEME
WECHAT_ARTICLES_DIR
```

前端读取配置时，服务端只返回 `configured: true/false` 等脱敏状态，不返回 AppSecret、access token 或完整 AppID。

### 11.2 Token

- access token 由服务端获取、缓存和刷新。
- 到期前预刷新，并使用 single-flight 防止并发重复刷新。
- token 缓存位于私密目录。
- 日志只记录错误码和操作 ID，不打印凭据或 token。

### 11.3 草稿 API

官方草稿能力封装：

- 新增草稿。
- 更新草稿。
- 获取草稿。
- 删除草稿；仅用于明确的用户操作。

文章一旦创建微信草稿，就固定绑定账号 ID 与 `media_id`。自动同步只能更新这个 `media_id`，不能因普通错误静默创建新草稿。

### 11.4 发布 API

当 `publishing.mode = official_api` 且权限诊断通过时：

1. 发布前回读远端草稿。
2. 核对远端哈希等于 `approvalHash`。
3. 显示最终确认对话框。
4. 调用官方发布接口。
5. 保存 `publish_id`。
6. 轮询发布状态直到成功、失败或进入可恢复的超时状态。
7. 成功后保存文章 URL、最终 HTML、主题版本和发布快照。

提交结果不明确时禁止盲目重试，必须先查询发布状态，避免重复发布。

## 12. 自动同步与冲突处理

### 12.1 同步原则

本机保存约 800ms 防抖；微信自动同步采用 15 秒空闲防抖。连续编辑期间只保留最新待同步修订，每篇文章同时最多一个微信请求。

首次创建微信草稿必须由用户点击“创建微信草稿”。创建成功后，文章的自动同步默认开启；用户可以按文章关闭。

任何正文、图片、元数据或模板变化都会：

- 增加本机修订号。
- 标记微信状态为 `pending`。
- 清空 `approvalHash`。
- 若处于审核状态，先退出已确认状态，不自动覆盖远端。

### 12.2 同步状态转换

```text
local_only
  -> 用户创建草稿
creating
  -> 成功并保存 media_id
synced
  -> 本地修改
pending
  -> 15 秒空闲或立即同步
syncing
  -> 回读并核对成功
synced
```

进入审核：

```text
synced
  -> 进入审核
reviewing + 自动同步关闭
  -> 人工确认远端草稿
approved
  -> 手动发布或官方 API 发布
published
```

### 12.3 远端变化检测

每次成功同步后回读草稿并保存 `remoteBaselineHash`。以下时点再次检查：

- 应用重新获得焦点。
- 用户恢复本地编辑。
- 下一次同步前。
- 进入审核前。
- 发布前。

应用聚焦检查需节流，同一篇文章一分钟内最多自动检查一次；用户主动“立即同步”“进入审核”或“发布”不受该节流限制。

| 本地变化 | 微信变化 | 行为 |
|---|---|---|
| 否 | 否 | 保持已同步 |
| 是 | 否 | 更新原 `media_id` |
| 否 | 是 | 暂停自动同步，将微信版本标记为待确认 |
| 是 | 是 | 进入冲突，禁止自动覆盖 |
| 任意 | 草稿被删 | 标记远端删除，用户确认后才能重新创建 |

### 12.4 冲突操作

处理冲突前同时保存本机快照和微信 HTML 快照。用户可以：

1. **采用微信版本**：保留微信 HTML 作为最终稿，停止本地自动同步；不承诺无损转回 Markdown。
2. **本地覆盖微信**：显示影响并再次确认，然后更新原 `media_id`。
3. **本地复制为新草稿**：保留原微信草稿，本地文章创建新的微信草稿绑定。
4. **微信内容拉成新文章**：有损转换为新副本，原 Markdown 不变。

系统绝不自动选择冲突一方。

## 13. 本地 API 设计

第一版 API 只服务同源本地界面：

```text
GET    /api/health
GET    /api/bootstrap
GET    /api/settings
PATCH  /api/settings
POST   /api/settings/test-wechat

GET    /api/articles
POST   /api/articles
GET    /api/articles/:id
PATCH  /api/articles/:id
DELETE /api/articles/:id
POST   /api/articles/:id/snapshot
POST   /api/articles/:id/export

POST   /api/articles/:id/draft/create
POST   /api/articles/:id/draft/sync
POST   /api/articles/:id/review/enter
POST   /api/articles/:id/review/approve
POST   /api/articles/:id/publish

GET    /api/themes
POST   /api/themes/import
POST   /api/themes/:id/clone
PATCH  /api/themes/:id

POST   /api/assets
```

所有修改请求携带文章修订号或操作令牌。服务端返回稳定错误代码，前端负责翻译为用户可读提示。

## 14. 安全设计

1. 服务只监听 `127.0.0.1`，默认拒绝局域网访问。
2. 校验 `Host` 与 `Origin`，不开启通配 CORS。
3. 每次启动生成本地会话令牌，修改 API 需要 CSRF 保护。
4. AppSecret、token 和完整凭据永远不返回前端、不写日志、不进入 Git。
5. 凭据文件使用用户级权限；未来可接入 macOS Keychain、Windows Credential Manager 和 Linux Secret Service。
6. Markdown 与主题 HTML 经过 allowlist 清洗。
7. 预览运行在隔离容器中，禁止脚本和顶层导航。
8. 图片校验 MIME、文件头、大小和尺寸，并使用随机文件名。
9. 设置上传大小、请求体大小和请求频率限制。
10. 发布动作必须绑定人工确认哈希并再次确认。

## 15. 错误处理

### 15.1 本机错误

- 磁盘写入失败：保留 IndexedDB 恢复日志，显示持续错误状态，禁止误报“已保存”。
- 文章修订冲突：拒绝覆盖，提供重新加载或复制文章。
- 图片保存失败：不向 Markdown 插入无效引用。
- 配置损坏：使用最近备份恢复，并保留原文件供诊断。

### 15.2 微信错误

- IP 白名单错误：显示检测到的出口 IP 和后台配置路径。
- token 失败：区分 AppID/AppSecret 错误、网络错误和接口权限错误。
- 图片上传失败：本机不受影响，草稿不更新，允许重试。
- 草稿更新失败：保留 `pending`，指数退避；用户可立即重试。
- 创建草稿超时且结果不明：禁止直接重复创建，先查询近期草稿并提示用户确认。
- 远端草稿被删除：禁止静默新建。
- 发布提交结果不明：查询任务状态后再决定，不盲目重试。

错误提示至少包含：发生了什么、本机内容是否安全、下一步操作和可复制的脱敏诊断信息。

## 16. 测试策略

### 16.1 单元测试

- Markdown 标题、段落、列表、引用、图片、代码和表格渲染。
- HTML 清洗与 XSS 阻断。
- CSS 内联与主题 token。
- 主题 Schema、版本和快照哈希。
- 本机原子保存、修订校验和崩溃恢复。
- 配置优先级、备份、权限和日志脱敏。
- 同步状态转换、请求合并和确认失效。

### 16.2 微信客户端模拟测试

- token 缓存、并发刷新和过期重试。
- 正文图片与封面上传。
- 草稿新增、更新、回读和删除。
- 同一个文章始终更新原 `media_id`。
- 远端变化、远端删除和双向冲突。
- 发布提交、轮询成功、失败和未知状态。
- 微信限频、IP 白名单、权限和网络错误。

测试默认使用 mock server，不向真实公众号发送内容。

### 16.3 端到端测试

- 首次设置与连接诊断。
- 粘贴文章后实时预览。
- 粘贴图片后本地保存与恢复。
- 刷新、浏览器崩溃模拟和 Node 重启恢复。
- 导入 Markdown，导出 Markdown、HTML 和文章包。
- 主题复制、修改、导入、导出和切换。
- 首次创建草稿、后续自动同步、立即同步和失败重试。
- 进入审核后停止自动同步。
- 冲突时不覆盖任意一方。
- 未同步、存在冲突或确认失效时禁止发布。

### 16.4 视觉与跨平台测试

- 375px、移动端和桌面宽度预览截图。
- 微信正文关键组件快照。
- macOS、Windows、Linux 上 Node.js 22 的克隆、安装和启动测试。
- 构建产物扫描，确保不包含 AppSecret 或真实 token。

## 17. 第一阶段验收标准

1. 新用户按 README 执行 `npm install`、`npm start` 后可完成首次配置并打开编辑器。
2. 用户可直接粘贴 Markdown，右侧在 200ms 内更新预览。
3. 停止输入后约 800ms 写入本机；刷新、崩溃和重启后恢复正文与图片。
4. 更新或重新克隆项目不会删除用户文章和公众号配置。
5. 用户可导入 `.md`，导出 Markdown、微信 HTML 和完整文章包。
6. 预览、复制和微信草稿使用同一渲染结果。
7. 首次同步明确创建草稿，后续自动同步始终更新原 `media_id`。
8. 连续输入时微信同步队列合并请求，不产生并发更新或重复草稿。
9. 网络、token、白名单或图片错误不会影响本机文章。
10. 微信和本机同时修改时，自动同步停止且不覆盖任何一方。
11. 进入审核后自动同步立即关闭。
12. 正文、元数据、封面或模板变化后，原确认立即失效。
13. 未同步、存在冲突、远端变化或确认失效时不能发布。
14. 发布成功后保存最终 HTML、主题快照、本机修订、发布任务和文章链接。
15. 用户可以复制默认模板并修改安全 token；模板变更不修改 Markdown。

## 18. 分阶段交付

P0 至 P3 共同构成首个完整的 `v1.0` 版本；它们是实现顺序，不是从产品目标中删减功能。P4 属于 `v1.0` 之后的扩展方向。

### P0：本地编辑器

- React、Vite、CodeMirror、Fastify 单仓库应用。
- Markdown 编辑和公众号预览。
- 默认主题和统一渲染核心。
- 本机自动保存、恢复、文章库和图片资源。
- 导入、导出与复制富文本。

### P1：微信草稿同步

- 设置向导、凭据存储与连接诊断。
- token、图片、封面与草稿 API。
- 首次创建草稿、自动更新、立即同步和同步状态。
- 远端回读、哈希基准和审核交接。

### P2：模板与冲突

- 用户主题复制、token 编辑、导入与导出。
- 新增两套内置模板。
- 远端变化检测、四种冲突处理和版本恢复。

### P3：确认发布与分发

- 手动发布流程完善。
- 可选官方 API 发布、二次确认和结果轮询。
- 可发布 npm 包与 `npx open-wechat-editor`。
- 完整跨平台启动验证。

### P4：后续扩展

- 飞书文档、Word、HTML 导入。
- 微信草稿基础差异视图和有损反向导入。
- Git、WebDAV 或对象存储备份。
- 多公众号与微信第三方平台授权。
- 可选桌面安装包。

## 19. 与当前仓库的兼容策略

当前仓库是无依赖、纯 `.mjs` 的 Node 工具包，编辑器会引入 React、Vite、TypeScript、Fastify 和 lockfile。为控制影响：

1. 编辑器放入独立 workspace，不把依赖引入已有 Skill 运行目录。
2. 保留现有 `npm run gba`、CLI bin 和 `node:test` 测试。
3. 根 `npm test` 同时运行旧测试与编辑器测试。
4. 将 README 中“无 npm 依赖”的表述限定为现有推送 CLI，不再描述整个仓库。
5. 扩展 `scripts/setup.sh`、发布检查和密钥扫描，覆盖微信凭据。
6. 根包继续保持 `private: true`；未来把 `apps/wechat-editor` 作为独立可发布 npm 包，避免为支持 npx 改变整个仓库的发布边界。

## 20. 官方接口参考

- 草稿管理：<https://developers.weixin.qq.com/doc/subscription/guide/product/draft.html>
- 新增草稿：<https://developers.weixin.qq.com/doc/subscription/api/draftbox/draftmanage/api_draft_add.html>
- 发布草稿：<https://developers.weixin.qq.com/doc/subscription/api/public/api_freepublish_submit.html>

发布能力依赖账号类型、认证状态和接口权限。应用必须在首次设置中诊断能力，并在不具备权限时自动使用手动发布流程。
