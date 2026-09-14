# 微信公众号配置引导链接 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在公众号配置设置页加入本机公网 IP 查询和微信开发者控制台入口，并提供清晰的 AppID/AppSecret/IP 白名单配置引导。

**Architecture:** 仅修改静态设置页、共享样式、现有 UI 契约测试和 README。链接由 HTML 固定声明并使用 `target="_blank"` 与 `rel="noreferrer noopener"`，不通过 JavaScript 拼接凭证或发起跨域 IP 请求；现有配置存储和微信客户端保持不变。

**Tech Stack:** HTML、CSS、Node.js 内置 `node:test`、Markdown 文档。

---

### Task 1: Add failing UI contract tests

**Files:**
- Modify: `tests/wechat-editor-ui-redesign.test.mjs`

- [ ] **Step 1: Write the failing test**

在现有 UI 测试中加入：

```js
test('wechat settings expose safe setup links for local IP and developer console', async () => {
  const html = await readFile(new URL('../apps/wechat-editor/index.html', import.meta.url), 'utf8');
  assert.match(html, /href="https:\\/\\/ifconfig\.me\\/ip"/);
  assert.match(html, /href="https:\\/\\/developers\.weixin\.qq\.com\\/console\\/product\\/mp\\/wxa89b7304952bc85e\?tab1=basicInfo"/);
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.match(html, /运行 Node 服务电脑的公网 IPv4/);
  assert.match(html, /AppSecret.*本机服务端/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test tests/wechat-editor-ui-redesign.test.mjs`

Expected: FAIL because the two hrefs and the new setup copy do not exist.

### Task 2: Add setup links and guidance to settings markup

**Files:**
- Modify: `apps/wechat-editor/index.html:99`

- [ ] **Step 1: Add the static help block**

在公众号配置的 AppID/AppSecret 表单之前加入一个 `wechat-setup-guide` 区块，包含两个 `a` 元素：

```html
<div class="wechat-setup-guide" aria-label="微信公众号接入步骤">
  <div class="wechat-setup-guide-heading">
    <strong>接入步骤</strong>
    <span>本机服务端保存凭证</span>
  </div>
  <ol>
    <li>在 <a href="https://ifconfig.me/ip" target="_blank" rel="noopener noreferrer">查看本机公网 IP</a> 页面复制 IPv4。</li>
    <li>在 <a href="https://developers.weixin.qq.com/console/product/mp/wxa89b7304952bc85e?tab1=basicInfo" target="_blank" rel="noopener noreferrer">微信开发者控制台</a> 配置该 IPv4 到 IP 白名单，并获取 AppID / AppSecret。</li>
    <li>回到本页填写 AppID 和 AppSecret，保存后点击“测试连接”。</li>
  </ol>
  <p>白名单填写运行 Node 服务电脑的公网 IPv4，不要填 127.0.0.1、内网地址、协议头或端口。AppSecret 只提交给本机服务端，不会写入浏览器存储。</p>
</div>
```

- [ ] **Step 2: Run test to verify it still fails only on styling if needed**

Run: `node --test tests/wechat-editor-ui-redesign.test.mjs`

Expected: The new link/content assertions pass; any styling assertion should remain unrelated.

### Task 3: Style the guide without changing the existing visual system

**Files:**
- Modify: `apps/wechat-editor/styles.css`

- [ ] **Step 1: Add compact editorial styles**

Append styles near the existing settings help rules:

```css
.wechat-setup-guide {
  margin: 0 0 14px;
  padding: 12px 14px;
  border: 1px solid #cfe0d5;
  border-radius: 6px;
  background: #f4f9f5;
  color: #52625a;
  font-size: 11px;
  line-height: 1.6;
}
.wechat-setup-guide-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 6px;
}
.wechat-setup-guide-heading strong { color: var(--accent-dark); font-size: 12px; }
.wechat-setup-guide-heading span { color: #819088; font-size: 10px; }
.wechat-setup-guide ol { margin: 0; padding-left: 18px; }
.wechat-setup-guide li { margin: 3px 0; }
.wechat-setup-guide a { color: var(--accent-dark); text-decoration: underline; text-underline-offset: 2px; }
.wechat-setup-guide a:hover { color: var(--accent); }
.wechat-setup-guide p { margin: 7px 0 0; color: #819088; font-size: 10px; }
```

- [ ] **Step 2: Run UI tests**

Run: `node --test tests/wechat-editor-ui-redesign.test.mjs`

Expected: PASS.

### Task 4: Document the user path and verify the whole repository

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add local configuration instructions**

Under the local editor setup section, state that the settings page links to `https://ifconfig.me/ip` and the provided WeChat console; the IP to whitelist is the machine running Node, and AppSecret remains server-side.

- [ ] **Step 2: Run all checks**

Run:

```bash
npm run check
npm test
git diff --check
```

Expected: syntax passes, all tests pass, and no whitespace errors.

- [ ] **Step 3: Commit**

```bash
git add apps/wechat-editor/index.html apps/wechat-editor/styles.css README.md tests/wechat-editor-ui-redesign.test.mjs
git commit -m "feat: add wechat configuration setup links"
```

