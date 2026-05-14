# Business Events 与 Tasks 模型设计

## 1. 目标

`TASK-02-01` 与 `TASK-05-01` 的核心目标是把 V2 的业务主线统一到两个中心对象：

- `business_events`
- `tasks`

任何经营事件都要先成为 `business_event`，然后再带出：

- 子任务
- 单据
- 凭证
- 附件
- 税务事项
- 风险项

## 2. 为什么必须先做这两个对象

如果没有这两个对象，系统会继续停留在“页面表单 + 零散功能”的形态，无法成为老板可交办的财税执行系统。

V2 里：

- 老板交办的是“事项”，不是“单据”
- 财务执行的是“任务”，不是“页面按钮”

## 3. `business_events` 定义

`business_events` 表示企业里发生的一次经营事件。

示例：

- 签了一个销售合同
- 客户回款到账
- 报销了一笔差旅费
- 给员工发工资
- 购买了一台服务器
- 新立了一个研发项目

### 3.1 核心字段

- `id`
- `company_id`
- `type`
- `title`
- `description`
- `department`
- `owner_id`
- `occurred_on`
- `amount`
- `currency`
- `status`
- `source`
- `counterparty_id`
- `project_id`
- `created_at`
- `updated_at`

### 3.2 类型枚举

- `sales`
- `procurement`
- `expense`
- `payroll`
- `tax`
- `asset`
- `financing`
- `rnd`
- `general`

### 3.3 状态枚举

- `draft`
- `analyzed`
- `awaiting_documents`
- `awaiting_approval`
- `posted`
- `archived`
- `blocked`

## 4. `tasks` 定义

`tasks` 表示围绕经营事件展开的执行动作。

例如：

经营事件：
- “客户回款 50 万到账”

自动拆出的任务可能包括：

- 核对银行流水
- 关联销售合同
- 核对开票状态
- 判断收入确认状态
- 更新应收账款
- 生成会计分录建议

### 4.1 核心字段

- `id`
- `company_id`
- `business_event_id`
- `parent_task_id`
- `title`
- `description`
- `status`
- `priority`
- `owner_id`
- `due_at`
- `assignee_department`
- `source`
- `created_at`
- `updated_at`

### 4.2 状态枚举

- `not_started`
- `in_progress`
- `in_review`
- `blocked`
- `done`
- `cancelled`

### 4.3 优先级枚举

- `low`
- `medium`
- `high`
- `critical`

## 5. 关系模型

### 5.1 事件到任务

- 一个 `business_event` 对应多个 `tasks`
- 一个 `task` 可以有多个子任务

### 5.2 事件到业务对象

通过 `business_event_relations` 连接：

- 合同
- 发票
- 收付款
- 单据
- 附件
- 凭证
- 税务事项
- 项目

### 5.3 事件到风险

- 一个经营事项可产生多个风险事件
- 风险事件也要回指 `business_event`

## 6. 典型事件模板

### 6.1 销售合同签订

事件：

- 类型：`sales`

任务：

- 合同归档
- 开票计划确认
- 回款节点确认
- 收入确认规则判断

### 6.2 差旅报销

事件：

- 类型：`expense`

任务：

- 票据完整性检查
- 合规性判断
- 分录建议
- 税务影响提示

### 6.3 研发外包付款

事件：

- 类型：`rnd`

任务：

- 合同归档
- 发票催收
- 研发归集确认
- 辅助账记录
- 加计扣除资料检查

## 7. API 草案

### 7.1 事件

- `GET /api/events`
- `POST /api/events`
- `GET /api/events/:id`
- `PUT /api/events/:id`
- `POST /api/events/:id/analyze`
- `POST /api/events/:id/relations`

### 7.2 任务

- `GET /api/tasks`
- `POST /api/tasks`
- `GET /api/tasks/:id`
- `PUT /api/tasks/:id`
- `POST /api/tasks/:id/approve`
- `POST /api/tasks/:id/block`
- `POST /api/tasks/:id/checklist`

## 8. 前端视图要求

### 8.1 经营事项列表

- 类型
- 标题
- 金额
- 时间
- 部门
- 当前状态
- 风险数量
- 任务完成度

### 8.2 事项详情页

- 事项概览
- AI 分析摘要
- 任务树
- 关联合同 / 发票 / 回款 / 单据 / 凭证
- 风险列表
- 审计时间轴

### 8.3 任务中心

- 我的待办
- 部门待办
- 高优先级待办
- 阻塞任务
- 逾期任务

## 9. Sprint 0 结论

Sprint 0 的完成标准：

- `business_events` 模型一版落地
- `tasks` 模型一版落地
- 二者的关系模型明确
- API 草案明确
- 前端所需列表/详情字段明确
