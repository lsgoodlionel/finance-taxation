# V7 升级蓝图与并行开发计划 — 双轨 UX：非财务引导线 × 财务专业线

> 日期：2026-07-15
> 编制方式：全代码库三路实证摸底（导航/RBAC 实现 · 26+ 页面逐页 UX 评估 · docs 全量规划文档复盘）+ 承接 `docs/v6-upgrade-blueprint-and-parallel-plan.md`
> 基线：`main`（V6 Stage F/G 已合入：导航 26→17、票据/导出/工资/系统四大合并、inbox-first 默认落地；Stage H 纯核心 + wave2 后端接线待前端消费）
> 定位：V5 解决「工程底座」，V6 解决「串联收口 + AI 月结内核」，**V7 解决「人」——把同一套系统分成两条体验轨道：① 非财务人员（董事长/高管/行政/人事/业务）全程引导、白话、极简；② 财务专业人员高效、批量、专业。全面优化整个界面，尤其是非财务线。**

---

## 执行进展 · Stage J–M 全部收口（更新 2026-07-16）

> 四个 Stage 均已合入 `main`（PR #13/#14/#15/#16），每 Stage 采用「主控先落共享契约文件 → 多 agent 车道并行（严格文件所有权）→ 主控共享文件接线 + 全量门禁」的协作模式。每次合并前门禁：typecheck 绿 · API 单测 388/388 · Web 单测全绿 · 生产构建通过 · 本地 V4 全栈 docker Playwright 全量绿 · CI 三检查通过。

### Stage J 双轨壳层与角色分流（PR #13，分支 `codex/v7-stage-j`，2 车道）

| 车道 | 落地 |
|---|---|
| U1 双轨地基 | `lib/workspace-mode`（guided/pro 角色推导 + 顶栏 Segmented 切换 + localStorage 记忆）；导航权限化：AppLayout 消费 `/api/access/menu`（后端菜单 11→19 项含分组元数据），`nav-filter` 纯函数过滤 + 失败降级放行；guided 浅色扁平 5 项导航；首页按模式分流；主色统一 `#2563eb` + guided density token |
| U2 术语与帮助 | `lib/terminology` 38 词条 + `<Term>` 组件（pro 原词 hover 释义 / guided 白话括注），首批落地月结看板/凭证页/驾驶舱 20 处；统一 `HelpPanel`（五段结构）+ `LevelLegend`，迁移 Events/Risk/Tax/Documents 四处旧 HelpModal，**修复凭证页空壳帮助按钮**，补齐总账/报表帮助 |

集成阶段收获：E2E 基线 fixture 预置 pro 模式 + 新增 guided 落点专项用例；**暴露并修复既有生产缺陷**——`/v2/*` 4 个接口不在 nginx 代理内，容器化部署下驾驶舱页 JSON 解析必错（老基线从不访问该页故未曾暴露）。验证：web 单测 62 · docker E2E 44/44。**M7.0 达成**。

### Stage K 非财务引导线（PR #14，分支 `codex/v7-stage-k`，3 车道 + 主控集成，+3912 行）

| 车道 | 落地 |
|---|---|
| U3 老板工作台 | `/home` 三段式一屏（guided 默认首页）：需要您处理的事（AI 草稿/审批/风险白话卡 ≤3 张，双轨 `ApprovalCard`，卡上批准/驳回）· 公司现在怎么样（现金 runway/本月利润/税负/风险 4 张红绿灯 KPI）· 问 AI 常驻输入框（带 initialPrompt 深链直达助手）+ 场景卡；四路 `allSettled` 单路失败不拖垮整页；K3 白话报告：guided 报表页默认自动生成老板摘要、专业三表折叠，驾驶舱黑话统计折进「财务细节」 |
| U4 记一笔 | `/quick-entry` 3 步向导（非财务唯一录入口）：拍照 OCR 或一句白话（本地正则打底 + AI 增强，AI 不可用全程可降级手填）→ 白话确认卡 + 缺发票提醒 → 落经营事项 + 自动拆补票任务 + AI 分录草稿 fire-and-forget；测试断言全程无「科目/借方/贷方」 |
| U5 场景引导 v3 | 场景动词 guided 12 个白话 + pro 专属 4 个，CommandPalette 按模式过滤（「记一笔」双模式分流）；分模式新手 checklist（guided 白话三件事）；`NextStepBar` 下一步条落地事项页 |

主控集成：/home、/quick-entry 路由与后端菜单接线、guided 导航定稿 6 项（今天/问 AI/记一笔/我的事项/审批与待办/经营报告）、`GUIDED_ONLY_ROUTES` 子集断言、清单卡改插槽注入以保住呈现层纯净约定。验证：web 单测 73 · docker E2E 44/44。**M7.1 达成**（批准 ≤2 次点击的显式断言留待 Stage M 落地）。

### Stage L 财务专业线效率深化（PR #15，分支 `codex/v7-stage-l`，3 车道，+2055 行）

| 车道 | 落地 |
|---|---|
| LA 草稿批量复核 | inbox AI 草稿队列：勾选/全选/**按同类勾选**（凭证类型+科目组合分组）+ 批量批准/驳回（顺序执行 + 进度 + 单条失败不中断汇总）+ 借贷合计校验显示 + 来源事项回溯；批准语义不变（仅产 draft 凭证） |
| LB 凭证效率 | 键盘 j/k/x/a/Enter（a 键按状态智能执行下一步）；批量审核（先校验后审核）+ 批量过账（Modal.confirm 列凭证号与合计金额强确认）；**校验失败修复建议**：借贷差额与方向、缺科目精确到行号、空行检测、建单指引 |
| LC 工作台细节 | 主控契约 `lib/use-list-hotkeys`（含输入框/弹层守卫）+ 单测；会计期间 `[` `]` 快切（跨年进位纯函数）；表格密度紧凑/舒适开关（localStorage 记忆，pro 专属）；月结页补 HelpPanel（J 阶段唯一遗漏页） |

验证：web 单测 79 · docker E2E 44/44。**M7.2 达成**（月结向导接 close-plan 与异常合流经核实在 V6 Stage H 已交付）。

### Stage M 清创、拆分与双轨验证（PR #16，M1 主控 + 4 车道）

- **M1 清创**（逐一验证零引用）：删 `PdfExportPage`(688 行)/`ArchivePackagePage`/旧导出壳层共 7 文件；**修正本蓝图 §1.3 认知**——`pages/export/` 11 个 Panel 仍被导出中心复用，非死代码，保留。
- **M2 巨型页零行为拆分**（3 车道并行，中文文案集合比对零漂移，导出名与路径不变）：

| 页面 | 前 | 后 | | 页面 | 前 | 后 |
|---|---|---|---|---|---|---|
| PayrollPage | 703 | 295 | | ContractsPage | 562 | 239 |
| SettingsPage | 671 | 66 | | TaxPage | 449 | 175 |
| EventsPage | 636 | 256 | | PayrollTransferPage | 445 | 160 |

- **M3 双轨 E2E**（`tests/e2e/smoke/v7-dual-track.spec.ts`，6 用例 ×2 设备，实跑驱动编写）：guided 批准一笔**实测 1 次点击**（断言 ≤2，M7.1 验收闭环）· 记一笔恒 3 步且全程无借贷科目黑话 · guided 报表默认老板摘要 · pro 批量批准 + 月结 8 步 · 旧路由重定向 ×4 · **M4-lite** 375×812 视口无横向滚动 + 触控高度 ≥40px；数据准备幂等（属期×project 双维隔离 + 唯一标题），连续 3 次重跑稳定。
- **实测暴露 2 个后端并发竞态**（本 Stage 不改后端，已派生独立修复任务）：① `POST /api/events` 用 `evt-${Date.now()}` 做主键，同毫秒并发撞键 500；② `close/drafts/generate` 查询+插入非原子，同属期并发撞固定 id。

验证：web 单测 78 · 重建栈后 docker E2E **56/56**（44 既有 + 12 新增）。**M7.3 达成**。

### 里程碑评分卡（终局）

| 里程碑 | 状态 | 证据 |
|---|---|---|
| M7.0 分轨 | ✅ | 双模式可切换 · 导航消费 RBAC menu · guided ≤6 项 · Term/HelpPanel 3+3 页生效 |
| M7.1 老板可用 | ✅ | /home 三段式 · 批准一笔实测 1 次点击（E2E 断言 ≤2）· 记一笔 3 步（E2E 断言）· KPI 白话卡 4 张 · 移动优先布局 |
| M7.2 财务提效 | ✅ | 草稿队列批量批准 · 月结接 close-plan（V6-H 交付）· 专业页 HelpPanel 100% · 链路条覆盖收尾核实 |
| M7.3 收口 | ✅ | 高频术语释义覆盖 · 无 >500 行页面（最大 295）· 死代码清零 · 双轨 E2E 56/56 · M4-lite 响应式断言 |

### 遗留项（V8 输入）

1. 后端并发竞态修复（events 主键 / close-drafts 幂等）——已派生任务，另行 PR；
2. K5 企微/飞书推送深链（外部凭证依赖，代码槽位已就绪）；
3. 深度 a11y：全站键盘可达审计、reduced-motion（本轮仅做 M4-lite 移动断言）；
4. 已知 flaky：`exports/routes.integration.test.ts`「reuse opened job」断言 CI 偶发（历史修过一次），失败先重跑再判断。

---

## 0. 执行摘要（TL;DR）

- **现状**：功能纵深完整（17 项导航 / 206+ API / 财税链路条 / 月结向导 / AI 草稿后端闭环），但体验是「一套界面服务所有人」——侧栏 `navItems` 硬编码不按角色过滤（后端 `getMenu` 的 RBAC 过滤能力被闲置）；老板打开系统看到的和会计完全一样：17 项菜单、过账/分录/计提/勾稽等高密度术语（全站「过账」×29、「分录」×27、「锁账」×24 处，逐字段零 hover 释义）。
- **非财务用户 Top 5 障碍（逐页评估实证）**：① 专业术语零解释、密度极高；② 新旧两套页面并存 + 死代码（`PdfExportPage` 688 行等孤儿文件）造成双重负担；③ 面向老板的页面仍泄漏财务黑话（驾驶舱「已过账凭证/待提交税务批次」）；④ 引导质量严重不均——最难的页面（凭证/总账/报表）反而最无助（凭证页问号按钮是空壳）；⑤ 巨型页面信息过载（EventsPage 655 行、TaxPage 449 行），缺「我现在该点哪一步」的强指引。
- **V7 主线**：**双轨工作区（Workspace Mode）**。登录即按角色分流：非财务角色进「引导模式」（≤6 项导航、白话术语层、场景向导录入、一键审批、问 AI 为主入口）；财务角色进「专业模式」（现有 17 项 + 效率增强：批量、快捷键、引导补齐）。两轨共享同一套数据、权限、审计与 AI 底座，只是**呈现层分轨**。
- **量化目标**：老板「批准一笔 AI 草稿」≤ 2 次点击；非财务「记一笔/传票据」≤ 3 步（拍照/上传 → AI 识别 → 确认）；高频术语 hover 释义覆盖 100%；引导模式导航 ≤ 6 项；无 >500 行页面文件；双轨 E2E 冒烟全绿。
- **四个 Stage**：J 双轨壳层与角色分流（地基）→ K 非财务引导线（重点投入）→ L 财务专业线效率深化 → M 统一打磨、清创与验证。拆 8 条并行车道（U0–U7）。

---

## 1. 现状核查（2026-07-15 三路实证）

### 1.1 角色与导航：RBAC 已有、呈现层未用

| 事实 | 证据 |
|---|---|
| 后端已定义 **9 角色**：chairman / finance-director / accountant / cashier / tax-specialist / auditor / employee / viewer（+ hr 等设计目标见 `rbac-organization-model.md`） | `apps/api/src/middleware/auth.ts:16-76` `ROLE_PERMISSIONS` |
| 权限目录 26 个 `xxx.view/manage/post` 键，`requirePermission` 中间件已生效 | `packages/domain-model/src/index.ts:1031-1059` |
| 后端 `/api/access/menu` 已按角色过滤菜单 | `apps/api/src/modules/access/routes.ts:14-38` |
| **前端侧栏 `navItems` 硬编码，不消费 menu 接口**——所有角色看到同样 17 项 | `apps/web/src/components/AppLayout.tsx:68-135`；`getMenu()` 唯一消费者是流程图节点权限（`features/process-flow/ProcessFlowCard.tsx:377`） |
| 老板/财务的角色分野只体现在：assistant boss/staff 视角切换、`BOSS_ROLES` 后端判定、审批终审角色 | `pages/assistant/constants.ts` · `assistant/routes.ts:11` · `runtime/summary.ts:58-62` |

**结论**：双轨的权限地基已经存在，缺的全部是呈现层——这是 V7 成本可控的根本原因。

### 1.2 逐页 UX 评估摘要（非财务视角）

| 页面 | 友好度 | 主要问题 |
|---|---|---|
| `/inbox` 我的一天（207 行） | ★★★★★ 全仓最好 | 快速开始清单/四类待办卡/空状态庆祝均佳；但「月度结账」按钮对老板突兀 |
| `/dashboard/chairman`（190 行） | ★★★★ | summary-first 结构清晰，但「已过账凭证」「待提交税务批次」黑话无解释 |
| `/assistant`（334+736 行） | ★★★★ | boss 快捷语已白话；流程节点仍暴露「税务归档」等术语 |
| `/events`（655 行） | ★★★ | 有 HelpModal 但单页塞列表+创建+详情+AI 四区块，信息过载 |
| `/vouchers`（345 行） | ★★ | 术语密度高；**问号帮助按钮是空壳（`VouchersPage.tsx:249` 无 onClick）** |
| `/ledger`（341 行） | ★ | 5 场景纯专业工具，无 HelpModal；非财务不应进入 |
| `/reports` | ★★ | 三表工作台，几乎零引导 |
| `/tax`（449 行） | ★★ | 4 步申报向导是亮点，但底稿/销项进项术语密度全站最高 |
| `/close`（91 行） | ★★★ | 8 步状态机看板结构好，每步名词（结转损益/权责发生制）无 tooltip |
| `/risk`（326 行） | ★★★ | **风险级别解释表是全仓最佳术语解释实践**，值得组件化推广 |

引导资产盘点（可复用）：`entry-guidance.ts` 双主入口文案 · `scene-commands.ts` 6 个场景动词 · CommandPalette ⌘K · GlobalPeriodPicker · 快速开始 checklist · FinanceFlowBar 链路条 · `StepWizard`/`EmptyState`/`ResultBanner`/`PageSkeleton` UI 原语 · Events/Risk/Tax/Documents 四个 HelpModal · 工资 6 步向导 · 增值税 4 步向导 · 月结 8 步看板。

### 1.3 技术债（V7 顺手清偿项）

1. **死代码**：`PdfExportPage.tsx`（688 行）、`ArchivePackagePage.tsx`、整个 `pages/export/`（16 文件）无人引用；
2. **降级为 Tab 的旧巨型页未瘦身**：PayrollPage 703 · SettingsPage 671 · EventsPage 655 · ContractsPage 562 · TaxPage 449 · PayrollTransferPage 445；
3. **设计 token 不一致**：`styles/tokens.css` 主色 `#4f8ef7` vs Antd 主题 `#2563eb`（`main.tsx:12-56`）；
4. HelpModal 各页内联重复实现，无统一组件；
5. Stage H 前端消费缺口：inbox「AI 草稿」卡是占位，`/api/close/drafts`、`/api/ledger/close-plan`、`/api/anomaly/scan` 已就绪未接前端。

---

## 2. 双轨用户模型与设计北极星

### 2.1 两条轨道的定义

| | **轨道 A · 引导模式（Guided）** | **轨道 B · 专业模式（Pro）** |
|---|---|---|
| 服务对象 | 董事长/创始人、总经理/COO、行政、人事、研发/销售负责人、员工——**不懂借贷记账的所有人** | 财务总监、会计、出纳、税务专员、审计员、外部顾问 |
| 默认角色映射 | chairman · employee · viewer（+未来 hr/admin/rnd/sales 角色） | finance-director · accountant · cashier · tax-specialist · auditor |
| 核心心智 | **「告诉我该做什么，我确认就行」**——系统主动推事、白话解释、一键完成 | **「让我最快做完专业工作」**——inbox-first、批量、键盘、链路可溯 |
| 首页 | 老板工作台 `/home`（今日必办 ≤3 件 + 白话经营概况 + 问 AI） | `/inbox`（现有，四类卡 + AI 草稿队列） |
| 导航 | **≤ 6 项**：今日 · 问 AI · 记一笔 · 审批 · 经营报告 · 我的事项 | 现有 17 项，按 RBAC 过滤（修复硬编码） |
| 语言 | 白话术语层：全部财务名词自动附白话释义或直接替换 | 专业术语保留，hover 释义可选 |
| 录入 | 只走**场景向导**（拍照/上传→AI 识别→确认），永不接触科目/借贷 | 保留专业表单 + 向导双通道 |
| 审批 | draft-then-approve 卡片：白话摘要 + 影响说明 + 一键批准/驳回 | 草稿队列批量复核（借贷全显） |
| 移动 | PWA 审批为一等公民 | 桌面为主 |

**互通规则**：模式由角色决定默认值，但用户可在顶栏手动切换（chairman 可切专业模式查账；财务可切引导模式体验老板视角），选择记忆在 localStorage + 用户偏好；深链跨模式跳转时自动带出目标页所属模式。**两轨共用同一路由树、同一 API、同一权限与审计**——引导模式是「过滤+翻译+重组」，不是第二套系统。

### 2.2 北极星与硬原则

> **一句话北极星：让董事长像用微信一样用财税系统——推给他的每件事都能看懂、每个决定都敢按、每次录入不超过 3 步；同时让会计比用金蝶更快。**

硬原则（继承 V2/V3/V6 并加严）：

1. **双轨不分叉数据**：任何业务对象两轨可见性只由 RBAC 决定，呈现差异只在文案/布局/密度；
2. **AI 只产草稿，入账必经人批准**（V6 铁律不变），引导模式的「一键批准」按钮背后仍是既有 `/vouchers/:id/post` 双门；
3. **白话不失真**：术语翻译只做「解释性附加」，法定名词（如报表科目、申报表字段）在导出与正式单据中永远保留原文；
4. 继承 V3 六原则：Stepper-First · Drawer-Default · URL-State-First · Progressive Disclosure · 统一反馈 · Component-First（页面 <500 行、组件 <300 行）；
5. 每个页面回答三个问题：**我在哪（链路条）· 我该做什么（主行动区）· 做完去哪（下一步条）**。

---

## 3. 双轨体验蓝图（设计方案）

### 3.1 共享地基：Workspace Mode 壳层

- **模式上下文** `lib/workspace-mode.ts`：`useWorkspaceMode()` → `'guided' | 'pro'`；由 `/me` 的 roleIds 推导默认值，可手动覆盖；
- **AppLayout 分轨**：`navItems` 改为消费 `/api/access/menu`（后端按角色过滤）+ 前端按 mode 二次收敛。guided 侧栏浅色轻量（区别于 pro 深色 `#0f172a`），项数 ≤6，图标+大字号；顶栏加模式切换器（带「专业模式」标签，防止误入无法回头）；
- **术语字典** `lib/terminology.ts` + `<Term>` 组件：集中维护 30+ 高频术语（过账/分录/凭证/计提/结转/勾稽/底稿/锁账/销项/进项/权责发生制/加计扣除…）的 `{ 白话短语, 一句话解释, 详细说明 }`。pro 模式渲染原词 + hover 释义；guided 模式渲染白话短语（原词括注）。风险页「级别解释表」模式抽为通用 `<LevelLegend>`；
- **HelpModal 标准化** `components/ui/HelpPanel.tsx`：统一「本页负责什么 / 上下游关系 / 标准流程 / 常见操作 / ⚠️ 注意」五段结构，Events/Risk/Tax/Documents 四个现有 HelpModal 迁入，**补齐 Vouchers（修空壳按钮）/ Ledger / Reports / Close**；
- **空状态下一步建议**：`EmptyState` 增加 `nextAction` 插槽（文案 + 按钮 + 可选示例数据一键生成），全站空状态不允许只说「暂无数据」；
- **设计 token 统一**：以 Antd `#2563eb` 为准修 `tokens.css`，guided 模式追加一组更大字号/更松间距的 density token。

### 3.2 轨道 A · 非财务引导线（重点投入）

**A1 老板工作台 `/home`（新页，guided 默认首页）**

三段式，一屏内完成 90% 日常：

1. **「需要您处理的事」**（顶部，≤3 张卡）：审批请求 / AI 草稿确认 / 高危风险，每张卡 = 白话标题（「张三提交了 5.2 万元的服务器采购付款，等您批准」）+ 影响说明（「批准后将从公司账户支出，本月现金还剩 X」）+ 【批准】【驳回】【问 AI】三键。数据源：现有 inbox 四类卡 + `/api/close/drafts`；
2. **「公司现在怎么样」**：驾驶舱 KPI 白话化重组——现金还能用几个月（cash runway，接现有现金流预测）/ 本月赚了多少 / 要交多少税 / 有没有风险，四个大数字 + 红绿灯，点击下钻驾驶舱详情；
3. **「问 AI / 快捷场景」**：常驻输入框直达 assistant boss 视角 + 场景卡（记一笔 / 传票据 / 看报告 / 发工资到哪一步了）。

`/dashboard/chairman` 保留为「经营报告」下钻页，黑话卡片（已过账凭证数等）在 guided 模式下翻译或折叠进「财务细节」。

**A2 「记一笔」极简录入（新场景向导，guided 核心动作）**

非财务人员唯一的录入入口，3 步封顶：

1. **说清楚发生了什么**：拍照/上传票据（复用 SmartUpload 管道 + AI 识别）或一句白话（「昨天请客户吃饭花了 800」）→ AI 识别出类型/金额/日期/对方；
2. **确认**：白话摘要卡（「业务招待费 800 元，2026-07-14，需要发票才能税前扣除——检测到您还没传发票」）+ 缺件提醒；
3. **完成**：落为经营事项 + 自动任务（补发票）+ AI 分录草稿进财务的 inbox 队列。**非财务用户全程不见科目与借贷。**

复用：EventCreatePanel 字段模型、assistant OCR 直传、Stage H `buildDraftProposal`。

**A3 一键审批与移动端**

- 审批卡组件 `<ApprovalCard>` 双轨复用（guided 白话版 / pro 借贷全显版），驱动同一审批 API；
- PWA 深化（承接 V6 I4）：guided 首页与审批卡移动端优先布局、BottomSheet 详情，推送到企微/飞书（已有 provider）点开即达审批卡。

**A4 白话经营报告**

`/reports` 在 guided 模式下默认落「老板摘要」Tab（已有 boss summary 能力）：先讲结论（「本月净利润 12 万，比上月多 3 万，主要因为……」），三大报表折叠为「想看专业报表」入口。

**A5 全程陪跑引导**

- 场景动词扩展（`scene-commands.ts`）：guided 模式的 ⌘K 与首页场景卡共用，增加「查一笔钱去哪了 / 给员工报销 / 客户要发票」等业务动词；
- 新手引导升级：快速开始 checklist 按模式分内容（guided：完善公司信息→传第一张票→问 AI 一个问题；pro：科目→期初→首笔凭证）；
- 每个 guided 页面底部固定「下一步」条：做完 A 建议做 B（复用 FinanceFlowBar 数据但白话呈现，如「票已上传 → 等财务入账（无需您操作）」）。

### 3.3 轨道 B · 财务专业线（效率深化）

- **B1 AI 草稿队列上线**（Stage H 前端消费收口）：inbox「AI 草稿」占位卡接 `/api/close/drafts`——列表页借贷全显、来源事项一键回溯、逐张批准/驳回 + **同类批量批准**（同模板同科目一次勾选）；月结向导接 `/api/ledger/close-plan` 实时状态；异常预警接 `/api/anomaly/scan` 并与风险页合流；
- **B2 键盘与批量**：inbox/凭证/单据列表支持 j/k 移动、x 勾选、a 批准、Enter 详情；批量过账、批量归档、批量催办；⌘K 增加财务动词（结转损益 / 锁 6 月账 / 出 6 月底稿）；
- **B3 引导补齐（对专业用户同样有价值）**：Vouchers/Ledger/Reports/Close 补 HelpPanel；Close 8 步每步名词加 `<Term>` 释义；凭证校验失败信息带修复建议（差多少、差在哪边）；
- **B4 链路条全覆盖收尾**：Reports/Ledger/票据中心/导出中心全部挂 FinanceFlowBar（G5 已扩总账，补齐剩余），每个结果页固定「← 来源 / 下一步 →」；
- **B5 密度与工作台**：pro 模式表格紧凑密度开关、列配置记忆、GlobalPeriodPicker 键盘快切（[ ] 上下月）。

### 3.4 页面 × 双轨矩阵（呈现策略速查）

| 页面 | guided 模式 | pro 模式 |
|---|---|---|
| `/home`（新） | 默认首页 | 不出现（可从模式切换预览） |
| `/inbox` | 不出现（内容并入 /home） | 默认首页 + AI 草稿队列 |
| `/assistant` | 一级入口「问 AI」，锁 boss 视角 | 一级入口，staff 视角 |
| `/events` | 「我的事项」——只看自己发起/相关的，创建走「记一笔」向导 | 全量事项总线 |
| `/dashboard/chairman` | 「经营报告」下钻页（白话化） | 保留 |
| `/reports` | 老板摘要 Tab 优先 | 三表工作台 + 预算差异 |
| `/vouchers` `/ledger` `/tax` `/close` `/bills` `/export-center` | **不在导航**；深链进入时顶部横幅「这是财务专业页面」+ 白话释义开启 | 完整能力 + B 系增强 |
| `/payroll` | 只出现审批环节卡片（在 /home） | 6 步向导全流程 |
| `/risk` | 高危风险以白话卡进 /home | 完整勾稽工作台 |
| `/settings` | 仅公司信息/个人偏好 | 系统中心全量 |

---

## 4. V7 升级蓝图（四 Stage）

### Stage J — 双轨壳层与角色分流（1–1.5 周，P0，地基）

- **J1 Workspace Mode 上下文**：`lib/workspace-mode.ts` + `/me` 角色推导 + 手动切换 + 记忆；
- **J2 导航权限化**：AppLayout 消费 `/api/access/menu`（后端 `ALL_MENU_ITEMS` 11 项扩到 17 项现导航全集），guided/pro 双侧栏渲染；登录默认落页按模式分流（guided→`/home`，pro→`/inbox`）;
- **J3 术语字典与 `<Term>` 组件**：30+ 词条 + 单测（词条完整性）；先在 Close/Vouchers/驾驶舱三处落地验证；
- **J4 HelpPanel 统一组件** + 四个现有 HelpModal 迁移 + Vouchers 空壳按钮修复；
- **J5 token 统一与 guided density**：修 `#4f8ef7`→`#2563eb`，新增 guided 字号/间距 token。

### Stage K — 非财务引导线（2 周，P0，重点投入，依赖 J）

- **K1 老板工作台 `/home`**：三段式布局 + `<ApprovalCard>` 双轨组件 + KPI 白话化（cash runway 卡接现金流预测）；
- **K2 「记一笔」3 步向导**：`pages/quick-entry/`，SmartUpload + AI 识别 + 白话确认卡 → 事项+任务+AI 分录草稿；
- **K3 白话经营报告**：reports 老板摘要 Tab 优先 + 驾驶舱黑话卡翻译；
- **K4 场景引导 v3**：场景动词扩容（guided 业务动词 ≥10）+ 按模式分内容的新手 checklist + guided「下一步」条；
- **K5 移动审批**：/home 与审批卡 PWA 优先布局 + 企微/飞书推送深链（承接 V6 I2/I4）。

### Stage L — 财务专业线效率深化（1.5–2 周，P1，可与 K 并行）

- **L1 AI 草稿队列**（B1，Stage H 收口）：inbox 草稿卡 + 批量批准 + 月结向导接 close-plan + 异常合流风险页；
- **L2 键盘与批量**（B2）；
- **L3 专业页引导补齐**（B3）：HelpPanel ×4 + Close 步骤 `<Term>` + 校验失败修复建议；
- **L4 链路条收尾 + 密度开关**（B4/B5）。

### Stage M — 清创、打磨与验证（1 周，P1）

- **M1 死代码清创**：删 `PdfExportPage`/`ArchivePackagePage`/`pages/export/`（16 文件）；
- **M2 巨型页拆分**：PayrollPage 703 / SettingsPage 671 / EventsPage 655 / ContractsPage 562 / TaxPage 449 / PayrollTransferPage 445 → 全部 <500 行（Tab 子件下沉轻壳，消除嵌套 hero）；
- **M3 双轨 E2E**：guided 冒烟（登录→/home→批准一张草稿→记一笔 3 步→看报告）+ pro 冒烟（inbox→批量批准→月结向导推进一步）+ 旧路由重定向回归；
- **M4 a11y 与响应式回归**：guided 大字号布局 320/768/1024 三断点、键盘可达、reduced-motion。

### 里程碑

| 里程碑 | 验收标准 |
|---|---|
| **M7.0 分轨** | 双模式壳层可切换 · 导航消费 RBAC menu · guided 导航 ≤6 项 · `<Term>`/HelpPanel 在 3+3 页生效 |
| **M7.1 老板可用** | /home 三段式上线 · 「批准一笔」≤2 次点击（E2E 断言）· 「记一笔」≤3 步 · KPI 白话卡 4 张 · 移动审批可用 |
| **M7.2 财务提效** | AI 草稿队列 + 批量批准 · 月结向导接 close-plan · 专业页 HelpPanel 100% · 链路条覆盖全部结果页 |
| **M7.3 收口** | 高频术语 hover 释义 100% · 无 >500 行页面 · 死代码清零 · 双轨 E2E 全绿 · a11y 回归通过 |

---

## 5. 并行车道分派（可直接开工）

沿用既有协作模型：每车道独立 worktree + `codex/v7-*` 分支；共享文件仅集成车道可改。

**高冲突共享文件（业务车道禁改，走集成窗口）**：`apps/web/src/App.tsx` · `AppLayout.tsx` · `lib/api.ts` · `lib/entry-guidance.ts` · `styles/tokens.css` `global.css` · `apps/api/src/modules/access/routes.ts` · `packages/domain-model/src/index.ts`。

| 车道 | 分支 | 范围 | 依赖 | 完成定义 |
|---|---|---|---|---|
| U0 集成/共享文件 | `codex/v7-integration` | 唯一可改共享文件；每日合并窗口 | — | 模式壳层/导航/路由变更全部经此合入，CI 全绿 |
| U1 双轨地基 | `codex/v7-mode-shell` | J1/J2/J5：workspace-mode、双侧栏、menu 接口扩容（经 U0） | — | M7.0 壳层项 |
| U2 术语与帮助 | `codex/v7-terminology` | J3/J4：terminology.ts、`<Term>`、HelpPanel + 迁移 | — | 词条 ≥30 + 6 页落地 + 单测 |
| U3 老板工作台 | `codex/v7-boss-home` | K1/K3：/home、ApprovalCard、KPI 白话卡、白话报告 | U1/U2 | M7.1 前三项 |
| U4 记一笔向导 | `codex/v7-quick-entry` | K2：quick-entry 3 步向导 + SmartUpload 复用 | U1 | 「记一笔」≤3 步 E2E |
| U5 引导与移动 | `codex/v7-guidance-mobile` | K4/K5：场景动词 v3、分模式 checklist、PWA 审批、推送深链 | U3 | guided 动词 ≥10 · 移动审批可用 |
| U6 财务效率线 | `codex/v7-pro-efficiency` | L1–L4：AI 草稿队列、批量/键盘、HelpPanel 补齐、链路条收尾 | U2 | M7.2 全项，**L1 涉账务呈现：PR + SME 评审** |
| U7 清创与验证 | `codex/v7-cleanup-e2e` | M1–M4：死代码、大页拆分、双轨 E2E、a11y | U3/U6 后收尾 | M7.3 全项 |

```
波次 1（并行）：U1 双轨地基 · U2 术语帮助 · U6 财务效率线（L1 后端已就绪可先行）
波次 2（并行，依赖波次 1 合入）：U3 老板工作台 · U4 记一笔 · U5 引导移动
波次 3（收尾）：U7 清创与验证
```

**每车道验收门禁（沿用 V5/V6 八项）**：typecheck 绿 · 车道单测绿 · 相关 E2E 绿 · 无新增 CRITICAL · 不触共享文件（或经 U0）· PR 含范围/验证/风险/回滚 · 高风险域（U6-L1 账务呈现、审批链路）SME 评审 · 进度板回写。

**度量埋点（贯穿验收）**：关键动作点击数（批准/记一笔/月结推进）在 E2E 中断言步数；guided/pro 模式切换与场景动词使用写入现有审计/统计管道，为 V8 迭代提供真实使用数据。

---

## 6. 立即启动的 3 件事

1. **U1 + U2 双车道开工**（无外部依赖、共享文件改动小、全部后续车道的地基）：先出 workspace-mode + 导航权限化 + 术语字典三个 PR；
2. **U6-L1 AI 草稿队列前端消费**：后端 `/api/close/drafts` 等三组接口已经真实 PG 验证就绪（V6 Stage H wave2），接上即形成「AI 起草 → 财务批量批准 → 老板一键终审」的完整演示链，是 V7 对内对外的最强卖点；
3. **/home 信息架构 1 页纸评审**：三段式卡片的白话文案口径（尤其「影响说明」如何措辞不误导决策）建议先与真实老板用户过一遍再动手——这是 V7 唯一强主观的设计决策。

---

## 附录 · 关键证据索引

- 侧栏硬编码：`apps/web/src/components/AppLayout.tsx:68-135`；后端 RBAC menu：`apps/api/src/modules/access/routes.ts:14-38`
- 角色权限矩阵：`apps/api/src/middleware/auth.ts:16-76`；权限目录：`packages/domain-model/src/index.ts:1031-1059`
- 术语密度实测：过账×29 · 分录×27 · 锁账×24 · 底稿×23 · 借贷×11 · 勾稽×6（grep 全站）
- 空壳帮助按钮：`apps/web/src/pages/VouchersPage.tsx:249`
- 死代码：`pages/PdfExportPage.tsx`(688) · `pages/ArchivePackagePage.tsx` · `pages/export/`（16 文件，零引用）
- 巨型页：PayrollPage 703 · SettingsPage 671 · EventsPage 655 · ContractsPage 562 · TaxPage 449 · PayrollTransferPage 445
- token 不一致：`styles/tokens.css`(`#4f8ef7`) vs `apps/web/src/main.tsx:12-56`(`#2563eb`)
- Stage H 已就绪待消费接口：`POST /api/close/drafts/generate` · `GET /api/ledger/close-plan` · `GET /api/anomaly/scan`（分支 `codex/v6-stage-h-wave2`）
- 最佳实践参照（站内）：MyDayPage 快速开始清单 · RiskHelpModal 级别解释表 · 增值税 4 步向导 · 工资 6 步向导 · Vouchers 过账后果 toast
- 角色设计目标全集：`docs/rbac-organization-model.md`（9 企业角色 + 数据域）；V3 六原则：`docs/v3-upgrade-spec.md:214-260`
