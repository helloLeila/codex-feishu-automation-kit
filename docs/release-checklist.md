# 发布前检查清单

开源或发版前按这份清单检查。

## 密钥安全

- [ ] `.env.local` 没有进入 git。
- [ ] `tech-events-assistant.local.json` 没有进入 git。
- [ ] README、示例、issue、截图里没有真实 `FEISHU_WEBHOOK_URL` 或 `SERVERCHAN_SENDKEY`。
- [ ] README、示例、issue、截图里没有真实 `FEISHU_WEBHOOK_SECRET`。
- [ ] 文档里只使用 `<FEISHU_WEBHOOK_URL>`、`<SERVERCHAN_SENDKEY>` 这类占位符，不写完整 webhook 形状。
- [ ] 扫描本地私人路径和疑似密钥：

```bash
rg -n "Users/|Obsidian Vault|open-apis/bot/v2/hook/[0-9a-fA-F-]{8,}|SCT[0-9a-zA-Z]{12,}|qyapi\\.weixin" . --glob '!docs/release-checklist.md'
```

预期：没有输出。

## 文档完整性

- [ ] README 包含 GitHub 仓库地址。
- [ ] README 包含飞书开放平台、自定义机器人文档、Server 酱登录页和 SendKey 获取说明。
- [ ] README 包含 `npm run gba`、`tech-events-assistant.config.json` 和 `tech-events-assistant.local.json` 说明。
- [ ] README 说明第 2 步会帮助打开飞书 / Server 酱取值页面。
- [ ] README 包含 AI 日报和配置驱动的线下技术活动 Codex 自动化说明。
- [ ] README 包含复制脚本到已有 Codex 工作区的命令。
- [ ] `docs/codex-automation-setup.md` 包含密钥读取顺序和排查方法。

## 功能验证

```bash
npm run check
npm test
npm run gba -- --dry-run
```

预期：

- 四条 `node --check` 命令退出码为 0。
- `npm run gba -- --dry-run` 显示“推送格式检查（不发送）”。
- 飞书卡片和 Server 酱消息预览均生成成功，且不会真实发送。

## GitHub 发布

```bash
git init
git add .
git commit -m "feat: add codex feishu automation kit"
git branch -M main
git remote add origin git@github.com:<owner>/codex-feishu-automation-kit.git
git push -u origin main
```

运行前把 `<owner>` 替换成你的 GitHub 用户名或组织名。

## Open WeChat Editor 发布检查

- [ ] `Dockerfile` 使用 Node 18+ 基础镜像，声明 `OPEN_WECHAT_EDITOR_CONFIG_DIR=/data/config`，暴露容器端口 `3210`。
- [ ] `Dockerfile` 通过 `NODE_BASE_IMAGE` 支持区域镜像源，默认值为 `node:20-bookworm-slim`；中国区部署已在 `.env.local` 填写可访问的完整镜像地址。
- [ ] `docker-compose.yml` 只把 `./data` 挂载到 `/data`，没有把宿主机私密目录复制进镜像。
- [ ] `.env.example` 只含空的 `WECHAT_APP_ID` / `WECHAT_APP_SECRET` 占位符和公开 API 地址；真实值只放在未跟踪的 `.env.local`。
- [ ] `.gitignore` 和 `.dockerignore` 忽略 `.env.*`、`data/`、`node_modules/` 与本地输出目录。
- [ ] 本地启动验证：

```bash
npm start
```

浏览器可打开 `http://127.0.0.1:3210/`，且未配置 AppID 时仍可编辑和预览 Markdown。

- [ ] Docker Compose 配置验证：

```bash
docker compose config
docker compose build
docker compose --env-file .env.local up -d
curl --fail http://127.0.0.1:3210/
docker compose down
```

中国区或 Docker Hub 不稳定时，先在 `.env.local` 设置 `NODE_BASE_IMAGE`，再使用 `docker compose ... build --pull`；ECS 若使用 Podman，则使用等价的 `podman-compose` 命令。

- [ ] 容器外部端口可通过 `PORT` 调整，容器内部仍使用 `3210`；`./data/config` 在重建容器后仍存在。
- [ ] 公众号 AppID / AppSecret 没有出现在前端代码、浏览器存储、镜像层、README、截图或测试 fixture 中。
- [ ] 公网部署已设置 `EDITOR_AUTH_ENABLED=true`、长随机 `EDITOR_AUTH_PASSWORD` 和 `EDITOR_SESSION_SECRET`。
- [ ] 未登录访客仍能打开编辑器并复制公众号格式；文章、主题、设置和微信草稿 API 未登录返回 `401`。
- [ ] 未使用公网 HTTP 页面提交 AppSecret；正式环境使用 HTTPS，临时环境把密钥写入服务器 `.env.local`。
- [ ] 微信后台接口 IP 白名单已配置为实际出口公网 IP；不要把 `127.0.0.1` 当作白名单地址。
- [ ] 图片同步只接受公网 HTTPS JPG/PNG；发布前用 OSS 或其他图床地址完成一次草稿预览。
- [ ] 完成文章创建、刷新恢复、草稿同步失败重试、进入审核暂停自动同步和数据目录备份恢复验证。
