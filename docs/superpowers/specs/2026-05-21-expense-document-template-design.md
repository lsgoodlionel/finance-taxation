# 费用报销单与报销票据包模板设计

## 背景

当前单据中心已经能为 `expense` 类型事项自动生成两类单据：

- `expense_claim`：费用报销单
- `invoice_bundle`：报销票据包

但当前展示仍以通用元数据详情页为主，适合技术排查，不适合业务人员直接理解为“正式单据”。本次设计目标是把这两类单据升级为正式模板视图，并保持与现有事项、任务、税务、凭证链路一致。

## 目标

- 在单据中心为 `费用报销单` 和 `报销票据包` 提供正式模板展示
- 打印版与页面展示结构一致
- 继续复用现有 `businessEventId` 关联链路，不新增数据库字段
- 不修改后端 PDF 体系，仅增强前端单据展示和打印内容

## 非目标

- 本次不支持模板字段在线编辑
- 本次不增加审批签字位、电子签章、盖章流
- 本次不增加新的库表或单据强关系表
- 本次不处理其他单据类型的模板化改造

## 方案选型

### 方案 1：直接在 `DocumentsPage` 内联模板

优点：

- 改动最少
- 交付最快

缺点：

- 页面逻辑继续膨胀
- 后续补字段、补审批信息时维护成本高

### 方案 2：独立模板组件

优点：

- 模板结构清晰
- 页面展示与打印逻辑可以复用
- 后续扩展审批字段、签字位、附件分组时边界稳定

缺点：

- 比方案 1 多一层组件抽象

### 方案 3：后端生成 HTML/PDF 模板

优点：

- 更接近正式归档架构

缺点：

- 当前范围过大
- 会把这次需求拖入后端打印体系改造

### 结论

采用 **方案 2：独立模板组件**。

## 数据来源

模板不新增持久化字段，全部从现有对象聚合：

- `document`
- `attachments`
- `tasks`
- `taxItems`
- `vouchers`

关联规则继续使用 `businessEventId`：

- 单据关联任务：`task.businessEventId === document.businessEventId`
- 单据关联税务事项：`taxItem.businessEventId === document.businessEventId`
- 单据关联凭证：`voucher.businessEventId === document.businessEventId`

## 页面结构

### 1. 费用报销单模板

适用类型：`expense_claim`

字段结构：

- 单据标题：费用报销单
- 单据编号
- 关联事项编号
- 责任部门
- 当前状态
- 创建日期
- 归档日期（如有）
- 报销事由/说明
- 原始票据摘要
- 关联任务摘要
- 关联税务事项摘要
- 关联凭证摘要

展示重点：

- 业务人员能直接看出“这是一张报销单”
- 财务能直接看出“缺什么、后续流向哪里”

### 2. 报销票据包模板

适用类型：`invoice_bundle`

字段结构：

- 单据标题：报销票据包
- 单据编号
- 关联事项编号
- 责任部门
- 当前状态
- 创建日期
- 归档日期（如有）
- 票据包说明
- 附件清单
- 关联任务摘要
- 关联税务事项摘要
- 关联凭证摘要

展示重点：

- 把附件集合展示成“票据包”
- 明确该票据包支撑的是哪一笔费用事项

## 组件设计

新增组件：

- `apps/web/src/pages/document-templates/ExpenseClaimTemplate.tsx`
- `apps/web/src/pages/document-templates/InvoiceBundleTemplate.tsx`
- `apps/web/src/pages/document-templates/shared.tsx`

共享入参结构：

- `document`
- `attachments`
- `tasks`
- `taxItems`
- `vouchers`

共享职责：

- 模板头部
- 信息行渲染
- 关联对象摘要渲染
- 附件列表渲染

## 页面接入

`DocumentsPage` 调整规则：

- 如果 `documentType === "expense_claim"`，使用 `ExpenseClaimTemplate`
- 如果 `documentType === "invoice_bundle"`，使用 `InvoiceBundleTemplate`
- 其他类型继续保留当前通用详情页

## 打印策略

当前打印按钮保留在单据详情页。

打印逻辑调整为：

- 两类模板单据直接复用对应模板的展示结构
- 打印 HTML 与页面字段一致
- 其余单据仍使用现有通用打印结构

## 错误处理

- 如果没有附件，票据包模板明确显示“暂无附件”
- 如果没有关联任务、税务事项、凭证，明确显示“暂无关联…”
- 如果 `businessEventId` 为空，模板仍可展示，但关联信息区域显示空态

## 测试

新增测试覆盖：

- `expense_claim` 走模板路径
- `invoice_bundle` 走模板路径
- 其他单据类型继续走通用路径
- 打印能力识别正确
- 空附件、空关联对象时模板正常渲染

## 风险与边界

- 当前仍是弱关联模型，模板展示的是“按事项聚合”的结果，不是单据级强外键关系
- 如果后续引入单据与任务/税务/凭证的强关系表，模板入参结构需要切换到新关系源
- 当前不处理字段编辑，因此模板是“正式展示视图”，不是“填写表单”

## 实施顺序

1. 抽取模板共享渲染组件
2. 实现 `ExpenseClaimTemplate`
3. 实现 `InvoiceBundleTemplate`
4. 在 `DocumentsPage` 中按类型切换模板
5. 调整打印逻辑复用模板结构
6. 补测试并跑前端类型检查与仓库校验
