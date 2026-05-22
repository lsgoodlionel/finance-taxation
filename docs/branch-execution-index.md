# 分支执行索引

日期：2026-05-22

目的：为后续并行分支提供统一执行入口。每个分支在开始开发前，应先读取本文件指定章节，再进入实现。

---

## 1. 通用执行规则

所有分支开始前统一执行：

1. 阅读本文件对应分支章节
2. 阅读引用的审计、蓝图、计划、进度文档
3. 核对当前 `main` 是否最新
4. 建立分支
5. 按本文件列出的任务边界推进
6. 完成后至少执行：
   - `npm run typecheck:v2`
   - `npm run verify`

---

## 2. 分支索引

### 2.1 `codex/p0-contract-fulfillment-closure`

目标：
- 把合同页从“已接入事项主线”推进到“履约/开票/回款/收入确认闭环”

必须先读：
- `docs/page-business-logic-audit-2026-05-22.md`
  - `5.1`
  - `6.P0`
  - `7`
  - `8.1`
- `docs/v2-product-blueprint.md`
  - 合同、收入、回款、税务协同相关章节
- `docs/v2-development-plan.md`
  - 与合同、收入确认、税务关系相关的任务定义
- `docs/v2-progress-board.md`
  - 当前 WS3 / WS6 / WS8 状态

本分支只做：
- 合同自动任务链
- 合同到开票 / 回款 / 收入确认的自动派生
- 合同与税务事项 / 单据 / 凭证的强关系模型
- 合同履约时间轴

本分支不做：
- 导航重排
- PDF 导出批量化
- 工资税务闭环

---

### 2.2 `codex/p0-payroll-tax-closure`

目标：
- 把工资页从“已接入事项主线”推进到“个税/社保/公积金/风险闭环”

必须先读：
- `docs/page-business-logic-audit-2026-05-22.md`
  - `5.2`
  - `6.P0`
  - `7`
  - `8.2`
- `docs/v2-product-blueprint.md`
  - 工资、个税、社保、公积金、风险协同章节
- `docs/v2-development-plan.md`
  - 工资、税务、风险相关任务定义
- `docs/v2-progress-board.md`
  - 当前 WS-HR / WS6 / WS8 状态

本分支只做：
- 工资事项与工资记录强绑定
- 个税 / 社保 / 公积金专门复核台账
- 工资事项自动生成税务事项与凭证建议
- 工资风险专门视图与回跳

本分支不做：
- 合同履约强关系
- 导航重排
- PDF 导出批量化

---

### 2.3 `codex/p1-risk-audit-drilldown`

目标：
- 强化风险页和审计日志页的跨页钻取能力

必须先读：
- `docs/page-business-logic-audit-2026-05-22.md`
  - `5.4`
  - `6.P0`
  - `6.P1`
  - `7`
  - `8.3`
- `docs/v2-product-blueprint.md`
  - 风险勾稽中心、审计追溯相关章节
- `docs/v2-development-plan.md`
  - WS8、审计、异常中心相关任务
- `docs/v2-progress-board.md`
  - 当前 WS8 / WS-AUDIT 状态

本分支只做：
- `风险勾稽 -> 合同 / 工资 / 事项 / 税务 / 凭证` 双向穿透
- `审计日志 -> 具体对象详情`
- 页面间统一 `businessEventId / contractId / payrollPeriod` 导航态

本分支不做：
- 合同强关系建模
- 工资税务闭环主逻辑
- 导航顺序调整

---

### 2.4 `codex/p1-navigation-and-entry-reorder`

目标：
- 让左侧导航顺序与真实业务入口一致，并清理残留入口

必须先读：
- `docs/page-business-logic-audit-2026-05-22.md`
  - `4.4`
  - `4.5`
  - `6.P1`
  - `6.P2`
  - `8.4`
- `docs/v2-product-blueprint.md`
  - 董事长入口、AI 财税秘书、经营事项总线定位相关章节
- `docs/v2-progress-board.md`
  - 当前 WS1 / WS9 / WS-BOSSQA 状态

本分支只做：
- 调整左侧导航顺序
- 把 `AI 财税助手`、`经营事项总线` 前移
- 清理 `BossQAPage` 路由残留
- 统一入口说明与流程提示

本分支不做：
- 合同闭环逻辑
- 工资税务闭环逻辑
- PDF 批量导出逻辑

---

### 2.5 `codex/p2-export-batch-and-naming`

目标：
- 把 `PDF 导出中心` 从“单次导出入口”推进到“批量导出与归档中心”

必须先读：
- `docs/page-business-logic-audit-2026-05-22.md`
  - `4.2`
  - `4.3`
  - `5.3`
  - `6.P1`
  - `8.5`
- `docs/v2-development-plan.md`
  - 打印、导出、资料包、归档相关任务
- `docs/v2-progress-board.md`
  - 当前 WS4 / WS5 / WS6 / WS7 / WS-PDF 状态

本分支只做：
- 批量导出
- 统一命名规则
- 导出任务历史
- 导出包归档索引

本分支不做：
- 合同闭环逻辑
- 工资闭环逻辑
- 导航顺序调整

---

## 3. 通用验证命令

所有分支结束前至少执行：

```bash
npm run typecheck:v2
npm run verify
```

如分支涉及 API 纯函数或后端核心逻辑，追加：

```bash
npm run -w @finance-taxation/api test
```

如分支涉及前端局部纯函数测试，追加对应 `node --import tsx ...test.ts` 命令。

---

## 4. 建议执行顺序

1. `codex/p0-contract-fulfillment-closure`
2. `codex/p0-payroll-tax-closure`
3. `codex/p1-risk-audit-drilldown`
4. `codex/p1-navigation-and-entry-reorder`
5. `codex/p2-export-batch-and-naming`
