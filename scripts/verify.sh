#!/bin/sh
# verify 一次性服务入口：测试 -> 构建 -> HTTP 冒烟。
# 任一步失败立即以非零退出码结束（set -e）。
set -eu

echo "==> [1/3] 运行单元测试"
npx vitest run

echo "==> [2/3] 类型检查与静态构建"
npm run build

echo "==> [3/3] HTTP 冒烟"
node scripts/smoke.mjs

echo "==> verify 全部通过"
