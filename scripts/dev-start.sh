#!/usr/bin/env bash

set -eu

project_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$project_root"

bash scripts/check-environment.sh
mkdir -p "$project_root/data"

export HOST="${HOST:-127.0.0.1}"
export PORT="${PORT:-4318}"
export DATABASE_PATH="${DATABASE_PATH:-$project_root/data/competition.sqlite}"
export WEB_ORIGIN="${WEB_ORIGIN:-http://127.0.0.1:4173}"

echo "开发模式将在 http://127.0.0.1:4173 启动。"
echo "API 仅监听 http://127.0.0.1:4318。"
exec pnpm dev
