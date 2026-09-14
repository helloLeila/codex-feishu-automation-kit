# 微信公众号配置引导链接设计

> 日期：2026-09-14
>
> 状态：已确认，待实现

## 一、目标

在设置中心的“公众号配置”区增加两个公开帮助入口，让用户能够完成本机微信公众号接入所需的三项配置：

1. 查询运行 Node 服务电脑的公网 IPv4。
2. 打开微信公众平台开发者控制台。
3. 在编辑器中保存 AppID 和 AppSecret，由本机 Node 服务端调用微信 API。

## 二、入口与交互

### 2.1 本机公网 IP

入口文案：查看本机公网 IP

目标地址：

https://ifconfig.me/ip

行为：

- 使用新标签页打开。
- 不在编辑器内发起跨域请求，不把 IP 结果写入文章或配置。
- 旁边显示说明：复制页面显示的 IPv4，填入微信公众号后台“基本配置 → IP 白名单”。
- 明确不填 127.0.0.1、localhost、内网地址、协议头或端口。

### 2.2 微信开发者控制台

入口文案：打开微信开发者控制台

目标地址：

https://developers.weixin.qq.com/console/product/mp/wxa89b7304952bc85e?tab1=basicInfo

行为：

- 使用新标签页打开，避免关闭设置弹窗或丢失 Markdown。
- 页面说明按顺序填写/获取 AppID、AppSecret，并配置 IP 白名单。
- URL 作为固定帮助链接维护，不接受用户输入，也不拼接凭证。

### 2.3 配置表单说明

在 AppID/AppSecret 表单上方增加紧凑的“接入步骤”帮助区：

1. 打开“查看本机公网 IP”，复制 IPv4。
2. 打开微信开发者控制台，填写该 IPv4 到 IP 白名单。
3. 将 AppID/AppSecret 填入当前表单并保存。
4. 点击“测试连接”。

AppID 可以展示当前已保存值。AppSecret 继续使用密码输入和掩码；保存后只显示“已配置”，不回显密钥。

## 三、安全边界

- 两个帮助链接不包含 AppID、AppSecret、access_token 或 Cookie。
- AppSecret 只提交到当前编辑器服务端的 /api/config，不进入 localStorage、文章内容、URL、日志、Git 或 Docker 镜像。
- 本机 http://127.0.0.1 场景允许设置页提交 AppSecret；公网 HTTP 场景仍由服务端拒绝提交，正式线上应使用 HTTPS 或服务器 .env.local。
- “查看本机公网 IP”只提供用户复制信息，不改变微信公众号配置。

## 四、实现范围

修改文件预计为：

- apps/wechat-editor/index.html：公众号配置帮助区和两个链接。
- apps/wechat-editor/styles.css：帮助区布局、按钮和链接状态。
- tests/wechat-editor-ui.test.mjs 或现有编辑器结构测试：验证两个 URL、target="_blank"、配置引导文案和 AppSecret 安全提示。
- README.md：补充本机配置步骤和链接用途。

不修改微信 API 客户端、凭证存储、文章数据模型或部署脚本。

## 五、验收标准

1. 设置中心 → 公众号配置可看到两个入口。
2. 两个入口均在新标签页打开，当前编辑器页面保持不变。
3. IP 入口地址准确为 https://ifconfig.me/ip。
4. 微信控制台入口地址准确为用户提供的开发者控制台地址。
5. 页面明确说明白名单应填写运行 Node 服务电脑的公网 IPv4。
6. 页面明确说明 AppSecret 由本机服务端保存，不会进入浏览器存储。
7. 现有 AppID/AppSecret 保存、掩码和测试连接行为不改变。
8. npm run check、npm test、git diff --check 全部通过。
