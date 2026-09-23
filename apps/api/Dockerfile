# API 生产镜像。
#
# ## 与改造前的区别
#
# 改造前：单阶段，运行时用 `npx tsx` 现场转译 TypeScript，启动命令是
# `migrate && main`。三个问题：
#
# 1. 每次冷启动都要转译整个依赖树——慢，且 `tsx` 是 devDependency，
#    生产镜像因此带着全部 devDeps 和源码
# 2. **迁移与启动耦合**：多副本部署时每个副本都跑迁移。
#    迁移侧已加 advisory lock（见 src/db/migrate.ts），但更好的做法是
#    让编排器把迁移作为一次性任务跑在前面——镜像同时提供两个入口
# 3. 没有 HEALTHCHECK，编排器不知道容器何时真正就绪

# ── 构建阶段 ────────────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/domain-model/package.json ./packages/domain-model/
COPY apps/api/package.json ./apps/api/

RUN npm ci --workspaces --include-workspace-root

COPY packages/ ./packages/
COPY apps/api/ ./apps/api/

# tsc 编译成 dist/。产物是普通 JS，运行时不再需要 tsx。
#
# `packages/domain-model` 是**纯类型包**：类型在编译后全部消失，
# 所以产物在运行时完全不加载它——不必把它打进运行镜像，
# 也不依赖 Node 的 type stripping 实验特性。
RUN npm run build --workspace @finance-taxation/api

# ── 生产依赖阶段 ────────────────────────────────────────────────────────
# 单独一层装 prod deps：与上面的完整依赖分开，避免 devDeps 混进运行时。
FROM node:22-alpine AS deps
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/domain-model/package.json ./packages/domain-model/
COPY apps/api/package.json ./apps/api/

RUN npm ci --workspaces --include-workspace-root --omit=dev

# ── 运行阶段 ────────────────────────────────────────────────────────────
FROM node:22-alpine AS runtime
WORKDIR /app

# 发布版本号。由 Release 流水线用 git tag 注入，/health 会把它报出来——
# 部署后排查问题的第一个问题「线上是哪个版本」靠它回答。
ARG APP_VERSION=dev
ENV APP_VERSION=${APP_VERSION}
ENV NODE_ENV=production

RUN apk add --no-cache wget

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY apps/api/package.json ./apps/api/
COPY package.json ./

# 迁移 SQL。`dist/db/migrate.js` 按 `../../../../migrations/` 定位它，
# 从 /app/apps/api/dist/db/ 出发正好是 /app/migrations/ —— 目录层级不能变。
COPY migrations/ ./migrations/

# 非 root 运行。node 镜像自带 uid 1000 的 node 用户。
USER node

EXPOSE 3100

# 就绪探针查的是 /health，它同时验证数据库连通——
# 只验进程活着的探针会让一个连不上库的容器被当成健康的。
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT:-3100}/health >/dev/null || exit 1

# 默认只启动服务，**不跑迁移**。
#
# 迁移改由编排器作为一次性任务先跑（见 docker-compose.prod.yml 的
# `migrate` 服务），原因：
#   - 迁移失败要能单独看到、单独重试，而不是表现为「容器起不来」
#   - 多副本时不必依赖锁去化解竞争（锁仍在，是第二道保险）
#   - 服务启动不必等迁移，冷启动更快
#
# 需要单容器一把梭时，显式覆盖命令即可：
#   docker run … node apps/api/dist/db/migrate.js && node apps/api/dist/main.js
CMD ["node", "apps/api/dist/main.js"]
