#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "==> 检查 Node.js"
if ! command -v node >/dev/null 2>&1; then
  echo "未找到 node。请先安装 Node.js 18 或更高版本。" >&2
  exit 1
fi

NODE_MAJOR="$(node -p "Number(process.versions.node.split('.')[0])")"
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "当前 Node.js 版本过低：$(node -v)。请升级到 Node.js 18 或更高版本。" >&2
  exit 1
fi
echo "Node.js: $(node -v)"

echo "==> 准备 .env.local"
if [ -f ".env.local" ]; then
  echo ".env.local 已存在，跳过复制。"
else
  cp examples/.env.local.example .env.local
  echo "已从 examples/.env.local.example 创建 .env.local。"
  echo "请把 .env.local 里的 FEISHU_WEBHOOK_URL 替换成真实飞书 webhook。"
fi

echo "==> 检查脚本语法"
node --check skills/feishu-automation-reporter/scripts/push-ai-daily-to-feishu.mjs
node --check skills/feishu-automation-reporter/scripts/push-gba-events-to-feishu.mjs

echo "==> 运行 dry-run 验证"
FEISHU_DRY_RUN=1 FEISHU_WEBHOOK_URL=https://example.com \
  node skills/feishu-automation-reporter/scripts/push-ai-daily-to-feishu.mjs \
  examples/ai-daily-example.md >/tmp/codex-feishu-ai-daily-card.json

FEISHU_DRY_RUN=1 FEISHU_WEBHOOK_URL=https://example.com \
  node skills/feishu-automation-reporter/scripts/push-gba-events-to-feishu.mjs \
  examples/gba-events-example.md >/tmp/codex-feishu-gba-events-card.json

echo "已生成 dry-run 输出："
echo "- /tmp/codex-feishu-ai-daily-card.json"
echo "- /tmp/codex-feishu-gba-events-card.json"
echo
echo "配置完成。下一步：编辑 .env.local，然后运行真实推送命令。"
