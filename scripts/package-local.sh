#!/usr/bin/env bash

set -eu

project_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$project_root"

bash scripts/check-environment.sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
pnpm build

echo "本机构建完成。"
echo "管理后台: $project_root/apps/web/dist"
echo "本机服务: $project_root/apps/server/dist"
echo "Chrome 扩展: $project_root/apps/extension/dist"
echo "运行命令: pnpm start:local"
