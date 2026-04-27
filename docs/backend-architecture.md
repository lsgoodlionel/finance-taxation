# 后端与数据库设计

## 目标

将当前前端高保真原型升级为可落地的企业级财税系统，重点解决：

- 企业级多租户隔离
- 用户与角色权限
- 单据、附件、分析结果持久化
- 台账与凭证过账
- 税务事项管理
- 审计日志与勾稽校验

## 建议后端模块

### 1. 企业模块

- 企业基本信息维护
- 纳税人身份配置
- 税制切换记录

### 2. 用户与权限模块

- 登录 / 登出 / Token 刷新
- 用户、角色、权限点
- 菜单权限、按钮权限、数据权限

### 3. 单据与归档模块

- 单据新增、编辑、删除、版本化
- 附件上传、补传、绑定、预览
- 单据总库多条件查询
- 归档目录与导出

### 4. AI 分析模块

- 行为录入分析
- 可见过程摘要存储
- 规则初判、网络参考、本地模型结果快照
- 分析结果到单据生成的锁定执行

### 5. 报表与台账模块

- 凭证
- 总账
- 明细账
- 科目余额表
- 银行日记账
- 现金日记账
- 月报、季报、年报

### 6. 税务事项模块

- 增值税及附加
- 企业所得税
- 个人所得税
- 印花税
- 研发加计扣除
- 汇算清缴备查

### 7. 勾稽校验模块

- 合同、开票、回款、收入确认
- 工资、个税、社保、公积金
- 研发项目、辅助账、汇算优惠口径

## 关键 API 草案

### 认证

- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET /api/me`

### 企业

- `GET /api/company/profile`
- `PUT /api/company/profile`
- `GET /api/company/taxpayer-profiles`
- `POST /api/company/taxpayer-profiles`

### 单据

- `GET /api/documents`
- `POST /api/documents`
- `GET /api/documents/:id`
- `PUT /api/documents/:id`
- `POST /api/documents/:id/version`

### 附件

- `POST /api/attachments/upload`
- `POST /api/documents/:id/attachments`
- `GET /api/attachments/:id`

### AI 分析

- `POST /api/analysis/behavior`
- `GET /api/analysis/:id`
- `POST /api/analysis/:id/generate-documents`

### 报表与台账

- `GET /api/reports/balance-sheet`
- `GET /api/reports/income-statement`
- `GET /api/reports/cashflow`
- `GET /api/ledger/general`
- `GET /api/ledger/detail`
- `GET /api/ledger/account-balance`
- `GET /api/journals/bank`
- `GET /api/journals/cash`

### 税务

- `GET /api/tax/items`
- `POST /api/tax/items`
- `GET /api/tax/reports/vat`
- `GET /api/tax/reports/cit`
- `GET /api/tax/reports/iit`

### 勾稽与审计

- `POST /api/reconciliation/run`
- `GET /api/reconciliation/results`
- `GET /api/audit-logs`

## 数据边界约定

- 前端负责录入、展示、筛选、分析过程可视化
- 后端负责权限、企业隔离、持久化、勾稽校验、打印导出
- 数据库负责企业主数据、业务单据、分析结果、台账、税务事项、审计日志

## 下一步建议

1. 选定后端技术栈并初始化项目
2. 按 `schema.sql` 建库
3. 优先打通最小闭环：
   - 登录
   - 企业信息
   - 单据新增
   - 附件上传
   - 单据查询
   - 单据详情
