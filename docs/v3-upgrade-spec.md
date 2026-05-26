# V3.0 大版本升级计划书

> 版本：v3.0-spec-1.0  
> 日期：2026-05-26  
> 状态：已确认，待实施  
> 目标：将现有 18 个前端页面从"信息堆砌型"重构为"业务流程引导型"，
> 让操作逻辑更直观、步骤更清晰、信息更有层次。

---

## 目录

1. [现状诊断](#一现状诊断)
2. [V3.0 技术选型](#二v30-技术选型)
3. [设计原则与规范](#三设计原则与规范)
4. [参考仓库索引](#四参考仓库索引)
5. [分模块升级方案](#五分模块升级方案)
6. [实施路线图](#六实施路线图)
7. [文件结构规划](#七文件结构规划)
8. [后续持续开发方向](#八后续持续开发方向)

---

## 一、现状诊断

### 1.1 页面复杂度全景

| 页面 | 当前行数 | useState 数 | Tab 数 | 核心问题 |
|---|---|---|---|---|
| PayrollPage | 1147 | 25 | 3 | 三个独立业务域强行合并，计算流程不可见 |
| AssistantPage | 1106 | 16 | — | OCR/对话/事项创建/流程卡四功能混合 |
| PdfExportPage | 928 | 21 | 8 | 8 种导出类型全部铺开，无场景引导 |
| ContractsPage | 825 | 9 | — | 列表/详情/时间轴/工作流/风险合一文件 |
| TaxPage | 706 | 21 | — | 申报/计算/税种/工资税未分域 |
| EventsPage | 671 | 9 | — | 事项操作与列表混合，无流程指引 |
| SettingsPage | 665 | 22 | 4 | 四个独立配置域写在同一组件 |
| DocumentsPage | 652 | 11 | — | 列表/详情/上传/归档全内联 |
| KnowledgePage | 627 | 14 | — | 知识库无目录树，搜索无高亮 |
| LedgerPage | 550 | 16 | 5 | 5个子账本视图缺乏关联导航 |
| ReportsPage | 473 | 14 | — | 无图表，无期间对比 |
| VouchersPage | 444 | 10 | — | 凭证编辑/审核内联，借贷平衡无实时校验 |
| RiskPage | 439 | — | — | 闭环链路（风险→任务→单据→凭证）不可见 |
| RndPage | 436 | 10 | — | 费用归集流程不可见 |
| AuditPage | 409 | 11 | — | 日志无过滤，无分页 |
| TasksPage | 338 | 7 | — | 列表+树视图并列，操作按钮散落行内 |
| ChairmanDashboard | 252 | — | — | 仅简单列表，缺乏 KPI 驾驶舱视图 |
| （路由/导航页）| — | — | — | 导航结构基本完整，无需大改 |

### 1.2 系统性设计缺陷

| 问题类别 | 具体表现 | 影响 |
|---|---|---|
| **无设计系统** | 全部为 `style={{...}}` 内联，无 CSS token，无共享组件 | 样式不一致，改动成本高 |
| **单一 message 状态** | 错误/成功/状态用同一字符串，用户无法判断严重程度 | 用户体验差 |
| **无步骤引导** | 复杂操作（工资计算/税务申报）没有流程指引 | 操作失误率高 |
| **无骨架屏/空状态** | loading 只显示文字，列表空时只有简单文本 | 视觉体验差 |
| **表单内嵌列表** | 新建/编辑表单直接渲染在列表页内 | 页面拥挤，操作混乱 |
| **无 URL 状态持久化** | 筛选/分页/Tab 刷新即失 | 无法分享链接，后退键失效 |
| **无响应式设计** | 宽度全部硬编码 | 移动端和小屏完全不可用 |
| **无无障碍支持** | 无 `aria-*`，无键盘导航 | 不合规 |
| **单文件巨组件** | 最大文件 1147 行，最多 25 个 useState | 维护困难，测试覆盖低 |

---

## 二、V3.0 技术选型

### 2.1 UI 组件库：Ant Design (antd 5.x)

**选择理由：**
- 中文企业级应用事实标准，与本项目业务场景高度匹配
- 提供 Table/Form/Drawer/Steps/Select/DatePicker/Tabs 等所有必需组件
- TypeScript 原生支持，类型完善
- Design Token 系统（CSS-in-JS + 主题定制）
- 组件文档完整，中文

**安装：**
```bash
pnpm add antd @ant-design/icons
```

**主题配置（`src/lib/antd-theme.ts`）：**
```typescript
import type { ThemeConfig } from "antd";

export const antdTheme: ThemeConfig = {
  token: {
    colorPrimary: "#4f8ef7",
    colorSuccess: "#10b981",
    colorWarning: "#f59e0b",
    colorError: "#dc2626",
    borderRadius: 8,
    fontFamily: "'PingFang SC', 'Microsoft YaHei', sans-serif",
  },
};
```

**参考仓库：**
- `reference/bigcapital/` — 大量 antd 组件用法，Table/Form/Drawer/Steps
- `reference/Cent/` — React + Vite + TypeScript，shadcn/ui 风格，组件设计思路参考

### 2.2 图表库：Recharts

**选择理由：**
- React 原生，基于 SVG，TypeScript 完善
- 轻量（比 ECharts 小 80%），Tree-shaking 友好
- 折线图/柱状图/饼图/面积图均有

**安装：**
```bash
pnpm add recharts
```

**参考仓库：**
- `reference/bigcapital/packages/webapp/src/containers/Dashboard/` — 完整的财务 Dashboard 图表实现
- `reference/Cent/src/components/chart/` — 账本图表组件

### 2.3 拖拽看板：@dnd-kit

**选择理由：**
- 现代化、无障碍支持
- 比 react-beautiful-dnd 更活跃维护
- 支持键盘拖拽

**安装：**
```bash
pnpm add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

**用途：** ContractsPage 合同看板（四阶段列拖拽）

**参考仓库：**
- `reference/bigcapital/packages/webapp/src/containers/` — Kanban 相关容器

### 2.4 表单管理：React Hook Form + Zod

```bash
pnpm add react-hook-form zod @hookform/resolvers
```

- **React Hook Form**：性能最优，非受控模式，与 antd 配合良好
- **Zod**：运行时类型校验，与 TypeScript 类型推断无缝集成
- 替换现有各页面分散的手动 state 管理表单

**参考仓库：**
- `reference/TaxHacker/` — Next.js + shadcn + RHF + Zod 表单模式
- `reference/dubbl/` — 完整的 Zod schema + RHF 表单实现

### 2.5 通知：sonner

```bash
pnpm add sonner
```

- 轻量 Toast 通知，替换现有 `message` 状态字符串
- `toast.success()` / `toast.error()` / `toast.loading()` 三种模式

### 2.6 其他工具库

```bash
pnpm add dayjs          # 替换 Date 处理
pnpm add @tanstack/react-table  # 高级表格（排序/过滤/分页）
pnpm add react-pdf      # PDF 预览（DocumentsPage）
```

---

## 三、设计原则与规范

### 3.1 六项核心原则

#### 原则 1：业务步骤可见（Stepper-First）
复杂操作（工资计算、税务申报、合同关闭）必须用 `Steps` 组件展示当前所在步骤，
不允许将多步操作合并为单一表单。

```
旧模式: 一个页面 → 所有字段 → 点提交
新模式: Step 1 准备 → Step 2 核对 → Step 3 确认 → Step 4 完成
```

#### 原则 2：抽屉承载详情（Drawer-Default）
所有详情展示和编辑表单放入右侧 `Drawer`，列表页只负责概览和选择，不内联渲染详情。

#### 原则 3：URL 状态持久化（URL-State-First）
筛选条件、分页、激活 Tab、当前选中 ID 写入 URL query params，
实现刷新保持状态、浏览器前进/后退正常工作、可分享链接。

```typescript
// 使用 useSearchParams 替代 useState 管理可分享状态
const [searchParams, setSearchParams] = useSearchParams();
const currentTab = searchParams.get("tab") ?? "list";
```

#### 原则 4：分层信息披露（Progressive Disclosure）
- **第一层**：列表页 — 关键字段（标题、状态、金额、截止日）
- **第二层**：Drawer — 详细信息、操作按钮
- **第三层**：全屏 Modal — 复杂表单（新建凭证、工资计算向导）
- 禁止将第三层信息显示在第一层

#### 原则 5：统一反馈系统（Toast + Banner）
| 场景 | 组件 | 示例 |
|---|---|---|
| 操作成功 | `sonner toast.success` | "任务已更新" |
| 操作失败 | `sonner toast.error` | "网络错误，请重试" |
| 需要关注 | `antd Alert type="warning"` | "本月有 3 项逾期任务" |
| 页面级错误 | `antd Result status="error"` | "无法加载数据" |
| 加载状态 | `antd Skeleton` | 骨架屏占位 |

**废弃** 现有所有页面中的 `const [message, setMessage] = useState("")` 模式。

#### 原则 6：组件原子化（Component-First）
- 页面容器（Page）：< 150 行，只负责数据获取和布局组合
- 功能组件（Feature）：< 300 行，业务逻辑 + 展示
- UI 组件（UI）：< 100 行，纯展示，无业务逻辑

### 3.2 文件命名规范

```
pages/
  PayrollPage.tsx          # 路由入口，< 80 行
  payroll/
    EmployeesTab.tsx        # 功能组件
    PayrollRunTab.tsx
    PolicyTab.tsx
    PayrollRunWizard.tsx    # 步骤向导组件
    usePayrollRun.ts        # 业务 Hook
components/
  ui/                      # 原子 UI 组件
    PageHeader.tsx
    StatusBadge.tsx
    DataTable.tsx
    EntityDrawer.tsx
    StepWizard.tsx
features/
  payroll/                 # 独立功能域
  tax/
  contracts/
```

---

## 四、参考仓库索引

全部克隆至 `reference/` 目录，使用时直接参考本地代码。

| 仓库 | Stars | 大小 | 最适合参考的模块 |
|---|---|---|---|
| `TaxHacker/` | ★5846 | 28MB | AI收据分析、OCR上传流程、shadcn/ui设计语言 |
| `bigcapital/` | ★3676 | 74MB | **Dashboard图表**、会计Drawer模式、发票/费用UX、antd用法 |
| `Cent/` | ★1062 | 3.8MB | **中文账本UI**、Vite+React+TypeScript最佳实践、协作记账 |
| `books/` | ★4654 | 8MB | **双式记账**凭证录入、科目树、报表布局（frappe出品） |
| `HR-management/` | ★9 | 115MB | **工资模块**、员工管理、考勤、薪资计算流程 |
| `Invio/` | ★853 | 2MB | **发票/单据**极简UI，Drawer详情模式 |
| `dubbl/` | ★14 | 16MB | Xero/QuickBooks风格，**图表+报表**，Next.js+Zod |
| `accountinghub/` | ★4 | 37MB | ERP全流程，双入账，VAT报表 |
| `ZhiZhang-Desktop/` | ★2 | 5.6MB | 中文记账Electron，**中文UI**命名和交互模式 |
| `Tunisian-ERP/` | ★1 | 19MB | 税务合规(VAT/个税)、**Node+React+PG**同技术栈 |

### 关键参考路径速查

```bash
# bigcapital Dashboard 图表
reference/bigcapital/packages/webapp/src/containers/Dashboard/

# bigcapital Drawer 模式（最全）
reference/bigcapital/packages/webapp/src/containers/Drawers/

# bigcapital 凭证/日记账
reference/bigcapital/packages/webapp/src/containers/Accounting/

# Cent 中文记账页面
reference/Cent/src/pages/

# Cent 记账组件（中文）
reference/Cent/src/components/

# TaxHacker AI 分析组件
reference/TaxHacker/components/transactions/
reference/TaxHacker/app/(app)/transactions/

# frappe/books 凭证模型
reference/books/models/Transactional/

# HR-management 工资模块
reference/HR-management/

# Invio 发票 Drawer
reference/Invio/frontend/

# dubbl 报表图表
reference/dubbl/app/
```

---

## 五、分模块升级方案

### Phase 0：基础设施（所有模块依赖此 Phase）

#### 0-A：设计 Token 系统
**文件：** `src/styles/tokens.css`

```css
:root {
  /* 主色 */
  --c-primary: #4f8ef7;
  --c-primary-hover: #3b7df0;
  --c-primary-bg: rgba(79,142,247,0.08);

  /* 语义色 */
  --c-success: #10b981;
  --c-warning: #f59e0b;
  --c-danger: #dc2626;
  --c-info: #3b82f6;

  /* 中性色 */
  --c-text: #1a2332;
  --c-text-muted: #6b7a8d;
  --c-border: #e5e9f0;
  --c-bg: #f4f6fa;
  --c-surface: #ffffff;

  /* 间距 */
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 32px;

  /* 圆角 */
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;

  /* 阴影 */
  --shadow-sm: 0 1px 4px rgba(0,0,0,0.08);
  --shadow-md: 0 4px 16px rgba(0,0,0,0.10);
  --shadow-lg: 0 8px 32px rgba(0,0,0,0.14);
}
```

#### 0-B：通用 Hook 库
**目录：** `src/hooks/`

| Hook | 功能 |
|---|---|
| `useSearchParams.ts` | URL query params 读写，替代 Tab/页码 state |
| `useAsyncAction.ts` | 封装 loading/error/data，替代各页面重复的 async 模式 |
| `useDrawer.ts` | Drawer 开关 + 当前选中实体 state |
| `useConfirm.ts` | 确认弹窗（删除/归档等危险操作） |
| `useTableFilter.ts` | 表格筛选/排序/分页统一管理 |

**参考：** `reference/bigcapital/packages/webapp/src/hooks/`

#### 0-C：通用 UI 组件库
**目录：** `src/components/ui/`

| 组件 | 基于 | 功能 |
|---|---|---|
| `<PageHeader>` | antd | 统一页面顶部：标题/副标题/操作按钮组 |
| `<StatusBadge>` | antd Tag | 状态标签（not_started/done/blocked等） |
| `<PriorityBadge>` | antd Tag | 优先级标签（high/medium/low） |
| `<DataTable>` | antd Table | 封装分页/排序/筛选/骨架屏 |
| `<EntityDrawer>` | antd Drawer | 右侧详情 Drawer 统一外框 |
| `<StepWizard>` | antd Steps | 多步向导统一外框 |
| `<EmptyState>` | antd Empty | 空列表状态 |
| `<ConfirmModal>` | antd Modal | 二次确认弹窗 |
| `<AmountDisplay>` | — | 金额显示（千分位 + 货币符号） |
| `<OverdueBadge>` | antd Badge | 逾期红色标识 |

**参考：** `reference/bigcapital/packages/webapp/src/components/`，`reference/TaxHacker/components/ui/`

#### 0-D：Ant Design 主题接入
**文件：** `src/main.tsx`（修改）

```typescript
import { ConfigProvider } from "antd";
import zhCN from "antd/locale/zh_CN";
import { antdTheme } from "./lib/antd-theme";

<ConfigProvider locale={zhCN} theme={antdTheme}>
  <App />
</ConfigProvider>
```

**工期：3天**

---

### Phase 1：核心业务路径（高优先级）

#### 1-A：EventsPage（经营事项）— 业务起点，最重要

**当前问题：**
- 列表 + AI 分析 + 帮助弹窗混合，无明确的"下一步"指引
- 创建事项需要找到正确按钮，流程不直观

**V3.0 升级方案：**

```
布局: 双列
├── 左侧 (240px): 快速筛选面板（状态/类型/日期范围）
└── 右侧 (flex): 事项列表（DataTable）

事项列表操作:
- 点击行 → 右侧 EntityDrawer 展开
- Drawer 内: 事项详情 + 操作按钮组（AI分析/生成任务/导航到凭证/导航到单据）
- 顶部 FAB: "录入新事项"（固定右下角）

状态指引横幅 (Alert):
- 有未分析事项 → "有 X 个事项待 AI 分析，点击处理"
- 有待处理任务 → "有 X 个关联任务待开始"
```

**拆分文件：**
```
pages/EventsPage.tsx              # 路由容器 <100行
pages/events/
  EventsFilterPanel.tsx           # 左侧筛选面板
  EventsTable.tsx                 # 事项列表表格
  EventDrawer.tsx                 # 事项详情 Drawer
  EventCreateModal.tsx            # 新建事项 Modal
  EventAnalysisResult.tsx         # AI 分析结果展示
  useEvents.ts                    # 数据 Hook
```

**参考代码：**
```bash
# 事项列表布局参考（双列 + Drawer）
reference/bigcapital/packages/webapp/src/containers/Customers/
# 分析结果卡片参考
reference/TaxHacker/components/transactions/
```

---

#### 1-B：TasksPage（任务中心）— 执行枢纽

**当前问题：**
- 列表模式和树视图并列，信息重复，用户困惑
- 操作按钮分散在每行右侧，看板感缺失

**V3.0 升级方案：**

```
顶部: 视图切换（看板 / 列表 / 树形）
默认: 看板视图（4列 Kanban）
  ┌──────────┬───────────┬──────────┬──────────┐
  │ 待开始    │ 进行中    │ 已完成    │ 已阻塞   │
  │ (N)      │ (N)       │ (N)      │ (N)      │
  ├──────────┼───────────┼──────────┼──────────┤
  │ 任务卡片  │ 任务卡片  │ 任务卡片  │ 任务卡片  │
  │ 标题     │ 标题      │ 标题     │ 标题     │
  │ 优先级   │ 优先级    │ 优先级   │ 优先级   │
  │ 截止日   │ 截止日    │ 截止日   │ 截止日   │
  └──────────┴───────────┴──────────┴──────────┘

任务卡片点击 → EntityDrawer（操作/详情/历史）
列表模式: DataTable，支持排序/筛选/分页
树形模式: 按事项分组折叠展示

逾期任务: 红色边框 + 顶部聚合提醒 Banner
```

**拆分文件：**
```
pages/TasksPage.tsx               # 路由容器
pages/tasks/
  TaskKanbanView.tsx              # 看板视图
  TaskKanbanColumn.tsx            # 看板列
  TaskCard.tsx                    # 任务卡片（可拖拽）
  TaskListView.tsx                # 列表视图
  TaskTreeView.tsx                # 树形视图
  TaskDrawer.tsx                  # 任务详情 Drawer
  useTaskBoard.ts                 # 看板逻辑 Hook
```

**参考代码：**
```bash
# dnd-kit 看板实现
reference/bigcapital/packages/webapp/src/containers/
# 任务卡片样式
reference/TaxHacker/components/
```

---

#### 1-C：DocumentsPage（单据中心）— 资料完整性管理

**当前问题：**
- 左选右看两栏，但宽度硬编码，上传无进度
- 归档操作无确认流程

**V3.0 升级方案：**

```
主布局: 两栏（可调宽比例）
├── 左侧 (300px): 单据列表（DataTable，按事项/类型/状态分组，URL持久化筛选）
└── 右侧 (flex): 单据详情 + 附件管理

详情区域:
  - 单据基本信息（只读卡片）
  - 附件列表（文件名/大小/上传时间/预览按钮）
  - 上传区域（拖放 + 点击，显示上传进度条）
  - PDF/图片内联预览（react-pdf）

归档操作 → 3步 StepWizard Modal:
  Step 1: 检查清单（勾选是否完整：发票/审批/合同/收款凭证）
  Step 2: 确认归档信息（摘要/关联事项/金额）
  Step 3: 归档完成（生成归档编号，可下载归档包）
```

**拆分文件：**
```
pages/DocumentsPage.tsx           # 路由容器
pages/documents/
  DocumentsList.tsx               # 左侧列表
  DocumentDetail.tsx              # 右侧详情
  AttachmentUploader.tsx          # 附件上传组件
  AttachmentList.tsx              # 附件列表
  ArchiveWizard.tsx               # 归档向导
  useDocuments.ts
```

**参考代码：**
```bash
# 文件上传 + 附件管理
reference/TaxHacker/components/files/
reference/bigcapital/packages/webapp/src/containers/Attachments/
# PDF 预览
reference/Invio/frontend/
```

---

#### 1-D：VouchersPage（凭证中心）— 会计入账核心

**当前问题：**
- 凭证录入、审核、过账全部内联，借贷不平衡不提醒
- 多条分录操作笨重

**V3.0 升级方案：**

```
主视图: 凭证列表（DataTable）
  - 分状态分组 Tab：草稿 / 待审 / 已过账 / 已作废
  - 每行显示：日期/摘要/借方合计/贷方合计/状态/操作

新建凭证 → 全屏 Modal（参考frappe/books凭证录入）:
  - 凭证头（日期/编号/摘要/附单据数）
  - 分录表格（科目/摘要/借方/贷方，可增行/删行）
  - 底部：借贷合计实时校验（红色=不平衡，绿色=平衡）
  - 保存为草稿 / 提交审核

凭证详情 → EntityDrawer:
  - 分录明细
  - 审核意见
  - 操作按钮（过账/反冲/打印）

批量审核:
  - 勾选多条 → "批量审核通过"按钮（带 ConfirmModal）
```

**拆分文件：**
```
pages/VouchersPage.tsx            # 路由容器
pages/vouchers/
  VouchersList.tsx                # 凭证列表
  VoucherCreateModal.tsx          # 新建凭证全屏Modal
  VoucherEntryTable.tsx           # 分录录入表格
  BalanceIndicator.tsx            # 借贷平衡指示器
  VoucherDrawer.tsx               # 凭证详情Drawer
  useVouchers.ts
```

**参考代码：**
```bash
# 凭证录入模式（最重要）
reference/books/src/   # frappe/books 双式记账录入
reference/accountinghub/  # 仿Xero凭证录入
reference/bigcapital/packages/webapp/src/containers/Accounting/
# 借贷平衡实时计算
reference/Tunisian-ERP/  # 同技术栈，有会计模块
```

---

### Phase 2：复杂流程 Stepper 化

#### 2-A：PayrollPage（工资管理）— 最高复杂度，最大拆分

**当前核心问题：**
1147 行，25 个 useState，3 个业务域（员工/工资计算/薪酬政策）强塞一文件

**V3.0 拆分架构：**

```
pages/PayrollPage.tsx             # 路由容器（Tab路由，<60行）
pages/payroll/
  EmployeesTab.tsx                # 员工管理（<300行）
  EmployeeDrawer.tsx              # 员工详情/编辑Drawer
  EmployeeCreateModal.tsx         # 新增员工Modal（RHF+Zod）
  
  PayrollRunTab.tsx               # 工资计算Tab（<200行）
  PayrollRunWizard.tsx            # 6步计算向导（核心）
  PayrollRunResultTable.tsx       # 计算结果表格
  PayrollRunAdjustForm.tsx        # 人工调整界面
  
  PolicyTab.tsx                   # 薪酬政策（<200行）
  PolicyEditor.tsx                # 薪酬规则编辑
  
  useEmployees.ts                 # 员工数据Hook
  usePayrollRun.ts                # 工资计算Hook
```

**工资计算向导（PayrollRunWizard）6 步流程：**

```
Step 1: 选择期间
  → 选择年月，显示上期已完成状态
  → 校验：是否已锁账，是否有未处理员工

Step 2: 员工确认
  → 显示本期参与计算的员工列表
  → 可标记"本月离职""试用期""部分月"

Step 3: 系统计算预览
  → 逐行显示：基本工资/绩效/社保/个税/实发
  → 汇总：应发合计/代扣合计/实发合计
  → 可查看每人的计算依据明细

Step 4: 人工调整
  → 允许对特定员工添加一次性调整项（奖金/扣款/补发）
  → 每条调整需填写摘要
  → 实时更新汇总数字

Step 5: 审核确认
  → 最终工资表（含调整后）
  → 负责人签字确认（记录操作人和时间）
  → 导出预览（PDF格式）

Step 6: 发放与申报
  → 标记"已发放"（记录银行放款日期）
  → 一键推送到 TaxPage 个税申报
  → 生成工资凭证（推送到 VouchersPage 草稿）
  → 发送工资条通知（预留）
```

**参考代码：**
```bash
# 工资计算流程参考（最核心）
reference/HR-management/  # 完整的工资系统（115MB，最详细）
# 步骤向导实现
reference/bigcapital/packages/webapp/src/containers/  # antd Steps用法
# 员工管理CRUD
reference/Tunisian-ERP/  # Node+React+PG同技术栈
```

---

#### 2-B：TaxPage（税务管理）— 流程引导重构

**当前核心问题：**
706 行，21 个 useState，申报/计算/税种/工资税未分域，无流程感

**V3.0 升级方案：左侧导航 + 内容区**

```
页面布局:
├── 左侧导航（220px，固定）
│   ├── 📅 税务日历（默认首页）
│   ├── 📊 增值税申报
│   ├── 👤 个人所得税
│   ├── 🏢 企业所得税
│   └── ⚙️ 税种配置
└── 右侧内容区

税务日历:
  - 当月应申报项目（带截止日倒计时）
  - 已申报/未申报/逾期三种颜色区分
  - 点击项目直接进入对应申报流程

增值税申报 4步向导:
  Step 1: 数据汇总（本期销项/进项/待抵扣）
  Step 2: 核对确认（可修改异常项）
  Step 3: 生成申报表（预览 PDF）
  Step 4: 记录申报结果（申报日期/税款金额/缴款凭证上传）

个人所得税:
  - 从工资中心同步计算结果
  - 按员工逐一确认
  - 支持批量申报
```

**拆分文件：**
```
pages/TaxPage.tsx                 # 路由容器 + 左侧导航
pages/tax/
  TaxCalendar.tsx                 # 税务日历
  VatDeclarationWizard.tsx        # 增值税申报向导
  IitDeclarationPage.tsx          # 个税申报（联动工资）
  CitDeclarationPage.tsx          # 企业所得税
  TaxConfigPage.tsx               # 税种配置
  useTaxCalendar.ts
  useVatDeclaration.ts
```

**参考代码：**
```bash
reference/Tunisian-ERP/  # 突尼斯税务合规（VAT/个税）最接近
reference/bigcapital/packages/webapp/src/containers/FinancialStatements/
reference/dubbl/app/  # 财务报表和税务视图
```

---

#### 2-C：ContractsPage（合同管理）— 看板化

**当前核心问题：**
825 行，合同列表/详情/时间轴/工作流/风险一文件，生命周期不可视

**V3.0 升级方案：合同看板 + 详情 Drawer**

```
主视图: 合同看板（@dnd-kit，4列可拖拽）
  ┌──────────┬───────────┬──────────┬──────────┐
  │  起草中   │  履行中   │  待关闭  │  已关闭  │
  ├──────────┼───────────┼──────────┼──────────┤
  │ 合同卡片  │ 合同卡片  │ 合同卡片 │ 合同卡片  │
  │ 甲方名称  │ 甲方名称  │ 甲方名称 │ 甲方名称  │
  │ 金额     │ 金额      │ 金额    │ 金额     │
  │ 截止日   │ 截止日    │ 截止日   │ 截止日   │
  │ 风险标识  │ 风险标识  │ 风险标识 │ 风险标识  │
  └──────────┴───────────┴──────────┴──────────┘

看板列表视图切换（URL 持久化）

合同 Drawer（右侧 480px）:
  Tabs: 基本信息 / 履行记录 / 风险勾稽 / 关联单据 / 操作历史
  操作栏: 推进阶段 / 生成任务 / 导出 PDF / 关联风险

合同关闭 → 3步 StepWizard:
  Step 1: 履行核查清单（付款/交付/验收/发票）
  Step 2: 风险确认（未关闭风险处理说明）
  Step 3: 归档完成（生成关闭报告）
```

**拆分文件：**
```
pages/ContractsPage.tsx           # 路由容器
pages/contracts/
  ContractKanbanView.tsx          # 看板视图（dnd-kit）
  ContractKanbanCard.tsx          # 合同卡片
  ContractListView.tsx            # 列表视图备选
  ContractDrawer.tsx              # 合同详情Drawer（多Tab）
  ContractCloseWizard.tsx         # 关闭向导
  ContractCreateModal.tsx         # 新建合同Modal
  PerformanceRecordList.tsx       # 履行记录组件
  useContracts.ts
```

**参考代码：**
```bash
# Kanban 看板 + dnd-kit
reference/bigcapital/packages/webapp/src/containers/
# 发票/合同 Drawer 详情
reference/Invio/frontend/
reference/dubbl/app/components/
```

---

#### 2-D：LedgerPage（总账）— Tab 内容深化

**当前核心问题：**
5个Tab内容差异大，科目余额缺对比，日记账缺分页

**V3.0 升级方案：**

```
保留5个Tab，深化每Tab内容:

科目汇总Tab:
  - 科目树（展开/折叠，三级：大类/一级/二级）
  - 搜索高亮过滤
  - 金额正负颜色区分

科目余额Tab:
  - 期间选择器（年月范围）
  - 新增：与上期对比列（差值 + 环比%）
  - 新增：异常科目高亮（余额方向与科目性质不符）

现金/银行日记账Tab:
  - 分页（50条/页，URL持久化）
  - 支持按日期范围/金额范围筛选
  - 新增：打印预览按钮

总账分录Tab:
  - 按凭证号/摘要关键词搜索
  - 支持展开查看关联凭证详情

期间锁账Tab:
  - 锁账操作改为 ConfirmModal（三次确认，显示影响范围）
  - 显示锁账历史记录
```

**参考代码：**
```bash
reference/books/src/   # frappe/books 科目余额表（最佳参考）
reference/bigcapital/packages/webapp/src/containers/Accounts/
reference/Cent/src/pages/ledger/  # 中文账本
```

---

### Phase 3：辅助功能模块

#### 3-A：AssistantPage（AI 财税秘书）— 三区布局重构

**当前问题：**
1106 行，OCR/对话/事项创建/流程卡四功能混合，无明确的功能分区

**V3.0 升级方案：三区布局**

```
布局:
├── 左侧 (240px，可折叠): 会话历史列表
│   - 显示历史会话标题（按日期分组）
│   - 点击切换会话
│   - "新会话" 按钮
├── 中间 (flex): 主对话区
│   - 消息气泡（用户/AI区分）
│   - ProcessFlowCard 嵌入展示
│   - 事项创建建议卡片（可一键确认）
└── 右侧 (320px，可折叠): 上下文面板
    - 当前识别到的关键信息（金额/日期/对方名称）
    - 已上传的附件预览
    - 快速操作按钮（创建事项/跳转到相关页面）

底部输入区:
  ┌─────────────────────────────────────────┐
  │ 📎 附件  🖼 OCR识别  |  输入消息...     📤│
  └─────────────────────────────────────────┘
  快捷提示 Chips（可点击填充）:
  "分析这张发票" | "本月应申报税种" | "最近未处理事项"

角色权限:
  老板角色 → 显示管理层视角的快速提示
  会计角色 → 显示业务操作类快速提示
```

**拆分文件：**
```
pages/AssistantPage.tsx           # 路由容器（三区布局）
pages/assistant/
  SessionSidebar.tsx              # 左侧会话列表
  ChatArea.tsx                    # 中间对话区
  ContextPanel.tsx                # 右侧上下文面板
  MessageBubble.tsx               # 消息气泡
  QuickPromptChips.tsx            # 快捷提示标签
  OcrUploader.tsx                 # OCR上传组件
  SuggestedEventCard.tsx          # 建议创建事项卡片
  useAssistantSession.ts          # 会话管理Hook
```

**参考代码：**
```bash
reference/TaxHacker/components/  # AI对话 + OCR + 分析卡片（最接近）
reference/TaxHacker/app/(app)/   # Next.js AI 分析页面
reference/Cent/src/components/assistant/  # 中文AI记账助手
```

---

#### 3-B：PdfExportPage（导出中心）— 场景卡片化

**当前问题：**
928 行，21 个 useState，8个Tab平铺，用户不知道哪个Tab适合自己的场景

**V3.0 升级方案：场景选择 → 配置 → 下载三步**

```
第一步: 场景选择（卡片网格）
  ┌─────────────┬─────────────┬─────────────┐
  │ 📊 财务报表  │ 💰 工资材料  │ 🧾 税务材料  │
  │ 资产负债表   │ 工资条/证明  │ 申报附表     │
  ├─────────────┼─────────────┼─────────────┤
  │ 📦 批量归档  │ 🔍 风控报告  │ 🔬 研发辅助  │
  │ 凭证/文档包  │ 风险稽核     │ 费用分析     │
  └─────────────┴─────────────┴─────────────┘

第二步: 参数配置（根据场景动态渲染表单）
  - 期间选择（年月/季度/年）
  - 筛选条件
  - 导出格式（PDF/Excel）

第三步: 生成与下载
  - 进度条（大批量时显示）
  - 下载按钮 + 历史导出记录（最近5次）
```

**拆分文件：**
```
pages/PdfExportPage.tsx           # 路由容器（3步流程）
pages/export/
  ExportSceneSelector.tsx         # 场景选择卡片网格
  ExportConfigForm.tsx            # 参数配置表单（动态）
  ExportProgress.tsx              # 生成进度 + 下载
  ExportHistoryList.tsx           # 历史导出记录
  useExport.ts                    # 导出状态管理
```

---

#### 3-C：RiskPage（风险勾稽）— 闭环链路可视化

**当前问题：**
风险列表可用，但"风险→任务→单据→凭证"的闭环路径对用户不可见

**V3.0 升级方案：**

```
顶部: 风险概览卡（高危/中危/低危数量 + 未闭环百分比）

主体: 风险列表（DataTable，按严重度分组，URL持久化筛选）
  筛选维度: 风险等级 / 风险类型 / 关联事项 / 关联合同 / 闭环状态

风险 Drawer（右侧 520px）:
  Tab 1: 风险详情（描述/发现日期/关联业务）
  Tab 2: 闭环链路（横向时间线）
    风险确认 → 生成任务 → 补充单据 → 凭证过账 → 风险关闭
    每步显示：完成状态/操作人/日期
  Tab 3: 关联证据（附件列表）

闭环操作（Drawer 内步骤化）:
  Step 1: 确认风险信息（核实描述是否准确）
  Step 2: 关联/生成任务（选择已有任务或创建新任务）
  Step 3: 补充证明材料（上传附件）
  Step 4: 标记关闭（填写处置说明，选择关联凭证）
```

---

#### 3-D：ReportsPage（报表）— 图表化

**当前问题：**
无任何图表，无期间对比，纯数字表格

**V3.0 升级方案：**

```
报表类型Tab（保留）+ 新增图表视图切换（表格/图表）:

资产负债表:
  - 表格视图：当期 + 上期对比列（差值 + ±%）
  - 图表视图：主要科目柱状图对比

利润表:
  - 表格视图：月度趋势
  - 图表视图：收入/费用/利润折线图（Recharts LineChart）

现金流量表:
  - 三活动分类（经营/投资/筹资）折叠展示
  - 图表视图：三活动瀑布图
```

**参考代码：**
```bash
reference/bigcapital/packages/webapp/src/containers/FinancialStatements/
reference/bigcapital/packages/webapp/src/containers/Dashboard/
reference/dubbl/app/  # Recharts 使用
```

---

#### 3-E：RndPage（研发辅助账）— 费用归集流程化

**当前问题：**
436 行，研发费用归集流程不可见，不符合加计扣除政策要求

**V3.0 升级方案：**

```
左侧: 研发项目列表（DataTable）
右侧 Drawer: 项目详情 + 费用明细

费用归集 4步向导:
  Step 1: 项目认定（确认是否符合加计扣除条件）
  Step 2: 费用归集（按类别：人员/设备/材料/外包/其他）
  Step 3: 分摊计算（多项目费用分摊规则）
  Step 4: 台账生成（PDF台账 + 推送到报税材料）

顶部: 本年累计研发投入 + 可加计扣除金额 KPI 卡片
```

---

#### 3-F：ChairmanDashboardPage（董事长驾驶舱）

**当前：** 252行，简单列表

**V3.0 升级为管理驾驶舱：**

```
顶部 KPI 卡片（4格）:
  ├── 💰 本月营收（vs 上月 ±%）
  ├── 💸 本月支出（vs 上月 ±%）
  ├── 🏦 账面现金余额
  └── ✅ 税务合规率（本月已申报/应申报）

中部图表区（2列）:
  ├── 左: 近6月收支趋势（Recharts AreaChart）
  └── 右: 本月费用分类占比（Recharts PieChart）

下部业务状态卡：
  ├── 🚨 风险告警（未闭环高危风险 N 项）
  ├── 📋 待处理任务（逾期 N 项 / 待开始 N 项）
  ├── 📄 单据待归档（N 项）
  └── 💼 合同到期预警（30天内到期 N 项）
```

**参考代码：**
```bash
reference/bigcapital/packages/webapp/src/containers/Dashboard/
reference/dubbl/app/dashboard/
reference/Cent/src/pages/  # 中文账本 Dashboard
```

---

#### 3-G：KnowledgePage（知识库）

**V3.0 升级：**
```
布局: 两栏
├── 左侧 (260px): 目录树（按类别/标签折叠）
└── 右侧: 文章正文（Markdown 渲染）

顶部: 全文搜索框（关键词高亮）
收藏 / 打印 / 分享功能
```

#### 3-H：AuditPage（审计日志）

**V3.0 升级：**
```
DataTable（antd Table，无限滚动分页）
筛选: 操作类型 / 操作人 / 时间范围 / 关联资源
导出: CSV / PDF
每行展开: 显示前后数据对比（diff视图）
```

#### 3-I：SettingsPage（系统设置）

**V3.0 升级（结构保留，体验优化）：**
```
表单改用 React Hook Form + Zod
公司信息: 增加Logo上传（antd Upload）
AI配置: 增加"连接测试"按钮（带 toast 反馈）
显示设置: 语言/时区/日期格式
保存操作: toast.success 反馈，自动保存草稿
```

---

## 六、实施路线图

### 里程碑

| 阶段 | 时间 | 内容 | 产出物 |
|---|---|---|---|
| **Phase 0** | 第1-3天 | 基础设施：antd配置/Token/通用组件/Hook | 8个通用组件，5个通用Hook |
| **Phase 1** | 第4-14天 | Events/Tasks/Documents/Vouchers | 4个模块完成重构 |
| **Phase 2A** | 第15-21天 | PayrollPage 拆分 + 6步向导 | 工资模块完成 |
| **Phase 2B** | 第22-26天 | TaxPage 左导航 + 申报向导 | 税务模块完成 |
| **Phase 2C** | 第27-31天 | ContractsPage 看板化 | 合同模块完成 |
| **Phase 2D** | 第32-34天 | LedgerPage Tab 深化 | 总账模块完成 |
| **Phase 3A** | 第35-39天 | AssistantPage 三区布局 | AI助手完成 |
| **Phase 3B** | 第40-43天 | PdfExportPage 场景化 | 导出中心完成 |
| **Phase 3C-I** | 第44-52天 | Risk/Reports/Rnd/Dashboard/其余模块 | 全部模块完成 |
| **测试验收** | 第53-56天 | E2E测试 + Bug Fix + 性能优化 | 可发布版本 |

**总计：约 8 周（56天）**

### 开发顺序依据

```
Phase 0 → 所有模块依赖（先建基础设施）
Phase 1 → 业务核心路径（Events→Tasks→Documents→Vouchers），
           用户最高频操作，最先上线获取反馈
Phase 2A/B → 工资和税务是核心盈利功能，优先
Phase 2C → 合同管理支撑工资和税务
Phase 3 → 辅助功能，在核心路径稳定后迭代
```

### 每个 Sprint 完成标准

- [ ] 页面功能与现有版本等价（无功能回退）
- [ ] 组件文件均 < 400 行
- [ ] 每个新组件有对应单元测试（Vitest）
- [ ] antd Token 替换所有内联样式
- [ ] URL 状态持久化（筛选/Tab/选中ID）
- [ ] Toast 替换所有 `message` 状态
- [ ] TypeScript 无 `any`，无 eslint 错误

---

## 七、文件结构规划

### V3.0 目标目录结构

```
apps/web/src/
├── main.tsx                       # ConfigProvider + theme + router
├── App.tsx                        # 路由定义
│
├── styles/
│   ├── tokens.css                 # CSS 变量 (颜色/间距/阴影)
│   ├── global.css                 # 全局基础样式
│   └── antd-override.css          # antd 样式覆盖
│
├── lib/
│   ├── antd-theme.ts              # antd 主题配置
│   ├── api.ts                     # API 调用（现有，扩展）
│   ├── i18n.ts                    # 国际化标签（现有）
│   └── entry-guidance.ts          # 引导文案（现有）
│
├── hooks/                         # 通用 Hook（新增）
│   ├── useSearchParams.ts
│   ├── useAsyncAction.ts
│   ├── useDrawer.ts
│   ├── useConfirm.ts
│   └── useTableFilter.ts
│
├── components/
│   └── ui/                        # 原子 UI 组件（新增）
│       ├── PageHeader.tsx
│       ├── StatusBadge.tsx
│       ├── PriorityBadge.tsx
│       ├── DataTable.tsx
│       ├── EntityDrawer.tsx
│       ├── StepWizard.tsx
│       ├── EmptyState.tsx
│       ├── ConfirmModal.tsx
│       └── AmountDisplay.tsx
│
├── pages/
│   ├── drilldown.ts               # 现有，保留扩展
│   ├── risk-scope.ts              # 现有，保留
│   ├── AssistantPage.tsx          # 路由容器（重构）
│   ├── assistant/                 # 拆出子组件（新增）
│   ├── ChairmanDashboardPage.tsx  # 重构为驾驶舱
│   ├── ContractsPage.tsx          # 路由容器
│   ├── contracts/                 # 拆出子组件
│   ├── DocumentsPage.tsx
│   ├── documents/
│   ├── EventsPage.tsx
│   ├── events/
│   ├── KnowledgePage.tsx
│   ├── LedgerPage.tsx
│   ├── ledger/
│   ├── PayrollPage.tsx            # 路由容器（<60行）
│   ├── payroll/                   # 拆出子组件
│   ├── PdfExportPage.tsx
│   ├── export/
│   ├── ReportsPage.tsx
│   ├── reports/
│   ├── RiskPage.tsx
│   ├── risk/
│   ├── RndPage.tsx
│   ├── rnd/
│   ├── SettingsPage.tsx
│   ├── TasksPage.tsx
│   ├── tasks/
│   ├── TaxPage.tsx
│   ├── tax/
│   ├── VouchersPage.tsx
│   └── vouchers/
│
└── features/                      # 跨页面功能域（现有，保留扩展）
    └── process-flow/
```

---

## 八、后续持续开发方向

### 8.1 V3.1：移动端适配
- 响应式布局（Drawer → BottomSheet on mobile）
- 核心操作优化：移动端工资审批、合同签署
- PWA 支持（离线查看报表）

### 8.2 V3.2：批量操作与自动化
- 批量凭证审核（勾选 + 一键审核）
- 凭证模板（常用分录保存为模板，一键填充）
- 税务申报自动触发（期间锁账后自动推送到申报队列）
- 合同到期自动提醒（企业微信/钉钉 Webhook）

### 8.3 V3.3：数据分析增强
- 自定义报表（拖拽字段配置报表）
- 多期间对比（同比/环比）
- 预算 vs 实际对比分析
- 现金流预测（基于历史趋势）

### 8.4 V3.4：审批流程
- 可配置审批链（凭证审批/合同审批/工资审批）
- 多级审批（财务/负责人/董事长三级）
- 审批消息推送
- 委托代理审批

### 8.5 V3.5：协作与权限精细化
- 字段级权限（部分角色只能看特定列）
- 操作历史回滚（凭证反冲自动生成）
- 实时协作状态（谁在看同一个凭证）
- 数据导入增强（Excel批量导入员工/事项/凭证）

### 8.6 V4.0 展望：AI 深度集成
- AI 自动生成凭证分录（从事项描述）
- AI 税务风险预警（异常科目余额自动分析）
- AI 合同条款风险识别
- AI 辅助工资政策合规检查
- 大模型本地化（Ollama 深度集成，数据不出网）

---

## 附录：参考仓库功能对照表

| 功能模块 | 参考仓库 | 具体路径 |
|---|---|---|
| antd Table/Form/Drawer | bigcapital | `packages/webapp/src/containers/` |
| Dashboard KPI + 图表 | bigcapital | `packages/webapp/src/containers/Dashboard/` |
| AI对话 + OCR | TaxHacker | `app/(app)/`, `components/transactions/` |
| 凭证录入（双式） | frappe/books | `src/`, `models/Transactional/` |
| 工资计算流程 | HR-management | 全仓库 |
| 中文账本UI | Cent | `src/pages/`, `src/components/` |
| 发票/单据Drawer | Invio | `frontend/` |
| Recharts图表 | dubbl | `app/`, `components/` |
| Zod+RHF表单 | TaxHacker, dubbl | `forms/`, `components/` |
| 税务合规流程 | Tunisian-ERP | 全仓库 |
| Xero/QB风格ERP | accountinghub | `src/` |
| 中文记账UI | ZhiZhang-Desktop | `src/` |

---

> 本文档作为 V3.0 开发的权威参考。每个 Phase 开始前以此为基准进行实施规划，
> 完成后更新对应章节的实施状态。
>
> 下一步：确认 Phase 0 开始执行，或调整某个具体模块的优先级。
