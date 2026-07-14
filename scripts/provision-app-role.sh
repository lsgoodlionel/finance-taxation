#!/usr/bin/env bash
# F8 生产激活：创建非属主运行时角色 finance_app（幂等）。
#
# 需要两个环境变量：
#   OWNER_DATABASE_URL  以数据库属主/超级用户连接的 URL（跑迁移用的那个）
#   APP_DB_PASSWORD     finance_app 角色的登录口令（存入密钥管理器，勿硬编码）
#
# 用法：
#   OWNER_DATABASE_URL=postgres://owner:...@host/db \
#   APP_DB_PASSWORD='<strong-secret>' \
#   scripts/provision-app-role.sh
set -euo pipefail

: "${OWNER_DATABASE_URL:?请设置 OWNER_DATABASE_URL（属主/超级用户连接）}"
: "${APP_DB_PASSWORD:?请设置 APP_DB_PASSWORD（finance_app 口令）}"

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
psql "$OWNER_DATABASE_URL" -v app_password="$APP_DB_PASSWORD" -f "$DIR/provision-app-role.sql"

cat <<'EONOTE'

finance_app 角色已就绪。启用租户隔离的剩余两步（部署配置）：
  1) 应用 DATABASE_URL 指向 finance_app（非属主）
  2) 设置环境变量 TENANT_RLS_ENABLED=true
两步同时满足后，migrations/039 的核心表 RLS 才对应用强制生效。
EONOTE
