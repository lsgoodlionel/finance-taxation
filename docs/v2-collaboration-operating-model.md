# V2 协作与开发运行机制

## 1. 目标

建立一套适用于多 Agent、多人员、多工具、多分支并行开发的机制，确保：

- 并行开发互不覆盖
- 任务边界清晰
- 进度实时同步
- 合并风险可控
- AI 输出可审计

## 2. 协作模式

### 2.1 人员分层

- `Product Owner`
  - 维护优先级、验收标准、范围边界
- `Tech Lead`
  - 维护系统边界、接口规范、合并策略
- `Frontend Lead`
  - 维护页面结构、组件规范、交互统一性
- `Backend Lead`
  - 维护领域模型、接口契约、数据一致性
- `AI Lead`
  - 维护规则、Prompt、Agent 协议、回放机制
- `Finance/Tax SME`
  - 维护业务口径、税务口径、制度一致性
- `QA Lead`
  - 维护测试矩阵、回归清单、缺陷优先级
- `DevOps Lead`
  - 维护环境、Actions、发布、回滚

### 2.2 Agent 分层

- `Architect Agent`
  - 负责模型、边界、接口设计
- `Frontend Agent`
  - 负责页面、组件、状态、交互
- `Backend Agent`
  - 负责模块、接口、存储、权限
- `AI Agent`
  - 负责行为分析、任务拆解、Prompt、规则
- `Tax Agent`
  - 负责税务、研发、汇算、勾稽口径
- `QA Agent`
  - 负责测试用例、回归脚本、检查清单
- `DevOps Agent`
  - 负责 CI/CD、环境、部署自动化
- `Docs Agent`
  - 负责 README、方案、变更、验收记录

## 3. 分支策略

### 3.1 主分支

- `main`
  - 仅允许可回归、可发布、通过检查的代码进入

### 3.2 集成分支

- `integration/v2-foundation`
- `integration/v2-finance`
- `integration/v2-tax`
- `integration/v2-ai`

### 3.3 功能分支

分支命名：

- `feat/ws1-app-shell`
- `feat/ws3-business-events`
- `feat/ws5-ledger-posting`
- `feat/ws9-ai-secretary`

### 3.4 修复分支

- `fix/ws5-ledger-balance`
- `fix/ws8-risk-rule-regression`

## 4. 代码边界与所有权

### 4.1 前端所有权

- `src/app`
- `src/pages`
- `src/components`
- `src/features`
- `src/styles`

### 4.2 后端所有权

- `backend/src/modules/auth`
- `backend/src/modules/company`
- `backend/src/modules/events`
- `backend/src/modules/tasks`
- `backend/src/modules/documents`
- `backend/src/modules/ledger`
- `backend/src/modules/tax`
- `backend/src/modules/rnd`
- `backend/src/modules/reconciliation`

### 4.3 AI 所有权

- `backend/src/modules/analysis`
- `backend/src/modules/agents`
- `backend/src/rules`
- `backend/src/prompts`

### 4.4 文档所有权

- `README.md`
- `docs/*.md`

规则：

- 一个工作流一个主责任人
- 同一时间尽量不要让两个分支同时写同一目录的核心文件
- 若确需共享修改，必须先更新接口契约再开发

## 5. 任务切分规则

任务必须满足：

- 范围明确
- 输入明确
- 输出明确
- 写入目录明确
- 测试方式明确
- 验收标准明确

一个任务只能有一个主责任人，但可以有协作者。

## 6. 进度同步机制

### 6.1 单一事实来源

使用：

- [docs/v2-progress-board.md](./v2-progress-board.md)

作为当前仓库内的统一进度板。

### 6.2 更新频率

- 每次开始开发前更新一次状态
- 每次提交前更新一次状态
- 每次出现阻塞时立即更新一次状态
- 每日结束前做一次汇总更新

### 6.3 状态枚举

- `not_started`
- `in_progress`
- `in_review`
- `blocked`
- `done`

### 6.4 必填字段

- Workstream
- Task ID
- Owner
- Branch
- Status
- Last Update
- Next Action
- Blocker

## 7. PR 机制

每个 PR 必须包含：

- 任务编号
- 范围说明
- 影响目录
- 验证方法
- 风险点
- 回滚方案

PR 标题建议：

- `[WS5][TASK-07-03] add voucher posting service`
- `[WS3][TASK-02-05] add business event task decomposition`

## 8. 合并机制

### 8.1 合并前必须通过

- GitHub Actions
- 本地语法检查
- 契约一致性检查
- 对应模块负责人 Review

### 8.2 合并窗口

- 每天固定 2 次集成窗口
- 高风险模块只在窗口内合并
- 权限、账务内核、税务规则三类改动禁止临时直接推主线

## 9. 冲突预防机制

- 修改前先在进度板登记分支与目录范围
- 涉及公共类型、公共状态、公共 API 的改动先出设计草稿
- 大任务先拆公共基础分支，再拆业务实现分支
- 每日对集成分支 rebase / merge 一次，避免长期漂移

## 10. AI 开发使用规范

- AI 可以生成代码，但不能跳过审计与验收
- AI 输出的税务和会计建议必须保留依据
- AI 对规则、Prompt、模板的修改必须版本化
- AI 参与的任务同样必须绑定 `Task ID`

## 11. 定义完成标准

### 11.1 任务级 DoD

- 功能实现完成
- 代码合并准备完成
- 检查通过
- 文档同步
- 进度板同步

### 11.2 模块级 DoD

- 功能链路完整
- 回归通过
- 角色权限正常
- 审计记录正常
- 风险点已记录

## 12. 阻塞升级机制

阻塞超过 4 小时：

- 责任人更新进度板
- Tech Lead 介入排障

阻塞超过 1 天：

- 升级到 Product Owner + Tech Lead
- 重新拆分任务或调整优先级

阻塞涉及会计 / 税务口径：

- 必须由财税业务负责人确认，不允许开发自行拍板

## 13. 推荐工具组合

- GitHub Issues：任务拆解
- GitHub Projects：泳道看板
- GitHub Actions：自动检查
- PR 模板：变更说明
- 仓库内 `docs/*.md`：设计与进度统一档案

## 14. 当前启动建议

第一轮并行时，最多同时启动 6 个工作流：

- WS0 工程底座
- WS1 前端骨架
- WS2 权限认证
- WS3 经营事项
- WS4 单据附件
- WS5 账务内核基础

原因：

- 这 6 个工作流互相依赖最少
- 可在不大量争抢相同文件的情况下并行推进
- 可以尽快产出一条从“输入经营事项”到“任务 / 单据 / 分录建议”的最小闭环
