# V3 Risk / Audit Workbench Design

日期：2026-05-27

## 1. 目标

将 `RiskPage` 和 `AuditPage` 从“工程态工具页”重构为同一套 V3 工作台体系下的两张高频业务页：

- `RiskPage` 成为风险闭环工作台，主路径是“发现风险 -> 回上游整改 -> 关闭风险 -> 复盘留痕”
- `AuditPage` 成为审计追溯台，主路径是“检索日志 -> 展开详情 -> 定位对象 -> 回跳来源”

本次重构的重点顺序为：

1. 先让风险整改闭环更清晰
2. 再让审计检索与追溯能力更稳定

## 2. 范围

本设计覆盖：

- `apps/web/src/pages/RiskPage.tsx`
- `apps/web/src/pages/AuditPage.tsx`
- 两页对应的 V3 壳组件和子组件拆分
- 两页的 URL 可恢复状态设计
- 两页之间的 drilldown 承接方式
- focused test 设计

本设计不覆盖：

- 后端 API 变更
- 领域对象模型变更
- 风险规则、审计规则或业务口径变更
- 新增底层状态机

## 3. 约束

- 保持现有后端 API 不变
- 保持现有 `location.state` drilldown 语义不变
- 保持现有对象链和跳转规则不变
- 只做前端结构、交互、展示层和可恢复状态重构
- 优先复用现有 V3 设计系统与共享 UI，不重新发明页面框架

## 4. 设计原则

- `Risk-first`：先突出风险发现、整改入口、关闭动作和复盘链路
- `Summary-first`：页面先给上下文、数量、建议动作，再给列表和详情
- `Context-visible`：用户必须一眼知道“我从哪里来、当前看哪条对象、下一步做什么”
- `URL-state-first`：页面停留状态进入 query params，支持刷新恢复与链接分享
- `Progressive disclosure`：列表负责概览，详情区负责链路、动作、历史和证据
- `Shared shell, split responsibility`：两页共享壳风格，但职责分离，不互相抢入口

## 5. 页面职责

### 5.1 RiskPage

`RiskPage` 负责一条明确的业务闭环：

1. 查看当前范围内的风险发现
2. 选中一条风险后理解其关联对象链
3. 找到应回跳整改的上游页面
4. 完成关闭并记录复盘
5. 需要证据时跳到 `AuditPage`

`RiskPage` 不负责：

- 替代上游页面直接修复原始业务资料
- 提供全量审计检索能力
- 重新定义风险规则

### 5.2 AuditPage

`AuditPage` 负责稳定的追溯和证据查看：

1. 按资源类型、对象 ID、时间范围查询日志
2. 展开单条日志查看 changes
3. 跳回来源对象或风险上下文
4. 承接从 `RiskPage` 带来的对象上下文

`AuditPage` 不负责：

- 作为风险整改主入口
- 承担风险关闭动作
- 重写当前资源定位规则

## 6. 页面骨架

### 6.1 RiskPage 骨架

页面拆成四区：

1. `RiskWorkbenchHeader`
   - 当前 drilldown 上下文
   - 风险总数、未关闭数、当前范围
   - 主操作按钮
2. `RiskFindingsListPanel`
   - `scope filter`
   - 风险列表
   - 严重级别、状态、选中态
3. `RiskResolutionWorkbench`
   - 选中风险摘要
   - 关联事项与对象链
   - 回跳整改入口
   - 关闭动作和复盘输入
4. `RiskClosureTimeline`
   - 历史关闭记录
   - 复盘说明
   - 审计追溯入口

### 6.2 AuditPage 骨架

页面拆成四区：

1. `AuditWorkbenchHeader`
   - 当前上下文
   - 命中记录总数
   - 返回风险页或来源对象的快捷入口
2. `AuditFiltersBar`
   - `resourceType`
   - `resourceId`
   - `from`
   - `to`
   - 查询动作
3. `AuditLogTablePanel`
   - 结果列表
   - 行展开
   - 选中高亮
   - 分页
4. `AuditDetailPanel`
   - 单条日志详情
   - changes 展示
   - 对象跳转
   - 当前上下文说明

## 7. 状态设计

### 7.1 Drilldown state 的角色

保留现有 `normalizeDrilldownState(location.state)` 及相关解析函数，继续负责入口语义：

- 用户从哪一页进入
- 当前是否带有 `businessEventId`
- 当前是否带有 `riskFindingId`
- 当前是否带有 `contractId`
- 当前是否带有可解析的审计对象上下文

进入页面后，drilldown state 只负责：

- 生成上下文 banner
- 推导默认筛选范围
- 推导默认选中对象

### 7.2 URL params 的角色

URL query params 负责停留状态和可恢复状态。

`RiskPage` 建议写入：

- `scope`
- `event`
- `finding`
- `view`，取值为 `open | closed | all`

`AuditPage` 建议写入：

- `resourceType`
- `resourceId`
- `from`
- `to`
- `offset`
- `log`
- `expanded`

### 7.3 优先级规则

统一规则如下：

1. 先读取 drilldown state，建立入口上下文
2. 再读取 URL params，覆盖当前页面筛选和选中态
3. 如果 URL params 缺失，则回落到 drilldown 推荐对象
4. 如果 drilldown 也缺失，则选默认第一条可用对象

该规则保证：

- 旧跳转语义不破
- 刷新后仍能回到当前视图
- 分享链接时可恢复当前工作状态

## 8. 两页之间的承接

### 8.1 RiskPage -> AuditPage

从风险详情跳到审计页时：

- 保留当前 risk / event / object drilldown 上下文
- 将最关键的 `resourceType` 与 `resourceId` 映射到 query params
- 如果存在明确目标日志，可带入 `log`

这样用户进入 `AuditPage` 后能直接看到与当前风险最相关的日志范围。

### 8.2 AuditPage -> 来源对象页

继续复用现有 `resolveAuditLogTarget`：

- 日志行负责定位回来源对象
- 页面不新建另一套对象路由规则

### 8.3 AuditPage -> RiskPage

当日志与某条风险、某个事项或某个合同上下文明确相关时：

- 回跳 `RiskPage`
- 回带相应的 drilldown state
- 保留必要的 URL 恢复状态

## 9. 组件拆分

### 9.1 RiskPage 组件

- `pages/risk/RiskPageShell.tsx`
- `pages/risk/RiskWorkbenchHeader.tsx`
- `pages/risk/RiskFindingsListPanel.tsx`
- `pages/risk/RiskResolutionWorkbench.tsx`
- `pages/risk/RiskClosureTimeline.tsx`
- `pages/risk/risk-url-state.ts`

`RiskPage.tsx` 路由入口应收敛为轻量壳文件，只负责挂载 shell。

### 9.2 AuditPage 组件

- `pages/audit/AuditPageShell.tsx`
- `pages/audit/AuditWorkbenchHeader.tsx`
- `pages/audit/AuditFiltersBar.tsx`
- `pages/audit/AuditLogTablePanel.tsx`
- `pages/audit/AuditDetailPanel.tsx`
- `pages/audit/audit-url-state.ts`

`AuditPage.tsx` 路由入口同样收敛为轻量壳文件。

### 9.3 共享展示块

可共享但不做过度抽象的部分：

- context banner
- summary stat card
- empty state
- loading / error state
- object link / drilldown action button

本次不新增“大而全”的 risk-audit 通用框架，避免为抽象而抽象。

## 10. 测试策略

### 10.1 RiskPage focused test

新增页面级 focused test，例如：

- `apps/web/src/pages/risk/risk-workbench.test.tsx`

重点验证：

- drilldown 进入时能初始化正确上下文
- query params 能恢复 `scope / event / finding`
- 选中风险后能展示整改链与关闭记录区
- 从风险详情能跳转审计页并带上正确上下文

### 10.2 AuditPage focused test

新增页面级 focused test，例如：

- `apps/web/src/pages/audit/audit-workbench.test.tsx`

重点验证：

- 来自风险 drilldown 时能初始化过滤条件与选中日志
- query params 能恢复筛选条件、分页和选中项
- 日志详情展开后能正确展示 changes
- 从日志可回跳来源对象或风险上下文

### 10.3 回归验证

实现完成后至少执行：

- `./node_modules/.bin/tsc --noEmit -p apps/web/tsconfig.json`
- focused test 命令
- `node --check src/scripts/app.js`
- `find backend/src -name '*.js' -print0 | xargs -0 -n1 node --check`
- `node tools/check-json.mjs backend/data`
- `node tools/check-progress-board.mjs docs/v2-progress-board.md`

## 11. 实施边界

本次分支目标是完成 V3 第一轮结构重构，而不是继续扩业务逻辑。

完成标准为：

- `RiskPage` 形成清晰的风险闭环工作台
- `AuditPage` 形成稳定的审计追溯台
- 两页都完成 URL 可恢复状态收口
- 两页都具备 focused test
- 不破坏现有 API 与 drilldown 规则

不在本次实现中的内容：

- 新风险算法
- 新审计聚合能力
- 后端分页协议调整
- 新通用框架层

## 12. 推荐实施顺序

1. 先为 `RiskPage` / `AuditPage` 写 focused tests，定义目标行为
2. 拆出 shell 和 URL state 解析
3. 收敛 `RiskPage` 的列表、整改区、关闭记录区
4. 收敛 `AuditPage` 的过滤区、结果区、详情区
5. 补两页之间的 drilldown 承接
6. 执行 typecheck 和 focused tests
