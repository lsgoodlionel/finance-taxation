# 部署

前后端由**同一次 Release 产出**，带同一个版本号。

## 发版

```bash
git tag v1.0.0
git push origin v1.0.0
```

`.github/workflows/release.yml` 随后会：

1. 跑一遍 `npm run verify`（tag 可能被打在未经 CI 的提交上，发布不可逆，所以再验一次）
2. 构建两个镜像推到 GHCR，**用同一个 tag 注入版本号**
3. **冒烟**：起一套真栈，跑迁移、等健康检查、核对 `/health` 报出的版本与镜像标签一致
4. 冒烟通过才创建 GitHub Release

第 3 步失败时 Release 不会创建——避免把一个起不来的版本标成正式发布。

## 部署

```bash
export FT_VERSION=1.0.0            # 与 Release 版本号一致
export POSTGRES_PASSWORD=<强密码>
export JWT_SECRET=<32 字符以上的随机串>

docker compose -f docker-compose.prod.yml up -d
```

默认监听 `8080`（`FT_HTTP_PORT` 可改）。数据库不对外暴露端口，
要连它用 `docker compose exec db psql -U finance_taxation`。

### 确认这次部署成功

```bash
curl -s localhost:8080/api/health
# {"ok":true,"version":"1.0.0","db":{"ok":true,...},...}
```

`version` 要等于刚发的版本号。前端也会自己比对——**只升了一侧时页面顶部
会直接写出两个版本号**，不用靠猜。

## 数据库迁移

`migrate` 是**一次性服务**：跑完退出，成功之后 compose 才启动 `api`。

这样拆开是因为混在 API 启动命令里有三个问题：

- 多副本时每个副本都跑迁移
- 迁移失败表现为「容器起不来」，与代码起不来混在一起，难以分辨
- 每个副本启动都要等迁移走完

迁移本身还带 PostgreSQL advisory lock（`src/db/migrate.ts`），
即使有人绕过编排直接起多个副本，第二个也会**等待**而不是撞
`already exists` 崩溃。迁移是幂等的，重复部署不会重复执行。

迁移失败时：

```bash
docker compose -f docker-compose.prod.yml logs migrate   # 看是哪个 .sql 失败
# 修好之后单独重跑，不必动 api
docker compose -f docker-compose.prod.yml up migrate
```

## 回滚

镜像按版本号保留，回滚就是换个版本号再起一次：

```bash
export FT_VERSION=0.9.0
docker compose -f docker-compose.prod.yml up -d
```

**但迁移不会自动回退。** 本仓库的迁移都是加列、加表、放开约束，
旧代码读新库是安全的（新列不被旧代码引用）。
如果某次发布引入了破坏性迁移，回滚前要先确认这一点。

## 为什么同一个镜像能部署到任何环境

前端的 `VITE_API_BASE_URL` 留空，一律走同源的 `/api/*`，由 nginx 转到
api 容器。所以 Release 里的前端镜像就是要上线的那个，**不需要为不同环境
各构建一次**——那样「发布的产物」和「上线的产物」就不是同一个东西了。

需要改的只有运行时环境变量（数据库、密钥、端口）。
