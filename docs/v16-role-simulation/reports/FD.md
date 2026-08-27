# 财务负责人 / 财务总监（v4_manager）操作实验报告

> 实验时间：2026-08-27（系统时间），公司 `cmp-v4-tech`，账号 `v4_manager`（`role-finance-director`）
> 双轨验证：API 走 `http://127.0.0.1:33100`，页面走 Playwright + `http://127.0.0.1:55173` 真实点击
> 我自己造的数据一律带 `[FD]` 前缀。**未做**：reset/seed、锁定或解锁会计期间、月末/年度结转。
> **有一处全局副作用**已在下文标注（生成了 2026-08 的资产负债表快照）。
>
> **口径说明**：本报告的所有结论都基于**实验当时正在运行的容器**
> （`finance-taxation-v4-test-api-1` / `-web-1`）的实际行为。实验期间有别的 agent 在源码树上并行改动，
> 其中 `apps/api/src/modules/vouchers/voucher-from-template.ts` 的未提交改动已经在修问题 #4
> （给 insert 补 `accounting_date`），但**未部署到运行中的容器**，所以我观察到的现象仍然成立。
> 问题 #2（`apps/web/src/lib/api.ts:333` `postVoucher` 写死空 body）在实验结束时**尚未被改动**。

## 我是谁

我是这家二十来人的科技公司的财务负责人。会计做账、出纳付钱，我负责**把关口径和守住内控**：
每张凭证的科目对不对、税务处理合不合规、月结走到哪一步、谁签了字、报表能不能对外报送。
我最在意三件事——**账要平、数要对得上、职责要分得开**。别人可以只管自己那一段，出了事是我签字。

---

## 10 件事的结果

### 1. 看月结进度，搞清楚这个月卡在哪一步

- **怎么做的**
  - API：`GET /api/ledger/close-plan?period=2026-08`
  - 页面：登录 → 侧栏未直接给「月度结账」入口，直接访问 `/close`
- **结果**：**成功**（但页面信息量严重不足）

  API 返回 11 步向导，`overall: "not_started"`，`nextActionableStep: "sweep_unposted"`，
  后面 10 步全部 `blocked`。事实层：
  ```json
  {"unpostedEventCount":12,"depreciationPosted":true,"unconfirmedPayrollCount":0,
   "socialSecurityClosed":false,"bankReconciliationClosed":false,"bankAccountCount":0,
   "pendingDraftCount":12,"taxConsistencyOverall":null,"incomeClosed":false,
   "snapshotTaken":false,"filingDraftReady":false,"archived":false}
  ```
  接口还附了 `factSources`，逐字段说明判据取自哪张表——这一点做得非常好，是我见过少有的
  「敢把口径写在响应里」的设计。

  页面 `/close`：11 步竖排清单，首步「清理未过账事项 · 可执行 · 前往事件工作台」，
  其余全是「未解锁 / 需先完成上一步 X」。截图 `close-step1.png`。

- **便捷性**：侧栏「业务入口 / 经营管理 / 费用与支付 / 财务运营 / 研发风控 / 系统」六组共 25 个入口，
  但**没有「月度结账」这一项**——我是靠直接敲 `/close` 才进去的。月结是财务负责人每月最重要的一件事，
  却没有导航入口。
- **逻辑正确性**：顺序锁定逻辑正确，前置未完成后续不给点，防止跳步。
  但 **`depreciationPosted: true` 是错的**——本期折旧凭证 `vch-dep-cmp-v4-tech-2026-08` 还躺在「待审核」，
  1602 累计折旧根本没进总账（`GET /api/ledger/balances` 里没有 1602）。见问题 #3。
- **业务合理性**：11 步的顺序符合国内月结实务（清理→工资社保→折旧→银行→计提→票税→结转→快照→申报→归档）。
- **功能完整性**：**页面上一个数字都没有**。API 明明知道「12 项未过账、12 张待批草稿」，
  页面只写「可执行」。我看不出这个月还剩多少活，也没法判断今天能不能结完。

---

### 2. 复核一张凭证并让它进入待过账（复核人 ≠ 过账人）

- **怎么做的**
  1. `POST /api/events` 建 `[FD]复核演示-管理费用报销`（1000 元，发生日 2026-08-26）
  2. `POST /api/vouchers` 按 `expense` 模板生成 → `tpl-voucher-1787822599853`，`status: draft`
  3. `GET /api/vouchers/{id}/validate` → `{"valid":true,"totals":{"debit":"1000.00","credit":"1000.00"}}`
  4. `POST /api/vouchers/{id}/approve` → `status: "review_required"`（= 待过账）
  5. `POST /api/vouchers/{id}/post`（**还是我自己**）
  6. 页面：`/vouchers` → 选凭证 → 「审核通过」→「过账」→「确认过账」
- **结果**：**成功，且职责分离拦住了**

  ```
  POST /api/vouchers/tpl-voucher-1787822599853/post   （复核人 = 过账人 = usr-v4-manager）
  → 400 {"error":"reviewer and poster must be different users","code":"WORKFLOW_DUTY_CONFLICT"}
  ```
  页面上走同一条路径，抓到的网络请求一模一样：
  ```
  POST /api/vouchers/vch-rmb-ef6ac4b1-.../post -> 400
       {"error":"reviewer and poster must be different users","code":"WORKFLOW_DUTY_CONFLICT"}
  ```
  换会计（`v4_accountant`）来过账、并指定终审人后成功：
  ```
  POST .../post  {"authorizerUserId":"usr-v4-chairman"}  → 200  status: posted
  ```

- **便捷性**：API 两步（approve → post）干净。页面上从登录到过账 5 次点击，凭证详情右侧
  「借贷校验 / 审核通过 / 过账 / 打印预览」布局合理，还画了「起草→校验→审核→过账→进报表」的进度条。
- **逻辑正确性**：三方分离（复核人 / 过账人 / 终审人）**逻辑上**是对的：
  - 复核人 == 过账人 → `WORKFLOW_DUTY_CONFLICT`
  - 不填终审人 → `WORKFLOW_AUTHORIZATION_REQUIRED`
  - 执行人 == 终审人 → `WORKFLOW_DUTY_CONFLICT`

  **但终审人这道闸是假的**，见问题 #5：`authorizerUserId` 只校验「非空且 ≠ 执行人」，
  不校验是不是真人、有没有权限。我实测用 `"usr-does-not-exist-张三"` 成功过账了一张凭证
  （凭证号 `付-2026-08-0009`）。
- **业务合理性**：制单/复核/过账分离符合《会计基础工作规范》，方向完全正确。
- **功能完整性**：**页面上过不了账**——这是本次实验最严重的发现之一，见问题 #2。
  另外系统生成的凭证一律是 `draft`（红冲、模板、报销都验证过），没有任何自动过账绕开复核的路径，
  这一条口径守住了。

---

### 3. 检查试算平衡表，确认账是平的

- **怎么做的**
  - API：`GET /api/reports/trial-balance?period=2026-08`
  - 页面：`/reports` → 「试算平衡」页签
- **结果**：**成功，账是平的**
  ```json
  "totals":{"opening":{"debit":"0.00","credit":"0.00","isBalanced":true},
            "period":{"debit":"4938.24","credit":"4938.24","isBalanced":true},
            "closing":{"debit":"4938.24","credit":"4938.24","isBalanced":true}}
  ```
  （后续因其他 agent 并发过账，实验末尾页面上是本期 9631.24/9631.24、期末 7511.24/7511.24，仍然三组全平。）

  页面写「**三组合计全部借贷相等**」，并把 75 个无发生额科目折叠起来，只留有发生额的 6 个。
- **便捷性**：3 次点击到位（财务报表 → 试算平衡）。折叠空科目这个细节很贴心。
- **逻辑正确性**：期初/本期/期末三组分别判平，而不是只判一个合计——这是对的，
  只判期末会掩盖「期初录错 + 本期抵消」这类错误。
- **业务合理性**：完全符合实务，出三表之前先看试算平衡表是正确的顺序，页面上也写了这句话。
- **功能完整性**：**有一个会骗人的地方**——当报表期间选错（默认 2026-05，见问题 #4）时，
  表里「暂无数据」，页面照样打出绿色的「三组合计全部借贷相等 / 期末合计 借 0.00 / 贷 0.00」。
  空表被判成「平了」。我第一眼真的以为账是空的。

---

### 4. 看资产负债表恒等式自检，确认没有「上年未结账」隐患

- **怎么做的**
  - API：`GET /api/ledger/balance-check`、`GET /api/reports/balance-sheet?period=2026-08`
  - 页面：`/reports` → 「资产负债表」
- **结果**：**成功，这是全系统做得最好的一处**
  ```json
  {"asOfDate":"2026-08-27","assets":0,"liabilities":7451.24,"equity":0,
   "unclosedProfitLoss":-7451.24,"unclassified":0,"difference":-7451.24,
   "residual":0,"balanced":false,
   "openFiscalYears":[{"year":2026,"netProfit":-7451.24,"currentYearProfitBalance":0}],
   "notice":"资产 − 负债 − 所有者权益 = -7451.24 元，来源是尚未结转的损益。 2026 年尚未做年末结转，本年利润未转入利润分配。"}
  ```
  页面上是一条橙色横幅：「**资产负债表差额可被解释，但仍有待办**」+ 算式 + 「尚未年结的年度：2026 年」。
  截图 `reports-aug-bs.png`。
- **便捷性**：不用找，横幅直接压在报表上方，看报表必然看到。
- **逻辑正确性**：把差额拆成 `difference`（含未结转损益）和 `residual`（真·借贷不平）两个字段，
  代码注释写得很清楚：`residual ≠ 0` 才是真错账。这个设计是专业的。
  **但 `balanced` 这个字段名会误导**——它取的是 `difference`，年中任何一家公司都恒为 `false`。
  如果哪个页面拿 `balanced` 画红灯，就会天天误报。
- **业务合理性**：把「上年未结账」变成报表上看得见的一行，而不是静默错数——这正是我要的。
- **功能完整性**：**资产负债表本身不是一张能用的报表**，见问题 #7：
  - 行项目标签是**科目代码重复两遍**：`2202 2202`、`222102 222102`、`2241 2241`，没有中文名
  - 同屏两个矛盾的合计：顶部 KPI「负债合计 7451.24」，表尾「负债和权益合计：0」
  - 没有法定报表行次（货币资金/应收账款/存货/实收资本/未分配利润），就是一张科目余额清单
  这张表报不了税、给不了银行。对比之下**利润表的标签是对的**（`税金及附加`、`管理费用-其他`），
  说明只是资产负债表的构建器写错了（`summary.ts:191/197/212/219` 写死 `label: accountCode`）。

---

### 5. 检查费用类科目的使用是否合理（业务招待费 vs 差旅费）

- **怎么做的**
  - `GET /api/accounts?limit=500` 看科目表
  - `GET /api/vouchers?limit=200` 逐行统计每个科目被哪些凭证用了
  - `GET /api/tax/corporate-income-tax-preparation?filingPeriod=2026` 看汇算底稿有没有提示
- **结果**：**做得了，但发现了三个口径问题**

  **(a) 660204 管理费用-业务招待费 存在，但零使用。** 全账 36 张凭证没有一笔进这个科目。
  与此同时：
  ```
  ## 660203 管理费用-差旅费
     draft | 餐饮及补贴复核 | 642.00/0.00 | 北京展会差旅缺少住宿发票 待补住宿票差旅草稿
     review_required | 餐饮及跨期调整待复核 | 1038.00/0.00 | 跨期差旅报销计入错误月份
  ## 6601 销售费用
     draft | 确认费用 | 860.00/0.00 | 客户活动用品采购缺少发票 待补票报销草稿
  ```
  「北京**展会**」的餐饮 642 元、「**客户活动**用品采购」860 元——这两笔在实务里高度可能属于
  业务招待费（60% 扣除 + 收入 5‰ 上限），进了差旅费和销售费用就是全额税前扣除，
  汇算时会漏调增。系统**没有任何提示**。

  **(b) 汇算底稿的招待费提醒永远不会触发。** `corporate-income-tax.ts:33` 的判据是
  「某个税务事项的 `treatment` 文本里含『业务招待』」，而**不是**看 660204 的余额。
  实测 `adjustmentHints: []`。也就是说：科目用对了它不提示，科目用错了它更不提示。

  **(c) 费用报销模板一律落 660207「管理费用-其他」。** `templates.ts:81` 写死。
  我建的 `[FD]` 凭证、E2E 的、红冲的、折旧的，全堆在 660207，本期发生额 8331.24 里绝大部分是它。
  一个把所有费用都记进「其他」的账，部门费用分析和汇算调整都无从谈起。

  **(d) 折旧记错科目。** 固定资产 `[ACC]研发服务器 R740` 的 `expenseAccountCode` 是 **660207**，
  科目表里明明有 **660202 管理费用-折旧**。生成的折旧凭证是 `660207 借 950 / 1602 贷 950`。
  这个值是建卡时人填的（接口必填、无默认），但系统**不校验折旧费用科目的合理性**，也不给建议。

- **便捷性**：科目表在 `/ledger` 能看；但「按科目看费用构成」要去 `/reports` → 「部门费用」，
  而那个口径是「已批准及已付款的报销单」，不含直接入账的费用（页面自己写了 `scopeNote`）。
  想看「660203 这个月发生了什么」，只能自己翻凭证列表。
- **逻辑正确性**：科目表本身完整（75 个，含 6602 全套明细），停用/启用有 `isActive`。
- **业务合理性**：科目体系是对的，**但缺少「记账时提示科目口径」这一层**。
  国内小企业最容易出事的就是招待费/会议费/福利费/差旅餐饮这四者的边界，系统一句话都没说。
- **功能完整性**：缺三样——(1) 报销/凭证录入时的科目建议或校验；(2) 招待费限额的自动测算；
  (3) 按科目的费用穿透查询。

---

### 6. 查审批流配置：一笔大额支出要几个人签字，能不能绕过

- **怎么做的**
  - API：`GET /api/approval/flows`、`POST /api/approval/instances`（6000 元报销）
  - 页面：`/settings?tab=expense-control` → 「审批流程」
  - 绕过测试：用员工账号 `v4_employee` 自建自批自付一张 8000 元报销单
- **结果**：**查得到，但答案很难看**

  **配置现状**：全公司只有 **1 条**审批流，只覆盖 `reimbursement`（报销单）：
  ```
  第 1 步  角色 role-v4-tech-accountant        不限额，总要走
  第 2 步  会签  role-v4-tech-cashier + role-v4-tech-employee   ≥ 5,000 元触发
  ```
  实测提交一笔 6000 元报销，参与人解析为：
  ```json
  [{"stepOrder":1,"userId":"usr-v4-accountant"},
   {"stepOrder":2,"userId":"usr-v4-cashier"},
   {"stepOrder":2,"userId":"usr-v4-employee"}]
  ```
  也就是：**一笔 6000 元的支出，签字的是会计、出纳和一名普通员工，财务负责人和董事长都不在链上。**
  让经办员工去会签大额支出，这在内控上是反的。

  **`payment` / `contract` / `advance` / `request` 四类单据一条流都没有**：
  ```
  POST /api/approval/instances {"documentType":"payment","amountCents":100000000}
  → 404 {"error":"没有为「payment」配置启用的审批流程","code":"FLOW_NOT_FOUND"}
  ```
  好消息是它**失败关闭**（404），不会当作自动通过。

  **绕过：三条路，条条通。**

  1. **审批引擎根本没接进业务单据。** 全仓库只有 `approval/routes.ts` 和 `approval/store.ts`
     调用 `submitForApproval`，报销/付款/借款/合同**没有一个模块**调它。
     审批流是一个孤立的、装饰性的子系统。

  2. **报销走的是另一条完全无人把关的状态机。**
     `POST /api/reimbursements/:id/transition` 挂的权限是 **`expense.submit`**——和「提报销」是同一个权限，
     所有角色都有。而 `transitionReimbursement(companyId, id, action)`（`store.ts:362`）
     **连操作人是谁都不接收**，自然也就没有「审批人 ≠ 申请人」的判断。

     实测（全程用 `v4_employee` 这一个普通员工账号）：
     ```
     POST /api/reimbursements                                → 201  RMB-202608-0004  8000.00 元
     POST /api/reimbursements/{id}/transition {"submit"}     → 200  status: pending
     POST /api/reimbursements/{id}/transition {"approve"}    → 200  status: approved
     POST /api/reimbursements/{id}/transition {"pay"}        → 200  status: paid
     ```
     审计日志里留下的就是这三行，同一个人，18 毫秒：
     ```
     09:29:18.809 usr-v4-employee reimbursement.submit   RMB-202608-0004（8000.00 元）
     09:29:18.827 usr-v4-employee reimbursement.approve  RMB-202608-0004（8000.00 元）
     09:29:18.841 usr-v4-employee reimbursement.pay      RMB-202608-0004（8000.00 元）
     ```
     整个过程**没有生成任何审批实例**（`GET /api/approval/pending` 为空）。

  3. **有 `workflow.manage` 的人可以自己改流程。** `createFlow`（`approval/store.ts:252`）
     新建一条流程时会 `update approval_flows set is_active=false where document_type=$2 and is_active`,
     **静默停用旧流程**，不需要任何人批准。而 `workflow.manage` 除了我，
     **会计（`role-accountant`）和税务专员（`role-tax-specialist`）都有**。
     页面上也确认了：我用 `v4_accountant` 登录，能打开 `/settings?tab=expense-control` → 「审批流程」，
     「新建流程」按钮就在那里（截图 `approval-flows-config.png`）。
     会计可以把「会计→出纳+员工会签」改成「只需我自己批」，旧流程自动作废。

- **便捷性**：配置藏在 系统中心 → 费控配置 → 审批流程，**三层深**，
  而且和「我的审批」（`/approvals`）分在两个完全不同的地方。找了一会儿。
- **逻辑正确性**：金额分级、会签模式、角色解析、去重都实现了，引擎本身写得不差。
  「改流程 = 新建一条，旧的停用并保留」的设计也对（历史实例还引用着它）。
  **问题在于这套引擎没人用**。
- **业务合理性**：不合理。① 大额支出的会签人里没有财务负责人；② 出纳出现在审批链里
  （出纳应该只管付，不该管批）；③ 付款和合同没有审批流；④ 报销可以自批自付。
- **功能完整性**：页面上显示的是**角色 ID 原文**——「角色：role-v4-tech-employee」。
  我看不出这是谁。应该显示「经办员工（张三、李四）」。

---

### 7. 检查有没有人越权做了不该做的事（审计日志）

- **怎么做的**
  - API：`GET /api/audit/logs?limit=200`、`GET /api/audit/verify-chain`
  - 页面：`/audit`
- **结果**：**成功，而且真抓到了**

  哈希链完整：`GET /api/audit/verify-chain → {"valid":true,"total":149}`（实验末尾 177 条）。

  **抓到的第一件事：出纳自借、自批、自付。**
  ```
  09:22:09.713 usr-v4-cashier advance.submit  adv-9d8f928d... ADV-202608-0001 [CSH]并发幂等测试
  09:22:09.727 usr-v4-cashier advance.approve adv-9d8f928d... ADV-202608-0001
  09:22:09.749 usr-v4-cashier advance.pay     adv-9d8f928d... ADV-202608-0001 付款
  ```
  `GET /api/advances` 确认 `borrowerUserId: "usr-v4-cashier"`。
  **借款人、审批人、付款人是同一个人，全程 36 毫秒。** 这是挪用公款的标准路径，
  也是我作为财务负责人第一个要堵的洞。同类记录共 3 组（ADV-202608-0001/0002、ADV-202609-0001）。

  **抓到的第二件事：会计自提自批报销。**
  ```
  09:28:51.783 usr-v4-accountant reimbursement.submit  RMB-202608-0003（318.00 元）
  09:28:51.800 usr-v4-accountant reimbursement.approve RMB-202608-0003（318.00 元）
  ```

  **抓到的第三件事**就是我自己在任务 6 里造的员工自批自付 8000 元。

- **便捷性**：`/audit` 页面有 15 种对象类型的下拉、资源编号、日期区间，还能「回跳到业务单据本身」。
  页面上正确显示了操作人姓名（`v4_accountant`），比 API 好。
- **逻辑正确性**：哈希链校验通过；操作类型/对象/变更详情都在。
- **业务合理性**：留痕本身够用了，但**看不出「谁越权」——只看得出「谁做了什么」**。
  系统里没有任何一处把「同一人走完提交+审批」标成异常。我是靠自己一行行比对时间戳和 userId 发现的。
- **功能完整性**：三个缺口——
  1. **不能按操作人筛选**。我想问「出纳这个月都做了什么」，页面上没有这个筛选项。
  2. **API 的 `userName` 全是 `null`**，只有 userId。三年后审计来查，人早走了，只剩一串 `usr-v4-cashier`。
  3. **6 条记录 `userId` 是 `null`**（`banking.statement.imported`、`invoice.created`、
     `banking.reconciliation.ran` 等系统动作），`resourceLabel` 也是 null。归责不到人。
  4. 同一笔付款的幂等重试被记成 **6 条 `advance.pay`**（`09:22:09.749`~`.752`），
     实际只付了一次（`outstandingCents: 0`，金额 1000 元）。看日志的人会以为付了六次。

---

### 8. 看一份报表快照，判断它生成之后账有没有再动过

- **怎么做的**
  - `GET /api/reports/snapshots` → 空（**系统里一张快照都没有**）
  - `POST /api/reports/snapshots?period=2026-08 {"reportType":"balance_sheet"}` 生成一张
    > ⚠️ **全局副作用**：这条记录会让 `close-plan` 的 `snapshotTaken` 变成 `true`，
    > 别的 agent 做月结时会看到「期末快照已生成」。快照 ID `report-snapshot-1787823034848`。
  - 然后让账动起来（会计过了我的 `[FD]跨月会计日期验证` 凭证），再看快照
  - 页面：`/reports` → 「对比两期变化」
- **结果**：**完全成功，这是全系统我最满意的功能**

  生成时带了溯源：
  ```json
  {"id":"report-snapshot-1787823034848","periodLabel":"2026-08",
   "generatedByUserId":"usr-v4-manager",
   "sourceEntryCount":17,"sourceLatestPostedAt":"2026-08-27T09:28:07.871Z",
   "freshness":{"status":"fresh"}}
  ```
  账动了之后，同一个接口：
  ```json
  "freshness":{"status":"stale",
    "reason":"生成快照后账上新增了 4 条分录，报表数据已与总账不一致，请重新生成"}
  ```
  页面上是一行红字：「**2026-08 资产负债表 / 账已变动，需重新生成 / SNP-001 · 2026-08-31**」，
  旁边就是「按当前账面重算 / 保存本期快照 / 生成差异分析 / 打开打印版」。截图 `reports-snapshots.png`。

- **便捷性**：3 次点击。快照编号 `SNP-001` 而不是 `report-snapshot-1787823034848`，
  是给人看的编号，这个细节做对了。
- **逻辑正确性**：判据是「分录条数 + 最后过账时间」双指标，且资产负债表（时点表，取期末前全部分录）
  和利润表（区间表）用不同的取数口径——代码注释里明确说了口径对不上会让每张资产负债表都被误报过期。
  这是想清楚了才写的。
- **业务合理性**：这正是财务负责人签字前要确认的事——「我签的这张表，是不是我看的那个账」。
  中文提示直接说清楚了「新增了几条分录」。
- **功能完整性**：完整。唯一的小遗憾是快照是**手动**生成的，月结向导第 9 步「生成期末财务快照」
  和这里是同一张表，但向导被前面 8 步锁着，实际上要从报表页手动存。

---

### 9. 检查期初建账 / 科目表配置是否完整

- **怎么做的**
  - `GET /api/ledger/opening-balances`、`GET /api/accounts`、`GET /api/ledger/fiscal-years`、
    `GET /api/ledger/periods`、`GET /api/setup/status`
  - 页面：`/ledger` → 「录入期初余额」
- **结果**：**部分成功——入口都在，但配置本身是残缺的**

  **科目表：完整。** 75 个科目，含 1001/1002/1122/1601/1602、2202/2241/222101~222105、
  4001/4103/4104、6001/6401/6403、6601/6602（8 个明细）/6603（3 个明细）。够一家小科技公司用。

  **期初余额：完全没建。**
  ```
  GET /api/ledger/opening-balances → {"openingBalances":null}
  ```
  这也解释了为什么资产负债表的**资产方是空的**、`assets: 0`——公司在跑 2026 年的账，
  却没有任何起点。银行存款、实收资本、固定资产原值，一个都没有。

  **会计期间表是空的。**
  ```
  GET /api/ledger/periods → {"items":[],"total":0}
  ```
  而 `isPeriodLocked`（`ledger/routes.ts:304`）在查不到行时返回 `false`。
  也就是说：**2026 年 1 月到 8 月，任何一个月都可以随时补记凭证**，
  没有「只有当期可记账」的兜底。只有人显式锁过的期间才拦得住。

  **新手清单里没有「期初建账」这一项。** `GET /api/setup/status` 返回 6 项：
  完善公司信息 / 配置纳税人档案 / 设置工资政策 / 录入员工 / 维护工资账号 / 添加银行账户
  （`doneCount: 1`, `ready: false`）。一家新公司照着这 6 步走完，**账依然没有期初余额**，
  资产负债表依然全 0。而系统自己的手册（`manual-content.ts:185`）写着
  「期初余额没录……这是新系统最容易漏掉、后果最重的一步」——它知道，但没放进清单。

  **页面入口是有的，而且做得不错。** `/ledger` → 场景按钮「录入期初余额」→
  建账基准日 + 科目/借方/贷方多行表格 + 实时「借方合计 / 贷方合计 / 差额」+「确认建账」，
  文案写着「借贷必须相等，差额不会被自动补平」。截图 `opening-balance.png`。

- **便捷性**：`/ledger` 把 8 个场景做成横排按钮（看总览 / 复核余额 / 对现金银行 / 追分录来源 /
  录入期初余额 / 做年度结转 / 锁定期间 / 期末外币调汇），2 次点击到位。这个组织方式比藏在菜单里好。
- **逻辑正确性**：期初建账的失败码设计得细（`OPENING_BALANCE_EXISTS` / `NOT_BALANCED` /
  `FORBIDDEN_ACCOUNT` / `OPENING_DATE_INVALID`），撤销时会拒绝已有业务分录的情况。
  **未验证**：本账套已有 21 条已过账分录，此时补录期初会不会重复计入（我没敢试，那是全局副作用）。
- **业务合理性**：期初建账、年度结转、锁账放在总账中心是对的，这就是账务的控制中心。
- **功能完整性**：缺两样——(1) 新手清单要把「期初建账」列进去并前置；
  (2) 会计期间要在建账时自动生成 12 个月的行，否则「锁期间」这个功能等于没开机。

---

### 10. 尝试做一次数据导出（月结资料包 / 审计资料）

- **怎么做的**
  - 页面：`/export-center` → 「场景导出」→「打开月结资料包」/「打开审计资料包」
  - API：`GET /api/packages/closing-bundle?kind=...&period=...`（9 种组合）
  - 另外试了 `POST /api/exports/jobs`、`GET /api/pdf/report?snapshotId=...`、`GET /api/archive/package`
- **结果**：**做不了。月结/审计/稽核资料包三种全部 500。**

  页面上点「打开月结资料包」，**什么都不会发生**——不弹窗、不下载、不报错、不转圈。
  抓网络才看到：
  ```
  GET /api/packages/closing-bundle?kind=month_end&period=2026-05 -> 500
  PAGEERROR: Error: {"error":"Internal Server Error","requestId":"req-f79db239b72f031d"}
  ```
  直接打 API，**9 种组合（3 kind × 3 period）全部 500**：
  ```
  2026-05 month_end HTTP 500 | 2026-05 audit HTTP 500 | 2026-05 inspection HTTP 500
  2026-08 month_end HTTP 500 | 2026-08 audit HTTP 500 | 2026-08 inspection HTTP 500
  2026-07 month_end HTTP 500 | 2026-07 audit HTTP 500 | 2026-07 inspection HTTP 500
  ```
  服务端日志给出了根因：
  ```
  {"level":"error","path":"/api/packages/closing-bundle",
   "error":"operator does not exist: date ~~ unknown"}
  ```
  是 `routes/shared-handlers.ts:69` 那句 `started_on like $2`——`rnd_projects.started_on` 是
  `date` 类型（`migrations/003_rnd_and_risk.sql:9`），拿 `like` 去比就炸。
  紧挨着的下一行 `coalesce(ended_on::text,'') like $2` 是加了 `::text` 的，
  `started_on` 漏了。**一个字的事，堵死了整个资料包导出。**

  **能做的**：
  - `GET /api/archive/package?period=2026-08` → 200，返回 8 个环节的完整度清单
    （经营事项 17 ✓ / 原始单据 27 ✓ / 记账凭证「已过账 8 张，待过账 16 张」✗ / 工资 ✓ /
    报表快照 1 ✓ / 税务申报 ✗ / 风险勾稽「未关闭 12 项」✗ / 审计留痕 149 ✓，`completeCount: 5/8`）。
    页面上是个 63% 的进度环，做得很清楚。
  - `POST /api/exports/jobs` → 201，但这只是**导出台账**，不产生文件。
  - `GET /api/pdf/report?snapshotId=...` → 200，但 `Content-Type: text/html`，**返回的是 HTML 不是 PDF**。
    页面上诚实地写了「打开导出链接后，在浏览器中按 Ctrl+P（Mac: ⌘+P），选择『另存为 PDF』」——
    但列表里的「建议文件名」写的是 `资产负债表_2026-08_快照.pdf`，两处对不上。
  - 个税/社保/公积金 CSV 全挂：日志里 `GET /api/tax-integration/iit-csv` →
    `relation "payroll_policies" does not exist`（si-csv、fund-csv 同样）。

- **便捷性**：`/export-center` 的组织是好的——工资 / 税务底稿 / 报表快照 / 批量归档 / 单据模板
  五大类都在一屏，还带历史记录。**但最重要的那个按钮是坏的，而且坏得无声无息。**
- **逻辑正确性**：`openPackage()`（`useExportCenterActions.ts:132`）写的是
  `void getClosingBundleHtml(...).then(...)`，**没有 `.catch`**。接口 500 时 Promise 被拒绝，
  UI 层完全不知道，用户只看到按钮点了没反应。
- **业务合理性**：月结资料包 / 审计资料包 / 稽核资料包这三个分类分得对，
  税务稽查和年审要的东西确实不一样。方向对，实现死。
- **功能完整性**：**做不了**。我没法把这个月的资料打包交出去。

---

## 发现的问题（按严重度排序）

| # | 严重度 | 问题 | 证据 | 我建议 |
|---|--------|------|------|--------|
| 1 | **阻断** | **报销 / 付款 / 借款 / 折旧生成的凭证 100% 过不了账**，永远进不了总账。这些凭证 `business_event_id` 为 `null`，而 `voucher_posting_records.business_event_id` 是 `not null` | `POST /api/vouchers/vch-rmb-ef6ac4b1-.../post`（会计+终审人齐全）→ **500**；服务端日志 `null value in column "business_event_id" of relation "voucher_posting_records" violates not-null constraint`；`migrations/001_initial_schema.sql:362`。全账 36 张凭证中 8 张属于此类（rmb×3、pay×2、adv×2、dep×1），**已过账 0 张** | 把 `voucher_posting_records.business_event_id` 改为 nullable，或在无事项时回填凭证自身 ID。这是整条费控链路进总账的唯一出口 |
| 2 | **阻断** | **前台无法过账任何一张凭证**。「确认过账」对话框里没有终审人字段，客户端写死发空 body | `apps/web/src/lib/api.ts:333` `postVoucher()` → `body: JSON.stringify({})`；页面实测 `POST /api/vouchers/.../post -> 400 {"code":"WORKFLOW_AUTHORIZATION_REQUIRED"}`；而 `voucher.post` 是 `HIGH_RISK_ACTIONS`，必须有 `authorizerUserId`（`workflows/authorization.ts`） | 在过账对话框加「终审人」选择器（从有 `ledger.post`/`settings.manage` 的用户里选），并把选中的 userId 传下去 |
| 3 | **阻断** | **月结/审计/稽核资料包导出全部 500**，且页面无任何错误提示 | `GET /api/packages/closing-bundle` 9 种组合全 500；日志 `operator does not exist: date ~~ unknown`；根因 `apps/api/src/routes/shared-handlers.ts:69` `started_on like $2`（`rnd_projects.started_on` 是 date）；前端 `useExportCenterActions.ts:132` 无 `.catch` | 改成 `started_on::text like $2`（下一行 `ended_on::text` 已经这么写了）；同时给 `openPackage` 补 `.catch` 并弹错误提示 |
| 4 | **阻断** | **凭证的会计日期落库的是「录入日」而不是「业务发生日」，且创建接口返回的值是假的**。跨月业务全部串期 | 事项 `occurredOn: 2026-07-15` → `POST /api/vouchers` 响应 `accountingDate: "2026-07-15"`，再 `GET` 同一张凭证 → `accountingDate: "2026-08-27"`。根因：`voucher-from-template.ts:163` 算出了值，但 `:266` 的 `insert into vouchers` **不含 `accounting_date` 列**，落到 `default current_date`（`migrations/045:62`）。该凭证已过账，凭证号 `付-2026-08-0009`，总账 `entryDate: 2026-08-27` | 把 `accounting_date` 加进 insert 的列表。（报销单走的 `vch-rmb-*` 路径日期是对的，只有模板路径漏了） |
| 5 | **阻断** | **职责分离能被绕过：一个普通员工可以自建、自批、自付一张 8000 元报销单**。审批引擎完全没接进业务单据 | `POST /api/reimbursements/:id/transition` 权限是 `expense.submit`（所有角色都有）；`transitionReimbursement(companyId,id,action)`（`reimbursements/store.ts:362`）**不接收操作人**；全仓库只有 approval 模块自己调 `submitForApproval`。实测三次调用全 200，审计日志 `usr-v4-employee` submit/approve/pay 三行相隔 18ms；`GET /api/approval/pending` 全程为空 | ① `approve`/`pay` 换成独立权限（如 `expense.approve` / `banking.pay`）；② `transitionReimbursement` 接收 actor 并拒绝「审批人 == 申请人」；③ 把 `submitForApproval` 真正接到报销/付款/借款上 |
| 6 | **阻断** | **出纳自借、自批、自付备用金**，同一个人 36 毫秒走完全流程 | 审计日志 `09:22:09.713/.727/.749 usr-v4-cashier advance.submit/approve/pay ADV-202608-0001`；`GET /api/advances` → `borrowerUserId: "usr-v4-cashier"`，`status: "paid"`。共 3 组同类记录 | 同 #5；另外出纳角色不该有任何 `*.approve` 能力 |
| 7 | **高** | **「资产负债表」不是一张能对外报送的报表**：行项目只有科目代码（`2202 2202`），无中文名、无法定行次；同屏两个矛盾合计（KPI「负债合计 7451.24」vs 表尾「负债和权益合计：0」） | 截图 `reports-aug-bs.png`；`GET /api/reports/balance-sheet?period=2026-08` → `liabilities:[{"code":"2202","label":"2202",...}]`；根因 `apps/api/src/modules/reports/summary.ts:191/197/212/219` 写死 `label: accountCode`（利润表 `:334/338` 用的是 `label: name`，是对的） | 先把 `label` 换成科目名称；再按《小企业会计准则》做一层「科目 → 报表行次」映射 |
| 8 | **高** | **报表页 / 导出中心不跟随顶栏的全局会计期间**，默认停在 **2026-05**，出的是一张全 0 的空表 | 页面同屏两个控件：`input[aria-label="全局会计期间"] = 2026-08`，`input[aria-label="月份"] = 5`；导出中心发的请求是 `?period=2026-05`；后端 `shared-handlers.ts:44` 也硬编码了 `|| "2026-05"` | 报表期间和导出期间都从 `PeriodProvider` 取默认值；删掉后端的硬编码兜底 |
| 9 | **高** | **试算平衡表在没数据时打绿灯**：空表照样显示「三组合计全部借贷相等 / 期末合计 借 0.00 / 贷 0.00」 | 页面实测（期间 2026-05，`rows` 全空）；配合 #8，用户默认看到的就是这个假绿灯 | 无分录时显示「本期无发生额，无法判平」，不要给结论 |
| 10 | **高** | **终审人是个纯文本字段：不校验是不是真人、不校验有没有授权权限**，且凭证详情/过账记录里查不到是谁终审的 | `workflows/authorization.ts` 只判「非空 && ≠ 执行人」；实测会计用 `{"authorizerUserId":"usr-does-not-exist-张三"}` 成功过账 → `status: posted, voucherNumber: 付-2026-08-0009`；`GET /api/vouchers/:id/posting-records` 只有 `postedByUserId`，没有 authorizer | 校验 `authorizerUserId` 存在于本公司 users 且具备授权权限；把终审人回显到凭证详情和过账记录上 |
| 11 | **高** | **月结向导的「计提折旧」误报已完成**。折旧凭证还在「待审核」，1602 累计折旧没进总账，向导却说 `depreciationPosted: true` | `GET /api/ledger/close-plan?period=2026-08` → `depreciationPosted: true`；`GET /api/vouchers` → `vch-dep-cmp-v4-tech-2026-08` `status: review_required`；`GET /api/ledger/balances` 里没有 1602。（该凭证受 #1 影响，过账时 500，实际上永远完不成） | `depreciationPosted` 的兜底分支（无在折旧区间的资产）要排除「本期已有折旧草稿待过账」的情况 |
| 12 | **高** | **企业所得税底稿把亏损抹成 0**，与利润表对不上，可弥补亏损完全看不见 | `GET /api/tax/corporate-income-tax-preparation?filingPeriod=2026` → `accountingProfit: "0"`；同期 `GET /api/reports/profit-statement?period=2026-08` → `totalProfit: "-7451.24"`。根因 `tax/corporate-income-tax.ts:27` `Math.max(totalProfit, 0)` | 会计利润据实显示（含负数）；应纳税所得额再单独做「不小于 0」的处理，并加一行「可结转以后年度弥补的亏损」 |
| 13 | **高** | **业务招待费口径全线缺失**：660204 零使用，展会餐饮进了差旅费、客户活动进了销售费用，汇算底稿的招待费提醒永远不触发 | 全部 36 张凭证按科目统计：660204 无任何一行；`660203 餐饮及补贴复核 642.00`（北京展会）、`6601 确认费用 860.00`（客户活动用品）；`corporate-income-tax.ts:33` 的判据是税务事项 `treatment` 文本而非 660204 余额，实测 `adjustmentHints: []` | ① 招待费提醒改看 660204 科目余额并测算 60%/5‰ 限额；② 报销/凭证录入时对「餐饮」类费用做科目归类提示 |
| 14 | **高** | **审批链设计违反内控**：6000 元报销的会签人是「出纳 + 普通员工」，财务负责人和董事长都不在链上；`payment`/`contract` 一条流都没有 | `GET /api/approval/flows`；`POST /api/approval/instances {"amountCents":600000}` → 参与人 `usr-v4-accountant` / `usr-v4-cashier` / `usr-v4-employee`；payment/contract/advance/request 提交均 404 `FLOW_NOT_FOUND` | 重配种子流程（≥5000 应由财务负责人会签，≥50000 加董事长）；为 payment/contract 补默认流程 |
| 15 | **中** | **有 `workflow.manage` 的人（含会计、税务专员）可以自建流程静默停用旧流程**，等于自己给自己开路 | `approval/store.ts:252-257` `update approval_flows set is_active=false ... where document_type=$2 and is_active`，无二次审批；`auth.ts` 的 `ROLE_PERMISSIONS` 里 `role-accountant` 和 `role-tax-specialist` 都有 `workflow.manage`；页面实测 `v4_accountant` 能进 `/settings?tab=expense-control` 并看到「新建流程」 | `workflow.manage` 收回给财务负责人/董事长；流程变更加一道二次确认与通知 |
| 16 | **中** | **权限表有两份且不一致**：运行时用的是 `auth.ts` 里硬编码的 `ROLE_PERMISSIONS`，数据库 `role_permissions` 表（migration 002）是另一份 | migration 002 给 `role-finance-director` 22 项，不含 `audit.view`/`workflow.*`/`settings.manage`/`expense.*`；`auth.ts:37` 给了 30 项含这些。实测按 `auth.ts` 走（我能读审计日志、能配审批流） | 二选一。审计要查「谁有什么权限」时，两份表会给出两个答案 |
| 17 | **中** | **会计期间表是空的，期间锁默认失效**——2026 年任何一个月都能随时补记凭证 | `GET /api/ledger/periods` → `{"items":[],"total":0}`；`isPeriodLocked`（`ledger/routes.ts:304`）无行时返回 `false` | 建账时自动生成本年 12 个月的期间行；已过期且未锁的期间给出提醒 |
| 18 | **中** | **新手清单漏掉「期初建账」**，照着走完 6 步账依然没有起点 | `GET /api/setup/status` 6 项无期初；`GET /api/ledger/opening-balances` → `null`；资产负债表资产方全空。而系统自己的手册 `manual-content.ts:185` 说这是「最容易漏掉、后果最重的一步」 | 把「录入期初余额」加进清单并放在第一位 |
| 19 | **中** | **审计日志不能按操作人筛选**，且 API 的 `userName` 全为 `null`，6 条系统动作 `userId` 也是 `null` | `/audit` 页面筛选项只有对象类型/资源编号/日期；`GET /api/audit/logs` 每条 `"userName": null`；`banking.statement.imported`、`invoice.created` 等 `userId: null` | 加「操作人」筛选；落库时冗余存 `user_name`；系统动作也要记发起人或标注「系统任务」 |
| 20 | **中** | **同一笔付款的幂等重试被记成 6 条 `advance.pay`**，看日志的人分不清付了几次 | 审计日志 `09:22:09.749`~`.752` 六行 `advance.pay adv-9d8f928d... ADV-202608-0001 付款`；实际 `outstandingCents: 0`，只付了 1000 元一次 | 幂等命中时不重复写审计，或标注「重试（幂等命中）」 |
| 21 | **中** | **费用报销模板一律落 660207「管理费用-其他」**，费用分析失去意义 | `apps/api/src/modules/vouchers/templates.ts:81` 写死；本期 660207 发生额 8331.24，占全部费用绝大部分 | 模板支持选明细科目；或按报销单的 `expenseType` 映射到对应明细科目 |
| 22 | **中** | **月结页面一个数字都没有**，API 明明知道「12 项未过账 / 12 张待批草稿」 | `close-plan` 返回完整 `facts`；页面只显示「可执行 / 未解锁」（截图 `close-step1.png`） | 每一步右侧显示待办数量，点进去就是过滤好的清单 |
| 23 | **中** | **侧栏 25 个入口里没有「月度结账」**，月结页只能靠敲 `/close` 进 | `GET /api/access/menu` 的 items 列表；页面侧栏截图 | 在「财务运营」组加一项「月度结账」 |
| 24 | **中** | **审批流配置页显示的是角色 ID 原文**（「角色：role-v4-tech-employee」），看不出是谁 | 截图 `approval-flows-config.png` | 显示角色中文名 + 当前持有人 |
| 25 | **低** | 报错文案是**未翻译的英文**，且没告诉我下一步该怎么办 | 页面上直接显示 `reviewer and poster must be different users`、`high-risk workflow action requires a final authorizer` | 译成中文并给出行动指引：「本张凭证由你复核，需由另一位有记账权限的同事过账」 |
| 26 | **低** | `/api/pdf/report` 返回的是 **HTML** 而不是 PDF，但列表里「建议文件名」写的是 `.pdf` | `Content-Type: text/html; charset=utf-8`，`file` 判定为 HTML document。页面横幅诚实地说了要 Ctrl+P，但文件名列没改 | 要么真出 PDF，要么把「建议文件名」和按钮文案统一成「打印预览」 |
| 27 | **低** | 个税/社保/公积金 CSV 导出全挂（表不存在） | 服务端日志 `GET /api/tax-integration/iit-csv` → `relation "payroll_policies" does not exist`（si-csv、fund-csv 同） | 补迁移或修正表名 |
| 28 | **低** | 资产负债表把借方余额的 `222102 应交税费-进项` 以 **−60** 挂在负债方，未重分类到资产 | `GET /api/reports/balance-sheet` → `{"code":"222102","amount":"-60"}`；试算平衡表里它是期末借方 60.00 | 借方余额的应交税费按「其他流动资产/待抵扣进项税额」重分类 |
| 29 | **低** | 过账失败后详情面板跳到了**另一张凭证**，错误横幅挂在错的凭证下面 | 页面实测：对 `[FD]前台过账入口验证` 点过账失败后，面板显示的是 `RMB-202608-0002`，错误文字挂在它下面 | 失败后保持当前选中项不变 |
| 30 | **低** | 模板生成的凭证 `source` 标成 `analysis`，但它是人按模板手工建的 | `POST /api/vouchers` 响应 `"source":"analysis"` | 改成 `template` 或 `manual`，`source` 是审计时判断来源的依据 |

---

## 我造的数据（供清理参考）

| 类型 | 标识 | 状态 |
|------|------|------|
| 经营事项 | `[FD]复核演示-管理费用报销`、`[FD]跨月会计日期验证`、`[FD]前台过账入口验证` | 保留 |
| 凭证 | `tpl-voucher-1787822599853`（已过账 1000 元）、`tpl-voucher-1787822674556`（已过账 333 元，凭证号 `付-2026-08-0009`）、`tpl-voucher-1787823518858`（待审核 11.11 元） | 前两张已进总账，是 #4/#10 的证据 |
| 报销单 | `RMB-202608-0004`（8000 元，用 `v4_employee` 自建自批自付，问题 #5 的证据） | 已 `paid`，其凭证 `vch-rmb-ef6ac4b1-...` 因 #1 无法过账 |
| 报表快照 | `report-snapshot-1787823034848`（2026-08 资产负债表）| **全局副作用**：会让 close-plan 的 `snapshotTaken` 变 true |
| 导出台账 | `export-job-1787823118641-qzmrzg`（`[FD]2026-08 月结资料包`）| 仅台账记录，无文件 |
| 审批实例 | `api-9b5f30de-...`（`[FD]SOD-FLOW-TEST-001`）| 已 `cancelled` |

---

## 一句话总结

**站在财务负责人的位置上：这套系统现在不能用来做账。**

不是因为它想得不够——恰恰相反，它有些地方想得比市面上的产品都细：
月结向导会告诉你每个判据取自哪张表；报表快照会告诉你「生成之后账上又多了 4 条分录」；
资产负债表恒等式自检会把「未结转损益」和「真·借贷不平」分成两个字段；
制单/复核/过账三方分离在 API 上是真的拦得住。这些是懂行的人写的。

问题是**关键的那几步是断的，而且断得很安静**：
报销、付款、借款、折旧生成的凭证一张都过不了账（500，`business_event_id` 非空约束）；
前台的过账按钮永远返回 400（客户端不传终审人）；
月结资料包三种全部 500（一句 SQL 少了 `::text`）；
模板生成的凭证会计日期落的是录入日不是业务日（insert 漏了一列）；
一个普通员工能自建自批自付一张 8000 元的报销单，出纳能自借自批自付备用金，
而那套设计得挺像样的审批引擎，**没有任何一个业务模块调用它**。

**要能干活，最少得补齐五件事**：
1. 让报销/付款/折旧的凭证能过账（`voucher_posting_records.business_event_id` 放开）
2. 过账对话框加终审人字段，并校验这个人真的存在、真的有授权权限
3. 把审批引擎接到报销/付款/借款上，`approve` 换独立权限，拒绝「审批人 == 申请人」
4. 凭证 insert 补上 `accounting_date`；报表和导出跟随全局会计期间
5. 修掉资料包导出的 `started_on like`，并给前端的 Promise 补上 `.catch`

在这五件事做完之前，我不会在这套系统出的任何一张报表上签字——因为**账本身是不完整的**：
36 张凭证只有 10 张进了总账，资产方是空的（期初没建），
而这些缺口在界面上一个红点都没有。
