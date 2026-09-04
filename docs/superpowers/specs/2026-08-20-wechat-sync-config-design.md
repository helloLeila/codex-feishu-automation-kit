# 微信公众平台凭证与草稿同步设计

## 目标

让 Open WeChat Editor 在不暴露 `AppSecret` 的前提下，完成以下链路：

```text
设置 AppID / AppSecret
  → 服务端保存凭证
  → 连接诊断与 IP 白名单检查
  → 用户首次确认创建草稿
  → 微信返回 media_id
  → 本地编辑阶段防抖自动更新同一 media_id
  → 进入审核后立即暂停自动同步
```

本设计只使用微信官方服务端 API，不接管微信公众平台网页，不使用 Cookie，不自动点击后台按钮。

## 凭证放在哪里

### 推荐方式：编辑器设置页

用户在顶部“设置”中填写：

- AppID
- AppSecret
- 默认作者
- 默认摘要规则
- 默认封面永久素材 `thumb_media_id`
- 是否打开评论
- 是否仅粉丝可评论
- 是否开启自动同步
- 自动同步防抖时间，默认 15 秒

浏览器只把表单提交给本机 `127.0.0.1:3210/api/config`。前端不会保存 `AppSecret` 到 `localStorage`，也不会请求微信域名。

### 文件与环境变量

支持两种配置来源，优先级如下：

```text
环境变量 > 本机 credentials.json > 空值
```

环境变量：

```bash
WECHAT_APP_ID=wx_your_app_id
WECHAT_APP_SECRET=your_app_secret
WECHAT_API_BASE_URL=https://api.weixin.qq.com
```

本机设置文件：

```text
macOS: ~/Library/Application Support/open-wechat-editor/settings.json
       ~/Library/Application Support/open-wechat-editor/credentials.json
Windows: %APPDATA%/open-wechat-editor/settings.json
         %APPDATA%/open-wechat-editor/credentials.json
Linux: ~/.config/open-wechat-editor/settings.json
       ~/.config/open-wechat-editor/credentials.json
```

`credentials.json` 只允许当前用户读写，服务端 API 永远只返回 `appId` 和 `secretConfigured: true/false`，不能读取或回显明文 AppSecret。

## 微信公众平台侧配置

用户需要在公众号后台完成：

1. 找到开发者配置，复制 AppID，并重置/复制 AppSecret。
2. 把当前运行编辑器的服务端出口公网 IP 加入接口 IP 白名单。
3. 确认账号有草稿箱与素材相关权限。
4. 准备一张永久素材封面，填写其 `thumb_media_id`；草稿图文消息的封面必须使用永久 MediaID。

如果出现 `40164`，不是 Markdown 或模板问题，而是调用微信的出口 IP 不在白名单；如果出现 `40001` / `40125`，优先检查 AppID、AppSecret 和大小写。

## 服务端边界

微信官方接口只能由服务端调用，因此浏览器只调用本地 API：

```text
浏览器 → 本地 Node API → api.weixin.qq.com
```

服务端负责：

- `access_token` 获取与缓存，提前 5 分钟刷新；
- 本地图片上传到“上传发表内容中的图片”接口，并替换 Markdown 里的本地 URL；
- 封面永久素材 ID 校验；
- `draft/add` 首次创建；
- `draft/update` 更新既有草稿；
- `draft/get` 远端回读和冲突检查；
- 微信错误码翻译为用户可读的配置/权限/内容错误；
- 自动同步队列合并，禁止并发更新和错误时重复创建草稿。

前端禁止出现 `access_token`、`AppSecret`、微信 API Base URL 以外的微信凭证细节。

## 草稿生命周期

文章本地模型保存：

```json
{
  "id": "local-article-id",
  "markdown": "# ...",
  "themeId": "clear-reading",
  "themeVersion": 1,
  "wechat": {
    "accountId": "wx_app_id",
    "mediaId": "MEDIA_ID",
    "index": 0,
    "status": "synced",
    "autoSync": true,
    "lastLocalHash": "sha256:...",
    "lastRemoteHash": "sha256:...",
    "lastSyncedAt": "2026-08-20T...Z"
  }
}
```

状态机：

```text
local-only
  → creating
  → synced
  → pending-sync
  → syncing
  → synced

synced → conflict       远端内容变化
synced → reviewing      用户进入审核
reviewing → synced      返回编辑并重新确认远端基线
syncing → sync-failed   token、白名单、权限或内容错误
```

规则：

- 第一次创建草稿必须人工点击“创建微信草稿”，不能因为输入停止而静默创建。
- 创建成功后记录 `media_id`，后续只调用 `draft/update`，不能失败后偷偷创建新草稿。
- 编辑阶段停止输入 15 秒后才进入同步队列；连续输入会合并为一次更新。
- 进入审核时立即保存、做最终同步并暂停自动同步。
- 如果微信后台被手动改过，先标记冲突，不覆盖远端内容。
- 微信后台的修改不会反向同步到 Markdown；以后如需反向导入，必须是明确的“从微信复制为新文章”操作。

## 内容处理

```text
Markdown
  → 统一渲染器
  → 微信兼容 HTML
  → 本地图片上传并替换 URL
  → 长度/标题/摘要/封面校验
  → draft/add 或 draft/update
```

草稿提交前检查：

- 标题不超过官方限制；
- 作者、摘要按官方限制截断或阻止提交；
- 正文 HTML 小于接口限制；
- 代码块、脚本、事件属性全部清理；
- 正文图片不能保留 `/assets/...`、`file://` 或未经上传的外链；
- 封面为永久 MediaID；
- 主题版本、正文和文章元数据一起计算哈希。

## 设置向导界面

### 第一步：账号

显示 AppID、AppSecret、默认作者、封面 MediaID。

### 第二步：连接诊断

按钮“测试连接”执行：

1. 服务端获取 access_token；
2. 显示接口出口 IP；
3. 检查常见错误码；
4. 显示“已连接 / IP 白名单缺失 / 凭证错误 / 权限不足”。

### 第三步：同步策略

- 仅本机保存；
- 创建草稿后自动同步；
- 防抖时间 15 秒；
- 进入审核自动暂停；
- 同步失败只重试有限次数，之后转为“需要手动重试”。

### 第四步：发布安全

默认只打开微信公众平台手动确认发布。官方发布 API 是独立开关，必须在发布前再次确认标题、摘要、封面和最终预览。

## 克隆后的使用流程

```bash
git clone <仓库地址>
cd <仓库目录>
npm install
npm start
```

然后浏览器打开 `http://127.0.0.1:3210/`：

1. 设置 → 填 AppID / AppSecret；
2. 保存设置；
3. 测试连接；
4. 按诊断结果配置微信 IP 白名单；
5. 设置封面永久 MediaID；
6. 写 Markdown；
7. 点击“创建微信草稿”；
8. 后续本地停止输入约 15 秒，自动更新同一个草稿；
9. 去微信后台人工审核、调整并发布；
10. 点击“进入审核”后，本地自动同步暂停。

## 明确不做的事情

- 不把 AppSecret 编译进前端；
- 不把 AppSecret 提交到 Git；
- 不在浏览器直接请求微信 API；
- 不使用 135/秀米 Cookie；
- 不模拟微信后台点击；
- 不自动覆盖用户已经在微信后台手工调整的内容；
- 不把“创建草稿”和“发布文章”混成一个按钮。
