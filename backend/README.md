# Backend Scaffold

这个目录用于承接从前端高保真原型升级到真实业务系统后的后端实现。

当前状态不是纯设计稿，已经具备可运行的本地后端骨架，并打通了一条最小闭环：

1. 演示登录与 `Bearer` 鉴权
2. 企业信息读取与更新
3. 单据列表、详情读取与新增
4. 附件元数据持久化、本地文件落盘与下载
5. 会话持久化、登出撤销与密码摘要校验
6. 台账、纳税人口径、税务事项查询
7. 勾稽校验结果读取与触发
8. 打印 / PDF 任务读取与创建

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
- [阶段 6/7/8/5/9 联调记录](../docs/backend-phase-6-9-validation.md)

## 当前已开放接口

### 基础

- `GET /health`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/me`
- `GET|PUT /api/company/profile`
- `GET|POST /api/documents`
- `GET /api/documents/:id`
- `POST /api/attachments/upload`
- `GET /api/attachments/:id/download`

### 台账与账簿

- `GET /api/ledger/general`
- `GET /api/ledger/detail`
- `GET /api/ledger/account-balance`
- `GET /api/journals/bank`
- `GET /api/journals/cash`

### 纳税人口径与税务事项

- `GET|POST /api/company/taxpayer-profiles`
- `GET /api/tax/items`

### 勾稽校验

- `POST /api/reconciliation/run`
- `GET /api/reconciliation/results`

### 打印与 PDF

- `GET|POST /api/print/jobs`

## 当前实现边界

- 数据持久化当前使用 `backend/data/*.json`
- 认证当前使用本地会话表和密码摘要，不是正式 JWT / Refresh Token 体系
- 附件上传当前使用 JSON + 本地磁盘落盘，不是 multipart 和对象存储
- 打印 / PDF 当前是任务模型与状态流，尚未接入真实渲染引擎
- 勾稽校验当前是规则入口和结果模型，尚未接入完整业务流水
