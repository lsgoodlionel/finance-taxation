# Backend Scaffold

这个目录用于承接从前端高保真原型升级到真实业务系统后的后端实现。

当前先落地的是后端边界和数据库模型设计，后续会按以下顺序继续补全：

1. 认证与企业隔离
2. 单据、附件与分析结果持久化
3. 台账、税务事项与打印导出接口
4. 权限、审计日志与勾稽校验服务

## 目录说明

- `src/config`
  - 配置加载、环境变量、企业级开关
- `src/routes`
  - HTTP 路由入口
- `src/middleware`
  - 认证、鉴权、审计、错误处理
- `src/modules`
  - 企业、用户、单据、附件、税务、台账等业务模块
- `src/services`
  - 分析服务、打印导出服务、勾稽校验服务
- `src/db`
  - 数据库迁移、初始化脚本、SQL 模型

## 建议技术路线

- 后端：Node.js + TypeScript + Fastify / Express
- 数据库：PostgreSQL
- 文件存储：本地磁盘开发环境 + 对象存储生产环境
- 鉴权：JWT + Refresh Token + 企业隔离
- 审计：关键动作写入 `audit_logs`

## 已落地设计文件

- [数据库模型](./src/db/schema.sql)
- [后端与 API 设计](../docs/backend-architecture.md)
