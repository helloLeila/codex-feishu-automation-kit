# 公众号编辑器生产化同步设计

## 一. 目标与边界

### （一）目标

1. 左侧 Markdown 编辑器使用 CodeMirror 6，保留本地实时恢复、撤销/重做、Markdown 快捷操作和拖拽导入。
2. 右侧继续由服务端生成微信兼容 HTML，预览与复制到微信公众号使用同一份内联样式。
3. AI、图片、微信同步均通过服务端适配器执行，浏览器不接触 DeepSeek、GLM-Image、微信 AppSecret 或 SMTP 密码。
4. 同一文章的同步任务具备 revision 并发保护、幂等键、失败分类、三次失败告警和 `submitted_unknown` 未知提交状态。
5. 用户可以访客模式编辑/预览/复制；登录后使用文章持久化、AI 和微信草稿同步。

### （二）边界

1. 生产默认继续使用 Docker，数据目录挂载到 `/data`，代码目录可部署到 `/opt/services/open-wechat-editor`。
2. 首版保留 JSON 文件存储，接口和任务模型按 SQLite 可迁移结构设计；这样不阻塞当前无原生依赖的本地启动。后续多实例部署再迁移 SQLite/Postgres。
3. 邮箱注册首版提供用户存储、验证码状态和 SMTP 适配器；未配置 SMTP 时只能在开发模式返回验证码，不向生产页面泄露验证码。

## 二. 总体架构

```text
浏览器
  ├─ CodeMirror 6 Markdown 编辑器
  ├─ 服务端 HTML 预览
  └─ 复制 HTML / 创建同步任务
          │
          ▼
Node Web
  ├─ auth / user store
  ├─ article store（revision）
  ├─ AI adapters
  │   ├─ ai-text-provider：DeepSeek
  │   └─ ai-image-provider：GLM-Image
  ├─ cover processor：Sharp（可选依赖，未安装时明确报错）
  ├─ WeChat client（access_token、素材、草稿）
  └─ sync task store / sync service
          │
          ├─ Node Worker（同进程可运行，Docker 可拆服务）
          ├─ SMTP mailer
          └─ 微信公众平台
```

## 三. 数据与状态

### （一）文章字段

```json
{
  "id": "article-...",
  "ownerId": "user-...",
  "title": "文章标题",
  "markdown": "# 正文",
  "themeId": "clear-reading",
  "revision": 18,
  "metadata": {
    "digest": "摘要",
    "coverPrompt": "封面提示词",
    "coverMediaId": "永久素材 media_id"
  },
  "wechat": {
    "mediaId": null,
    "index": 0,
    "status": "local-only",
    "paused": false
  }
}
```

每次文章正文、标题、主题或 AI 元数据改变，`revision` 加一。任务创建时记录 `articleId + revision + mode`，执行前后都检查当前 revision；旧任务只能进入 `stale`，不能写回新文章。

### （二）同步状态

```text
queued
running
retry_wait
synced
failed_retryable
failed_permanent
submitted_unknown
stale
paused
```

同一 `articleId + revision` 只允许一个 `queued/running/retry_wait/submitted_unknown` 任务。`submitted_unknown` 必须人工确认或通过微信草稿查询恢复，禁止自动再次调用 `draft/add`。

### （三）同步模式

| 模式 | 内容 |
| --- | --- |
| `full` | 标题、摘要、封面、正文、正文图片，并创建或更新草稿 |
| `body_only` | 只更新正文和正文图片，自动同步只允许此模式 |
| `regenerate_metadata` | DeepSeek 生成标题/摘要/提示词，GLM-Image 生成封面，再进入 `full` |

## 四. AI 与图片契约

### （一）DeepSeek 文本适配器

文件：`apps/wechat-editor/src/server/ai/ai-text-provider.mjs`

接口：

```js
const provider = createAiTextProvider({ apiKey, baseUrl, model, fetchImpl });
await provider.generateMetadata({ markdown, currentTitle, tone });
// => { title, digest, coverPrompt, model, usage }
```

服务端要求模型返回 JSON，并进行字段长度、空值、控制字符校验；解析失败视为永久模型响应错误，不把原始响应写入日志。

### （二）GLM-Image 图片适配器

文件：`apps/wechat-editor/src/server/ai/ai-image-provider.mjs`

接口：

```js
await provider.generateCover({ prompt, size: '900x383' });
// => { url, requestId }
```

密钥只从 `GLM_IMAGE_API_KEY` 读取。返回 URL 后交给图片处理器，不直接作为微信封面。

### （三）Sharp 封面处理器

文件：`apps/wechat-editor/src/server/media/cover-processor.mjs`

流程：下载临时 URL → 限制响应大小 → 读取元信息 → cover 裁剪/缩放 → JPEG 质量压缩 → 校验尺寸与 MIME → 返回 Buffer → 上传微信永久素材。

Sharp 为可选运行依赖。未安装时接口返回 `SHARP_NOT_INSTALLED`，不会静默把未经处理的远程图片提交给微信。

## 五. 失败与重试

### （一）可重试

网络超时、HTTP 5xx、微信频率限制、模型临时不可用。采用指数退避，默认最多 3 次。

### （二）立即停止

AppSecret 错误、40164 白名单错误、图片格式/尺寸错误、权限不足、模型余额不足、JSON 响应不合法。

### （三）告警

第 3 次失败后写入 `failed_permanent`，暂停文章自动同步，并通过 `MAIL_*` SMTP 配置发送一次告警。告警失败不会覆盖原始同步错误。

## 六. 微信请求成功但响应丢失

调用 `draft/add` 前先创建任务幂等键。请求超时或响应 JSON 无法读取时状态为 `submitted_unknown`，保留请求指纹，不再次创建草稿。用户可调用“查询草稿/确认已创建”完成收敛。

## 七. 注册与安全

1. 用户表按邮箱唯一；密码使用 `scrypt` 哈希，不存明文。
2. 邮箱验证码只保存哈希、过期时间和尝试次数；生产没有 SMTP 时禁止启用公开注册。
3. 文章、主题、公众号配置均带 `ownerId`，后端每次读取按当前会话隔离。
4. AppSecret、AI Key、SMTP 密码优先使用服务器 `.env.local`，API 响应只返回 `secretConfigured`。

## 八. Docker 运行

```text
/opt/services/open-wechat-editor
├─ docker-compose.yml
├─ .env.local
└─ data/
   └─ config/
```

Web 与 Worker 使用同一镜像、同一 `/data` 卷；默认 `SYNC_WORKER_ENABLED=true` 在 Web 进程内启动 worker，后续可将 `command` 拆为独立 worker 服务。

## 九. 验收标准

1. CodeMirror 6 挂载成功；无构建产物时有明确 textarea 回退。
2. DeepSeek/GLM 适配器可用假 fetch 测试，密钥不出现在错误信息和日志。
3. Sharp 管线能够拒绝超大、非图片和错误尺寸输入。
4. 旧 revision 任务不会覆盖新文章；重复点击不会创建两个活动任务。
5. `submitted_unknown` 不自动重复 `draft/add`。
6. 三次可重试失败后只发一次邮件并暂停自动同步。
7. `npm run check`、`npm test`、`npm run build:editor` 和 Docker 构建通过。
