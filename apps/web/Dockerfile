# Web 生产镜像（nginx 提供静态产物 + 反代 /api）。
#
# ## 产物是环境无关的
#
# `VITE_API_BASE_URL` 留空，前端一律走同源的 `/api/*`，由 nginx 转到 api 容器。
# 所以**同一个镜像可以部署到任何环境**，不需要为测试/生产各构建一次——
# 这是「统一到 Releases」能成立的前提：Release 里的镜像就是要上线的那个。

FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/domain-model/package.json ./packages/domain-model/
COPY apps/web/package.json ./apps/web/

RUN npm ci --workspaces --include-workspace-root

COPY packages/ ./packages/
COPY apps/web/ ./apps/web/

# 发布版本号。与 API 镜像用**同一个 git tag**，前端据此在运行时比对
# 自己与 /health 报出的后端版本，漂移时给用户一句能照着做的提示。
ARG APP_VERSION=dev
ENV VITE_APP_VERSION=${APP_VERSION}

WORKDIR /app/apps/web
COPY apps/web/.env.docker .env
RUN npx vite build

# ── 运行阶段 ────────────────────────────────────────────────────────────
FROM nginx:stable-alpine
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

# 让编排器能区分「容器起来了」和「真的能服务」。
# 没有它时，滚动发布会在 nginx 还没就绪时就把流量切过来。
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
