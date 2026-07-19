#!/usr/bin/env bash

set -eu

project_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$project_root"
mkdir -p "$project_root/data"

if [ ! -f "$project_root/apps/server/dist/index.js" ] || [ ! -f "$project_root/apps/web/dist/index.html" ]; then
  echo "尚未找到本机构建产物，请先运行 pnpm package:local。"
  exit 1
fi

export HOST="${HOST:-127.0.0.1}"
export PORT="${PORT:-4318}"
export DATABASE_PATH="${DATABASE_PATH:-$project_root/data/competition.sqlite}"
export WEB_ORIGIN="${WEB_ORIGIN:-http://127.0.0.1:4173}"

node apps/server/dist/index.js &
server_pid=$!
pnpm --filter @xinxisuyang/web preview &
web_pid=$!
stopping=0

stop_services() {
  stopping=1
  kill "$server_pid" "$web_pid" 2>/dev/null || true
  wait "$server_pid" "$web_pid" 2>/dev/null || true
}

trap stop_services EXIT INT TERM

echo "赛事指挥台: http://127.0.0.1:4173"
echo "按 Control-C 安全退出本机服务。"

while kill -0 "$server_pid" 2>/dev/null && kill -0 "$web_pid" 2>/dev/null; do
  sleep 2
done

if [ "$stopping" -eq 1 ]; then
  exit 0
fi

echo "本机服务意外退出，请查看上方日志。"
exit 1
