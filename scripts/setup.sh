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
USER_CONFIG="${XDG_CONFIG_HOME:-$HOME/.config}/codex-feishu-automation-kit/tech-events-assistant.local.json"
if [ -f "$USER_CONFIG" ]; then
  echo "用户级配置已存在：$USER_CONFIG"
elif [ -f "tech-events-assistant.local.json" ]; then
  echo "当前工作区 tech-events-assistant.local.json 已存在，会覆盖用户级配置。"
else
  echo "未创建私密配置。需要推送时请运行 npm run gba，在菜单里配置，默认写入：$USER_CONFIG"
fi

echo "==> 检查脚本语法"
npm run check

echo "==> 运行测试"
npm test

echo "==> 运行推送格式检查"
npm run gba -- --dry-run >/tmp/codex-gba-dry-run.txt

echo "已生成推送格式检查输出：/tmp/codex-gba-dry-run.txt"
echo
echo "配置完成。"
echo "同一台电脑、同一个 macOS 用户只需配置一次密钥。"
echo "换项目目录或 worktree 不需要重新填密钥。"
echo "换 Codex 登录账号后，已安排任务需要在新账号里重新导入 Prompt，但密钥不用重新填写。"
if [[ "$PWD" == *"/.codex/worktrees/"* ]]; then
  echo "当前目录位于 Codex 管理的 worktree，不建议把已安排任务长期绑定在这里；密钥仍然可以正常使用。"
fi
