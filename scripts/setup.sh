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

echo "==> 检查本地私密配置"
if [ -f "tech-events-assistant.local.json" ]; then
  echo "tech-events-assistant.local.json 已存在，后续推送会优先读取它。"
else
  echo "未创建私密配置。需要推送时请运行 npm run gba，在菜单里配置。"
fi

echo "==> 检查脚本语法"
npm run check

echo "==> 运行测试"
npm test

echo "==> 运行推送格式检查"
npm run gba -- --dry-run >/tmp/codex-gba-dry-run.txt

echo "已生成推送格式检查输出：/tmp/codex-gba-dry-run.txt"
echo
echo "配置完成。下一步：运行 npm run gba，在菜单里配置飞书 webhook 或 Server 酱 SendKey。"
