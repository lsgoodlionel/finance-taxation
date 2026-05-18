FROM node:22-alpine AS base
WORKDIR /app

# 安装所有 workspace 依赖
COPY package.json package-lock.json ./
COPY tsconfig.base.json ./
COPY packages/domain-model/package.json ./packages/domain-model/
COPY apps/api/package.json ./apps/api/

RUN npm ci --workspaces --include-workspace-root

# 复制源码
COPY packages/ ./packages/
COPY apps/api/ ./apps/api/
COPY migrations/ ./migrations/

WORKDIR /app/apps/api

# 执行数据库迁移 + 启动 API
CMD ["sh", "-c", "npx tsx src/db/migrate.ts && npx tsx src/main.ts"]
