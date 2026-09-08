#!/usr/bin/env bash
set -Eeuo pipefail

# One-command Docker deployment for Open WeChat Editor.
# Safe defaults keep credentials on the server and outside Git.

REPO_URL="${REPO_URL:-https://github.com/helloLeila/codex-feishu-automation-kit.git}"
BRANCH="${BRANCH:-codex/test-local-commit-flow}"
DEPLOY_DIR="${DEPLOY_DIR:-/opt/open-wechat-editor}"
PORT="${PORT:-80}"
ENV_FILE="${DEPLOY_DIR}/.env.local"

log() { printf '\n==> %s\n' "$*"; }
fail() { printf '错误：%s\n' "$*" >&2; exit 1; }

require_command() {
  command -v "$1" >/dev/null 2>&1 || fail "未找到 $1，请先安装后重试。"
}

ensure_docker() {
  require_command git
  require_command docker
  docker compose version >/dev/null 2>&1 || fail '当前 Docker 没有 Compose 插件，请安装 docker compose。'
}

random_secret() {
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex 32
  else
    od -An -N32 -tx1 /dev/urandom | tr -d ' \n'
  fi
}

prompt_secret() {
  local label="$1" value
  if [[ -r /dev/tty ]]; then
    read -r -s -p "$label" value < /dev/tty
  else
    read -r -s -p "$label" value
  fi
  printf '\n' >&2
  printf '%s' "$value"
}

prompt_value() {
  local label="$1" value
  if [[ -r /dev/tty ]]; then
    read -r -p "$label" value < /dev/tty
  else
    read -r -p "$label" value
  fi
  printf '%s' "$value"
}

write_env_file() {
  if [[ -f "$ENV_FILE" ]]; then
    chmod 600 "$ENV_FILE"
    return
  fi

  if [[ ! -r /dev/tty && ! -t 0 ]]; then
    [[ -n "${EDITOR_AUTH_PASSWORD:-}" ]] || fail "未找到 $ENV_FILE。非交互执行时请预先设置 EDITOR_AUTH_PASSWORD。"
    [[ -n "${EDITOR_SESSION_SECRET:-}" ]] || EDITOR_SESSION_SECRET="$(random_secret)"
  else
    printf '首次部署需要生成本机登录配置。\n'
    EDITOR_AUTH_USER="$(prompt_value '编辑器登录用户名 [editor]: ')"
    EDITOR_AUTH_USER="${EDITOR_AUTH_USER:-editor}"
    EDITOR_AUTH_PASSWORD="$(prompt_secret '编辑器登录密码（至少 16 位）： ')"
    [[ ${#EDITOR_AUTH_PASSWORD} -ge 16 ]] || fail '编辑器登录密码至少需要 16 位。'
    WECHAT_APP_ID="$(prompt_value '微信公众号 AppID（可留空，之后仍可使用复制模式）： ')"
    WECHAT_APP_SECRET="$(prompt_secret '微信公众号 AppSecret（可留空）： ')"
  fi

  umask 077
  cat > "$ENV_FILE" <<EOF
PORT=${PORT}
NODE_BASE_IMAGE=${NODE_BASE_IMAGE:-node:20-bookworm-slim}
WECHAT_APP_ID=${WECHAT_APP_ID:-}
WECHAT_APP_SECRET=${WECHAT_APP_SECRET:-}
WECHAT_API_BASE_URL=${WECHAT_API_BASE_URL:-https://api.weixin.qq.com}
WECHAT_DEFAULT_AUTHOR=${WECHAT_DEFAULT_AUTHOR:-}
WECHAT_AUTO_SYNC=${WECHAT_AUTO_SYNC:-false}
EDITOR_AUTH_ENABLED=true
EDITOR_AUTH_USER=${EDITOR_AUTH_USER:-editor}
EDITOR_AUTH_PASSWORD=${EDITOR_AUTH_PASSWORD:-}
EDITOR_SESSION_SECRET=${EDITOR_SESSION_SECRET:-$(random_secret)}
OPEN_WECHAT_EDITOR_CONFIG_DIR=/data/config
EOF
  chmod 600 "$ENV_FILE"
}

sync_source() {
  mkdir -p "$(dirname "$DEPLOY_DIR")"
  if [[ -d "$DEPLOY_DIR/.git" ]]; then
    git -C "$DEPLOY_DIR" fetch origin "$BRANCH"
    git -C "$DEPLOY_DIR" checkout "$BRANCH"
    git -C "$DEPLOY_DIR" pull --ff-only origin "$BRANCH"
  elif [[ -e "$DEPLOY_DIR" && -n "$(find "$DEPLOY_DIR" -mindepth 1 -maxdepth 1 -print -quit)" ]]; then
    fail "$DEPLOY_DIR 已存在且不是空 Git 仓库，请备份后清理目录，或设置 DEPLOY_DIR。"
  else
    git clone --branch "$BRANCH" "$REPO_URL" "$DEPLOY_DIR"
  fi
}

start_stack() {
  cd "$DEPLOY_DIR"
  mkdir -p data
  chmod 700 data
  docker compose --env-file "$ENV_FILE" up --build -d
}

health_check() {
  local url="http://127.0.0.1:${PORT}/api/health"
  for _ in {1..20}; do
    if curl -fsS "$url" >/dev/null 2>&1; then
      printf '\n部署成功。\n访问地址：http://%s/\n健康检查：%s\n' "${PUBLIC_IP:-服务器公网IP}" "${PUBLIC_IP:-127.0.0.1}:${PORT}/api/health"
      return 0
    fi
    sleep 2
  done
  docker compose --env-file "$ENV_FILE" ps || true
  docker compose --env-file "$ENV_FILE" logs --tail=80 editor || true
  fail "健康检查失败，请查看上面的容器日志。"
}

main() {
  log '检查服务器环境'
  ensure_docker
  require_command curl

  log '拉取或更新项目代码'
  sync_source

  log '生成服务器本地配置'
  write_env_file

  log '构建并启动 Docker 容器'
  start_stack

  log '执行健康检查'
  health_check
}

main "$@"
