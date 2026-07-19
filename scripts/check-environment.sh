#!/usr/bin/env bash

set -eu

project_root="$(cd "$(dirname "$0")/.." && pwd)"
chrome_binary="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
required_node_major=24
required_pnpm_major=11
failed=0

check_command() {
  command_name="$1"
  if command -v "$command_name" >/dev/null 2>&1; then
    command_path="$(command -v "$command_name")"
    echo "[通过] $command_name: $command_path"
  else
    echo "[缺失] $command_name"
    failed=1
  fi
}

check_port() {
  port="$1"
  label="$2"
  if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    echo "[占用] $label 端口 $port（启动前请确认是否为本系统进程）"
  else
    echo "[空闲] $label 端口 $port"
  fi
}

echo "项目目录: $project_root"
check_command node
check_command pnpm
check_command security
check_command lsof

if command -v node >/dev/null 2>&1; then
  node_version="$(node --version)"
  node_major="${node_version#v}"
  node_major="${node_major%%.*}"
  echo "Node.js: $node_version"
  if [ "$node_major" -lt "$required_node_major" ]; then
    echo "[不通过] 需要 Node.js $required_node_major 或更高版本"
    failed=1
  fi
fi

if command -v pnpm >/dev/null 2>&1; then
  pnpm_version="$(pnpm --version)"
  pnpm_major="${pnpm_version%%.*}"
  echo "pnpm: $pnpm_version"
  if [ "$pnpm_major" -lt "$required_pnpm_major" ]; then
    echo "[不通过] 需要 pnpm $required_pnpm_major 或更高版本"
    failed=1
  fi
fi

if [ -x "$chrome_binary" ]; then
  chrome_version="$("$chrome_binary" --version)"
  echo "[通过] Google Chrome: $chrome_version"
else
  echo "[缺失] Google Chrome: $chrome_binary"
  failed=1
fi

check_port 4318 "本机 API"
check_port 4173 "管理后台"

if [ -d "$project_root/data" ]; then
  echo "[存在] 数据目录: $project_root/data"
else
  echo "[待创建] 数据目录: $project_root/data"
fi

if [ -d "$project_root/apps/extension/dist" ]; then
  echo "[存在] Chrome 扩展构建目录: $project_root/apps/extension/dist"
else
  echo "[待构建] Chrome 扩展目录；运行 pnpm package:local 后生成"
fi

if [ "$failed" -ne 0 ]; then
  echo "环境检查未通过。"
  exit 1
fi

echo "环境检查通过。"
