FROM node:22-alpine AS build
WORKDIR /app

# 安装所有 workspace 依赖
COPY package.json package-lock.json ./
COPY packages/domain-model/package.json ./packages/domain-model/
COPY apps/web/package.json ./apps/web/

RUN npm ci --workspaces --include-workspace-root

# 复制源码并构建
COPY packages/ ./packages/
COPY apps/web/ ./apps/web/

WORKDIR /app/apps/web
COPY apps/web/.env.docker .env
RUN npx vite build

# 生产镜像：nginx 静态服务
FROM nginx:stable-alpine
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
