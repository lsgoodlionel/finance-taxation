# RBAC 与组织模型设计

## 1. 目标

`TASK-01-01` 的目标是先锁定 V2 正式权限模型，而不是继续在演示级账号上追加逻辑。

本设计覆盖：

- 用户
- 角色
- 权限点
- 部门
- 数据域
- 菜单映射

## 2. 基本原则

- 权限必须区分“功能权限”和“数据权限”
- 董事长、财务负责人、会计、出纳、人事、行政、研发负责人、外部顾问必须有不同边界
- AI 输出不能绕过权限
- 所有重要动作必须有审计日志

## 3. 角色建议

### 3.1 系统级角色

- `super_admin`
  - 平台维护，仅限部署与系统运维

### 3.2 企业级角色

- `chairman`
  - 查看全局驾驶舱
  - 审批高风险事项
  - 查看财税总体风险
- `finance_director`
  - 管理财务与税务主流程
  - 审核分录、税务资料、月结事项
- `accountant`
  - 处理单据、凭证、报表、归档
- `cashier`
  - 处理收付款、银行、现金
- `hr_operator`
  - 处理工资、个税、社保、公积金协同资料
- `admin_operator`
  - 处理办公费用、采购、资产、行政资料
- `rnd_manager`
  - 处理研发项目、研发费用归集、补贴资料
- `sales_manager`
  - 处理销售合同、开票、回款事项
- `external_advisor`
  - 受控查看、评论、复核，不应拥有直接业务写权限
- `auditor`
  - 查看审计资料、留档包、日志，不应拥有业务改写权限

## 4. 权限点目录

建议首批权限点：

- `dashboard.view`
- `events.view`
- `events.create`
- `events.assign`
- `tasks.view`
- `tasks.manage`
- `documents.view`
- `documents.manage`
- `ledger.view`
- `ledger.post`
- `tax.view`
- `tax.manage`
- `rnd.view`
- `rnd.manage`
- `risk.view`
- `risk.manage`
- `settings.manage`

## 5. 数据权限层级

### 5.1 范围枚举

- `global`
- `company`
- `department`
- `self`
- `custom`

### 5.2 示例

- 董事长：
  - 功能：大部分只读 + 审批
  - 数据范围：`company`
- 财务负责人：
  - 功能：财税模块全写
  - 数据范围：`company`
- 会计：
  - 功能：单据、凭证、归档、报表
  - 数据范围：`company`
- 出纳：
  - 功能：银行、现金、付款相关
  - 数据范围：`company`
- 销售经理：
  - 功能：销售合同、开票、回款事项
  - 数据范围：`department`
- 外部顾问：
  - 功能：指定模块只读 + 评论
  - 数据范围：`custom`

## 6. 组织模型

基础对象：

- `companies`
- `departments`
- `users`
- `roles`
- `user_roles`

部门建议：

- 董事会 / 总经办
- 财务部
- 行政部
- 人力资源部
- 销售部
- 研发部
- 运营部

## 7. 菜单映射

菜单不应写死在前端，而应由后端返回可见菜单树。

菜单首批建议：

- `dashboard/chairman`
- `dashboard/finance`
- `events`
- `tasks`
- `documents`
- `ledger`
- `reports`
- `tax`
- `rnd`
- `risk`
- `archive`
- `settings`

每个菜单都必须绑定 `permissionKey`。

## 8. API 草案

- `GET /api/access/me`
- `GET /api/access/menu`
- `GET /api/roles`
- `POST /api/roles`
- `GET /api/permissions`
- `GET /api/departments`
- `POST /api/departments`
- `GET /api/users`
- `POST /api/users`

## 9. 审计要求

以下操作必须写审计日志：

- 登录 / 登出
- 角色变更
- 权限变更
- 任务分派
- 任务审批
- 凭证过账
- 税务批次确认
- 高风险事项关闭

## 10. Sprint 0 结论

`TASK-01-01` 在 Sprint 0 的完成标准不是完整代码，而是：

- 角色目录明确
- 权限点目录明确
- 数据域模型明确
- 菜单映射规则明确
- API 草案明确
