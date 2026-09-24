# 会计（v4_accountant）操作实验报告

> 实验时间：2026-08-27（系统时间）｜角色代号 ACC｜账号 `v4_accountant` / `role-accountant`
> 环境：API `http://127.0.0.1:33100`、前端 `http://127.0.0.1:55173`
> 配合账号：`v4_employee`（业务提单）、`v4_manager`（财务负责人，复核/授权）
> 我造的数据一律带 `[ACC]` 前缀。未做任何 reset / seed，未锁定或解锁会计期间，未做月末或年度结转。

## 我是谁

我是这家公司唯一的会计。每天的活儿是：业务部门把事情提上来，我把它做成凭证；复核、过账；月底计提折旧、做权责发生制调整、出报表、报税。我一天要点几百下鼠标，所以我在意三件事：**同一个数字别让我填两遍**、**要做的事界面上得有按钮**、**做出来的数得是对的**。

结论先说：这套系统我今天**干不完一天的活**。折旧提出来了但过不了账，报销批出来的凭证也过不了账，红冲按钮前台点不到，公司这个月 17 条待做账的事项我一条都看不见。

---

## 10 件事的结果

### 1. 把一笔费用事项做成凭证（事项 → 凭证草稿）

- **怎么做的**：
  - 先用自己的账号建事项：`POST /api/events` → `{"error":"Forbidden","requiredPermission":"events.create"}`
  - 前台 `/events` 页面上**有**「新建事项」按钮，填完标题描述点「创建事项」→ 弹一个英文 toast `Forbidden`，弹窗不关，事项没建成（截图 `09-new-event-submit.png`）
  - 改由 `v4_employee` 建事项 `evt-1787822340835-b9763f46`（`[ACC]8月办公室宽带专线费`，1060.00）
  - 我再试 `POST /api/events/{id}/analyze` → 同样 `Forbidden / events.create`
  - 最后由业务方跑 analyze，才生成凭证草稿 `voucher-evt-1787822340835-b9763f46-payment`
- **结果**：**做不了**（本职工作被权限挡死，只能等业务方替我按按钮）
- **便捷性**：登录后 3 次点击能找到事项总线，页面本身很好；但「新建事项」这个按钮对会计角色**不该出现**——出现了、点了、只回一个英文 `Forbidden`，没有任何解释。
- **逻辑正确性**：生成的分录借 660207 管理费用-其他 1060.00 / 贷 2241 其他应付款 1060.00，借贷平。但这是一张**取得增值税专用发票**的费用，1060 应拆成 1000 费用 + 60 进项税额，系统全额进了费用（税务映射里倒是提示了「判断是否形成可抵扣进项税额」，凭证里没做）。
- **业务合理性**：不认可。国内实务里会计是**做账的人**，事项登记、AI 拆解这两步他必须能自己发起（补录、调整、月末计提都是会计自己起头的）。把 analyze 挂在 `events.create` 上尤其别扭——「把事项翻译成分录」按定义就是会计的活儿。
- **功能完整性**：卡在第一步。要真能干完，`role-accountant` 至少得有 `events.create`。

### 2. 走完一张凭证的完整生命周期（起草 → 复核 → 过账）

- **怎么做的**（全部走 API + 前台各验一遍）：
  1. `GET /api/vouchers/{id}/validate` → `{"valid":true,"totals":{"debit":"1060.00","credit":"1060.00"}}`
  2. 不审核直接过账 → `{"error":"Voucher must be approved before posting"}` ✅
  3. 我（ACC）`POST .../approve` → `status: review_required`
  4. 我自己再过账 → `{"error":"reviewer and poster must be different users","code":"WORKFLOW_DUTY_CONFLICT"}` ✅ 职责分离生效
  5. 换 `v4_manager` 过账（终审人填董事长）→ `status: posted`，凭证号 `付-2026-08-0005`，生成 2 条总账分录
- **结果**：**成功**（但有两个坑，见下）
- **便捷性**：API 顺；前台**不顺**。凭证详情页只在 `status==='draft'` 时给「审核通过」，只在 `status==='review_required'` 时给「过账」。而事项分析生成的凭证**落库就是 `review_required` 且 `approvedAt` 为 null**——页面只给它一个「过账」按钮，点下去必然报错。实测：`voucher-TRV-STD-001-payment`，前台点「过账」→ toast 显示英文 `Voucher must be approved before posting`，`400 POST /api/vouchers/voucher-TRV-STD-001-payment/post`（截图 `13-review-required-post.png`）。**当前库里 5 张凭证卡在这个死状态**（`status=review_required` 且 `approvedAt=null`）。
- **逻辑正确性**：状态机确实只有 draft / review_required / posted；重复过账幂等（再 POST 一次返回同一张 posted 凭证，`ledgerEntries` 仍是 2 条、`postingRecords` 仍是 1 条，没有重复记账）✅。但**重复点「审核通过」不报错，且无条件覆盖 `approved_by_user_id`**（`update vouchers set approved_by_user_id = $4` 无任何条件），审计上「这张谁审的」可以被后来者顶掉。另外**没有「制单人 ≠ 审核人」校验**：我自己用模板建的 `tpl-voucher-1787823708730`，自己点审核直接通过。
- **业务合理性**：「复核人 ≠ 记账人」这条对，很好。但国内实务是**制单 → 审核 → 记账**三签，这里只卡了后两个环节。
- **功能完整性**：**分录不可编辑**。`PUT /api/vouchers/:id` 只更新 `status` 和 `summary`（`apps/api/src/modules/vouchers/routes.ts:241-252`），科目、金额、行数一概改不了；草稿也删不掉（`DELETE /api/vouchers/{id}` → 404，路由表里根本没这条）。草稿科目挂错了，会计只能重新生成一张，错的那张永远躺在列表里。

### 3. 红冲一张过账后才发现错的凭证

- **怎么做的**：发现第 1 张凭证没拆进项税，`POST /api/vouchers/voucher-.../reverse` → 生成 `vch-rev-...-1787822470748`（draft），manager 审核 + 我过账 → `付-2026-08-0006`
- **结果**：**API 成功，前台做不了**
- **便捷性**：**前台没有红冲入口**。已过账凭证详情页的按钮只有：查看事项 / 查看单据 / 查看税务 / 查看总账 / 刷新运行态 / 发起补偿（截图 `12-posted-voucher.png`）。
  根因是死代码 —— `apps/web/src/pages/vouchers/VoucherDetailPanel.tsx:182` 起整块动作区包在 `{!isPosted && (…)}` 里，而红冲按钮在里面又要求 `{detail.status === "posted" && (…)}`（第 216 行），两个条件互斥，**这个按钮永远渲染不出来**。讽刺的是同一个文件第 33-38 行的注释写着「这个按钮在前台根本不存在……只是没人接上来」——写了修复代码，但挂错了位置。同一个 `!isPosted` 块还吞掉了已过账凭证的「打印预览」。
- **逻辑正确性**：护栏很扎实 —— 重复红冲 → `VOUCHER_ALREADY_REVERSED`；红冲的红冲 → `VOUCHER_IS_REVERSAL`；红冲凭证本身是 draft、要走完整复核过账 ✅。
- **业务合理性**：两点不认可。①**用的是蓝字对冲，不是红字**：冲销后 660207 管理费用出现**贷方发生额 1060.00**，本期借贷发生额双向虚增，月报上看着像有一笔「费用冲回」。国内「红冲」的标准做法是红字（负数）分录，冲减借方发生额。②**原凭证上看不出它被冲过**：库里有 `reverses_voucher_id` / `reversed_by` 字段（reversal.ts 用它做校验），但 `GET /api/vouchers/:id` 的返回里一个都不带，前台只能靠摘要里的「红冲：」四个字猜。
- **功能完整性**：能力齐、入口缺、关联关系不外露。

### 4. 计提本月折旧

- **怎么做的**：
  - `POST /api/assets` 建卡：`[ACC]FA-2026-001` 研发服务器，原值 36000.00，残值 1800.00，36 个月，购置日 2026-05-18
  - `GET /api/assets/depreciation?period=2026-08` → `totalAmount: "950.00"`
  - `POST /api/assets/depreciation {"period":"2026-08"}` → 生成 `vch-dep-cmp-v4-tech-2026-08`（draft，accountingDate `2026-08-31`）
  - manager 审核 → OK；我过账 → **HTTP 500**
- **结果**：**做不了**（凭证做出来了，过不了账）
- **便捷性**：`/asset-center` 页面做得好——「预览本期折旧」和「计提并生成草稿凭证」两个按钮并排，文案写清了「先预览再计提」「生成的是草稿凭证，仍需审核过账」。这是全站最顺手的一个入口。
- **逻辑正确性**：算得对。起提期间自动落在 2026-06（当月增加当月不提，次月起提 ✅）；月折旧 (36000−1800)/36 = 950.00 精确；2026-05 预览为 0.00 ✅；重复计提被挡：`DEPRECIATION_ALREADY_RUN`「重复计提会让本期费用翻倍」✅。折旧计算用整数分 + 末期扫尾（`assets/depreciation.ts` 头注释与 `final_trim`），我实测的是整除场景，非整除的扫尾**未验证**。
  **但过账炸了**：
  ```
  POST /api/vouchers/vch-dep-cmp-v4-tech-2026-08/post → 500
  {"error":"Internal Server Error","requestId":"req-55185bb4c18acaaf"}
  ```
  容器日志：
  ```
  "error":"null value in column \"business_event_id\" of relation \"voucher_posting_records\" violates not-null constraint"
  ```
  折旧凭证的 `businessEventId` 是 null（它本来就不该有业务事项），而 `migrations/001_initial_schema.sql:361` 把 `voucher_posting_records.business_event_id` 定义成 `not null`。
- **业务合理性**：会计上完全说得通（草稿→复核→过账），但过不了账等于没做。
- **功能完整性**：**连带把月结堵死**。`/api/ledger/close-plan` 里「计提折旧」这一步的判据是「本期存在 `source='depreciation'` 且 `status='posted'` 的凭证」，而这张凭证永远到不了 posted，兜底条件（公司没有处于计提区间的资产）也因为我建了卡而不成立 —— **这家公司的月结从此永远卡在第 4 步**。另外重复计提的报错让人「先红冲原折旧凭证并删除该期计提明细」，但路由表里根本没有删除计提明细的接口（全站只有一条 DELETE：`/api/ledger/opening-balances`）。

### 5. 一笔计提/摊销的权责发生制调整

- **怎么做的**：`POST /api/vouchers`（tax-surcharge 模板，180.00，8月印花税计提）→ `tpl-voucher-1787822712021`；manager 审核；我过账 → `记-2026-08-0001`
- **结果**：**部分成功**（做成了，但会计日期被改掉了）
- **便捷性**：**差**。这条路上有三个坎：
  1. 会计做计提根本不需要「业务事项」，但 `POST /api/vouchers` **强制要 `businessEventId`**（`{"error":"请求参数校验失败","details":["businessEventId is required"]}`），而我又没有 `events.create`——我得先求业务同事替我建一条「印花税计提」事项。
  2. 前台「按模板生成」弹窗里这个字段标的是 **「关联事项编号 (可选)」**，留空点「生成凭证」→ 只弹一句「请求参数校验失败」，不说是哪个字段（截图 `05-template-submit.png`，实际返回 `400 … businessEventId must be at least 1 characters`）。
  3. 就算知道要填，输入框提示是「粘贴或输入事项 ID」——**没有选择器、没有搜索**，得手抄一串 `evt-1787822698415-b5d22e15`。
  4. **重复劳动实锤**：事项上已经填过金额 180.00，模板弹窗里还要再填一次金额；`createVoucherFromTemplate` 里 `amount` 是必填，事项上的 `amount` 完全不被继承。
- **逻辑正确性**：分录对（借 6403 税金及附加 180.00 / 贷 222105 应交税费-应交印花税 180.00），借贷平。精度也没问题：我拿 `33.335` 探了一次，两边都变成 `33.34`，仍然平（`tpl-voucher-1787823708730`）。
  **但会计日期被静默改写**——见下面「逻辑正确性」栏的独立证据。
- **业务合理性**：把「计提/摊销」硬绑在「业务事项」上，不符合实务。计提、摊销、结转、调整这些本来就是会计自己起头、没有外部业务对应的凭证。
- **功能完整性**：模板只有 10 个，覆盖不了大部分计提场景；分录又不能改，所以「模板对不上就没辙」。

#### 会计日期被静默改写（这条最影响数）

干净复现（同一张凭证，创建 → 立刻读取）：

```
事项 evt-1787822753264-c69570f5 的 occurredOn = 2026-07-15

POST /api/vouchers {"templateKey":"expense","amount":"600.00","businessEventId":"evt-1787822753264-c69570f5"}
→ 响应体：{"id":"tpl-voucher-1787822753312", "accountingDate":"2026-07-15"}     ← 界面上看到的

GET /api/vouchers/tpl-voucher-1787822753312
→ {"id":"tpl-voucher-1787822753312", "accountingDate":"2026-08-27"}            ← 库里真实的
```

根因：`voucher-from-template.ts:266-291` 和 `events/event-persistence.ts:342-375` 两条写库路径的 `insert into vouchers (…)` 字段列表里**都没有 `accounting_date`**，而 `migrations/045` 给这一列设了 `default current_date`。`event-mappings.ts:527` 的注释还专门写着「账要记在业务发生的那个期间，而不是跑分析的那天」——代码算出来了，就是没写进去。

后果我在总账里直接看到了：`/api/ledger/entries` 里 21 条分录**全部** `entryDate = 2026-08-27`，包括另一个 agent 明显在测同一件事的 `[FD]跨月会计日期验证`。7 月的业务 8 月补录，账就记到 8 月。

（对照：报销单生成的凭证 `vch-rmb-…` 的 `accountingDate` 是 `2026-08-22` = 费用发生日，那条路径写库是对的。所以这是这两条路径独有的缺陷，不是全局设计。）

### 6. 查一个科目的明细账，核对余额

- **怎么做的**：`/ledger` 页面切「复核科目余额」「追一笔分录的来源」；API 试了 `/api/ledger/balances`、`/api/ledger/entries`、`/api/reports/trial-balance`
- **结果**：**部分成功**（余额对得上，但「明细账」这个东西不存在）
- **便捷性**：**差**。`/ledger` 的「追一笔分录的来源」只支持按**凭证编号 / 事项编号**过滤，**没有按科目过滤**。想看 660207 的明细账，我只能把全部分录拉下来自己筛。
- **逻辑正确性**：数字自洽，这点没问题。我手工核了一遍 660207：
  ```
  明细逐笔合计：借 8331.24 / 贷 1060.00 / 余额 7271.24
  /api/ledger/balances   ：借 8331.24 / 贷 1060.00 / 余额 7271.24  ✅
  /api/reports/trial-balance?period=2026-08：本期借 8331.24 / 本期贷 1060.00 / 期末借 7271.24  ✅
  试算平衡表总计：本期借 9631.24 = 本期贷 9631.24，isBalanced: true  ✅
  ```
  **但筛选参数是静默失效的**，这比不支持更危险：
  - `GET /api/ledger/entries?accountCode=660207&from=2026-08-01&to=2026-08-31` → 返回 14 条，涉及 `6403,222105,660207,2241` 四个科目。`listLedgerEntries` 只读 `voucherId / businessEventId / from / to`，`accountCode` 直接被忽略。
  - `GET /api/ledger/balances?accountCode=660207&period=2026-08&from=…&to=…` → 返回全部 4 个科目的**全历史累计**。`getLedgerBalances(req, res)` 压根不读任何 query 参数（`ledger/routes.ts:122`）。
  会计照着 URL 上的科目号看结果，看到的是别的科目的数。
- **业务合理性**：不认可。**「科目明细账」是会计每天要翻的第一本账**，这里没有：既不能按科目筛，明细行里也没有「方向」和「逐笔余额」两列。`/ledger` 的「复核科目余额」只给全历史累计借贷，没有期初/本期/期末，也没有期间选择——真正能当科目余额表用的只有 `/reports` 的「试算平衡」。
- **功能完整性**：缺科目明细账；缺按科目/期间的余额查询。

### 7. 处理一张报销单（从待办到生成凭证）

- **怎么做的**：`POST /api/invoices` 录票 → `POST /api/reimbursements` 建单（318.00，1 行办公费）→ `POST .../audit` → `transition submit` → `transition approve` → 自动生成凭证 `vch-rmb-e63477c9-…`
- **结果**：**部分成功**（单子批了、凭证生成了，凭证过不了账）
- **便捷性**：`/reimbursements` 页面只有两个 tab：**「我的报销」**和「填报销单」。作为会计，我在报销中心**看不到别人提的单子**——库里有 4 张（`[EMP]`、`[CSH]` 各一张），页面只显示我自己那张。走审批流的单子会出现在 `/approvals`「待我审批」里（我这里看到 1 条 `[FD]SOD-FLOW-TEST-001`），但 `status=pending` 的普通单子两处都不露面。另外「我的一天」的 inbox 里也**没有报销相关的待办项**（只有逾期任务/待分析事项/待验真发票/待上传附件/待过账凭证/未匹配流水六项）。
- **逻辑正确性**：金额用整数分存（`amountCents: 31800`）→ 318.00，没丢精度 ✅。生成的分录借 660201 管理费用-办公费 318.00 / 贷 2241 其他应付款 318.00，往来单位挂到了报销人 ✅，普票不拆进项税 ✅ 正确。合规审核也真干活：
  ```
  {"level":"warn","findings":[{"code":"audit.invoice_title_mismatch",
    "message":"发票抬头是「V4 科技有限公司」，与公司名称「V4 科技子公司」不一致…"}]}
  ```
  **但两个硬问题**：
  ① **自己提的单自己批了**。我用 `v4_accountant` 建单、`v4_accountant` 提交、`v4_accountant` 审批，一路 200，`status: approved`。路由 `POST /api/reimbursements/:id/transition` 只查 `expense.submit` 权限，handler 里没有「申请人 ≠ 审批人」校验。
  ② **生成的凭证过不了账**，和折旧同一个原因（`businessEventId` 为 null）：
  ```
  POST /api/vouchers/vch-rmb-e63477c9-f978-43a8-9eb4-964172ee7fb0/post → 500
  日志：null value in column "business_event_id" of relation "voucher_posting_records" violates not-null constraint
  ```
- **业务合理性**：审批环节的内控是破的（自批自）。报销单的可见性也不对——会计是报销单的**处理人**，看不到别人的单子等于这个岗位在系统里没位置。
- **功能完整性**：从待办到凭证走通了，从凭证到账**断了**。

### 8. 录一张发票并把它和业务对上

- **怎么做的**：`POST /api/invoices`（数电专票 20 位号码，1000 + 60 税 = 1060，`businessEventId` 指向宽带费事项）→ `POST /api/invoices/{id}/verify` → `POST /api/invoices/{id}/voucher`
- **结果**：**部分成功**
- **便捷性**：`/bills?tab=invoices` 是全站入口最全的一页：导入数电票 / OCR 识别 / 手动录入 / 逐行「验真」「生成凭证」按钮都在。这块好用。
- **逻辑正确性**：生成的凭证**拆税拆得对**（这一点比事项 analyze 那条路强得多）：
  ```
  借 660207 管理费用-其他        1000.00
  借 222102 应交税费-应交增值税（进项）  60.00
  贷 2202  应付账款                     1060.00
  ```
  1000 + 60 = 1060 ✅。
  **问题一：数电票验真必然不合规。** `POST /api/invoices/{id}/verify` → `{"verifyStatus":"invalid","message":"发票号码格式不正确（应为8位数字）"}`。`invoice-verify.ts:68` 的本地规则写死 `/^\d{8}$/`。2024 年起全面推行的数电票号码是 **20 位**，也就是**现在收到的绝大多数进项票，录进来就被判「不合规」**。发票台账上直接飘红：「1 张发票验真未通过，存在合规风险」。
  **问题二：验真不合规不拦着生成凭证。** 这张 `verify_status = invalid` 的票，我照样 `POST .../voucher` 成功，凭证照样挂了 60 元进项税额，照样过账（`付-2026-08-0007`）。进项抵扣没有任何验真前置。
  **问题三：会计日期还是今天**（2026-08-27），发票开票日是 2026-08-20。
- **业务合理性**：8 位号码这条规则是纸质票时代的，现在等于把日常工作全部标成异常，会计会直接学会无视这个红字——这比不做验真更糟。
- **功能完整性**：**`GET /api/invoices/:id` 这条路由根本不存在**（实测 404，路由表里 invoices 只有 GET 列表 / POST / ocr / parse / verify / voucher / PATCH / DELETE），想看一张票的详情只能把整个列表拉下来筛。发票列表的返回还是 **snake_case**（`invoice_no`、`seller_name`、`verify_status`…），全站其它接口都是 camelCase。

### 9. 查哪些事项还没做账（未过账清理）

- **怎么做的**：`/close` 月结页 → `GET /api/ledger/close-plan?period=2026-08`；`/events`；`GET /api/vouchers`
- **结果**：**做不了**
- **便捷性**：月结页第一步就是「清理未过账事项 · 可执行」，还给了「前往事件工作台」按钮，看着很顺。**点进去是死路**：
  ```
  close-plan facts: {"unpostedEventCount": 17, "pendingDraftCount": 15, …}
  GET /api/events （我的账号）: {"items":[…1 条…],"total":1}
  ```
  月结告诉我本期有 17 条事项没做账，事项总线上我只看得见 1 条——还是业务同事特意把我加成协作人的那条。左侧导航的「经营事项总线」徽标显示 17，列表显示「已加载 1 条经营事项」，同一屏上两个数对不上。
  根因：`events/visibility.ts` 把可见性收敛成「owner ∪ 显式协作人 ∪ 公司级角色」，而公司级角色只有 `role-chairman` 和 `role-finance-director`，**`role-accountant` 不在里面**。
- **逻辑正确性**：`close-plan` 的口径本身是清楚的（`factSources` 把每个数字的 SQL 口径都写出来了，这点很少见，值得表扬）。但它**只给数不给单**——没有任何接口能列出「是哪 17 条」。
- **业务合理性**：不认可。「所有业务事项都要有人做账」和「事项按参与人保密」这两件事，在会计这个岗位上是直接冲突的。要么给会计公司级可见，要么至少给一个「未做账事项清单」的只读入口。
- **功能完整性**：另一半也缺——凭证侧。`/api/vouchers` 只认 `businessEventId` 一个参数，**没有 status / 期间 / 日期筛选，没有分页**，一次性返回全部 37 张（前台靠客户端切 tab）。凭证列表里也不显示凭证号和记账日期，只有 id 后 8 位和创建日期。真到几千张凭证的时候这页就废了。
  顺带查出来的实情：**37 张凭证里有 12 张 `businessEventId` 为 null**（报销 4 张、付款 2 张、备用金 6 张），也就是这 12 张全部过不了账。

### 10. 给一条经营事项加一个协作人

- **怎么做的**：`/events` → 事项详情 → 「协作人（2）」面板 → 下拉选人 → 点「添加协作人」
- **结果**：**做不了**（我没权限；换 `v4_manager` 一次成功）
- **便捷性**：面板本身做得好——列出现有协作人、每人一个「移出」、一个成员下拉、一句解释文案「只有负责人和这里列出的人能看到这条事项。加进来的人**看得到、但改不了**」。位置也好找。
- **逻辑正确性**：我点「添加协作人」→ `403 POST /api/events/{id}/collaborators {"error":"Forbidden","requiredPermission":["events.assign","events.create"]}`。换 manager 同样的操作 → `201`，名单变成 会计 + 出纳。跨公司拉人有校验，协作人自己不能再拉人，判定跟 `canMutate` 走同一套 —— 设计是对的。
- **业务合理性**：会计不能加协作人，勉强说得通（不是事项负责人）。但结合第 9 条就变成死结：**会计看不见事项，也没权限把自己加进去**，只能一条条去求 owner。
- **功能完整性**：功能齐，就是这个角色用不了。

---

## 发现的问题（按严重度排序）

| # | 严重度 | 问题 | 证据 | 我建议 |
|---|--------|------|------|--------|
| 1 | **阻断** | 没有关联业务事项的凭证一律过不了账（HTTP 500）。影响折旧、报销、付款、备用金等所有系统自动生成的凭证 | `POST /api/vouchers/vch-dep-cmp-v4-tech-2026-08/post` → 500 `req-55185bb4c18acaaf`；容器日志 `null value in column "business_event_id" of relation "voucher_posting_records" violates not-null constraint`；同一错误在 `vch-rmb-e63477c9-…/post` 复现（`req-19584ab2d18bd9ca`）。约束定义在 `migrations/001_initial_schema.sql:361`。当前库里 12/37 张凭证的 `businessEventId` 为 null | 加一条迁移把 `voucher_posting_records.business_event_id` 改成 nullable（凭证本来就未必对应业务事项）；顺带补一个集成测试：过账一张 `businessEventId=null` 的凭证 |
| 2 | **阻断** | 月结第 4 步「计提折旧」永久无法完成 —— 判据要求存在 `source='depreciation'` 且 `status='posted'` 的凭证，而问题 1 让它到不了 posted；兜底条件（无在提资产）在有资产时不成立 | `/api/ledger/close-plan?period=2026-08` → `depreciationPosted:false`；`factSources.depreciationPosted` 写明口径；折旧凭证过账 500 | 随问题 1 一并解决 |
| 3 | **阻断** | 事项分析生成的凭证落库即 `review_required` 且 `approvedAt=null`，前台该状态只给「过账」不给「审核通过」，点了必然 400，这类凭证在界面上无法推进 | 前台 `/vouchers` → 待审核 → `上海客户拜访差旅报销`，按钮集合 `借贷校验｜过账｜打印预览`，点过账 toast 显示 `Voucher must be approved before posting`，`400 POST /api/vouchers/voucher-TRV-STD-001-payment/post`。当前 5 张凭证处于此状态 | 要么让 analyze 生成 `draft`，要么在 `review_required && !approvedAt` 时也渲染「审核通过」按钮 |
| 4 | **阻断** | `role-accountant` 缺 `events.create`：建不了事项，也跑不了 AI 分析（analyze 挂在同一权限上）。前台仍显示「新建事项」按钮，点了只弹英文 `Forbidden` | `POST /api/events` → `{"error":"Forbidden","requiredPermission":"events.create"}`；`POST /api/events/{id}/analyze` 同样；`middleware/auth.ts:49` 的 `role-accountant` 权限表；前台截图 `09-new-event-submit.png` | 给 `role-accountant` 加 `events.create`；analyze 单独拆一个权限（它是记账动作不是登记动作）；按钮按权限隐藏，403 文案本地化 |
| 5 | **高** | 凭证会计日期被静默改写成「今天」：analysis 与 template 两条写库路径都不写 `accounting_date`，DB 默认 `current_date`。**创建接口返回的日期和库里存的不是一个数** | 事项 occurredOn `2026-07-15` → `POST /api/vouchers` 响应 `accountingDate:"2026-07-15"`，紧接着 `GET` 同一张 → `"2026-08-27"`（`tpl-voucher-1787822753312`）；`voucher-from-template.ts:266` 与 `events/event-persistence.ts:346` 的 insert 字段列表均无 `accounting_date`；`migrations/045:62` `set default current_date`；总账 21 条分录 `entryDate` 全是 `2026-08-27` | 两处 insert 补上 `accounting_date`（值就用已经算好的 `voucher.accountingDate`）；加一条测试钉住「跨月补录的凭证记在业务发生月」 |
| 6 | **高** | 前台没有红冲入口 —— 按钮是死代码 | `VoucherDetailPanel.tsx:182` `{!isPosted && (…)}` 内嵌 `:216` `{detail.status === "posted" && (…红冲…)}`，条件互斥；已过账凭证详情实测按钮只有 查看事项/单据/税务/总账 + 刷新运行态/发起补偿（截图 `12-posted-voucher.png`）。同一块还吞掉了已过账凭证的「打印预览」 | 把红冲（和打印预览）移出 `!isPosted` 块 |
| 7 | **高** | 会计看不到经营事项：可见性 = owner ∪ 显式协作人 ∪ {董事长, 财务负责人}，`role-accountant` 不在公司级角色里 | `visibility.ts:21` `COMPANY_WIDE_ROLES`；月结 `unpostedEventCount:17` vs `GET /api/events` 返回 `total:1`；前台导航徽标 17、列表「已加载 1 条」 | 把 `role-accountant` 加入 `COMPANY_WIDE_ROLES`，或单开一个「未做账事项清单」只读接口 + 页面 |
| 8 | **高** | 手工凭证无入口：`POST /api/vouchers` 强制 `templateKey` + `businessEventId`；前台字段却标「(可选)」，留空只回一句「请求参数校验失败」，且要手抄事项 ID（无选择器） | `{"error":"请求参数校验失败","details":["businessEventId is required"]}`；前台弹窗字段名「关联事项编号 (可选)」，提交后 `400 … businessEventId must be at least 1 characters`（截图 `05-template-submit.png`） | 让 `businessEventId` 真的可选（计提/摊销/结转没有业务事项）；字段加事项搜索选择器；表单校验前置并指明字段 |
| 9 | **高** | 报销单可以自己提交自己审批 | `v4_accountant` 建 `RMB-202608-0003` → submit → approve，全部 200，`status:approved`。路由 `POST /api/reimbursements/:id/transition` 只查 `expense.submit`，handler 无「申请人≠审批人」校验 | `approve` 分支加申请人/审批人不同校验，参考凭证那套 `validateWorkflowAuthorization` |
| 10 | **高** | 凭证分录不可编辑，草稿也删不掉 | `PUT /api/vouchers/:id` 的 SQL 只 `set status, summary`（`vouchers/routes.ts:241`）；`DELETE /api/vouchers/{id}` → 404（路由表无此条） | 至少给 `draft` 状态开放分录编辑与删除；已过账仍只走红冲 |
| 11 | **高** | 明细账/余额查询的筛选参数被静默忽略，返回的是别的科目的数 | `GET /api/ledger/entries?accountCode=660207&from=…&to=…` 返回 4 个科目共 14 条；`GET /api/ledger/balances?accountCode=660207&period=2026-08` 返回全部科目全历史累计。handler 分别在 `ledger/routes.ts:53` 与 `:122`，前者不读 `accountCode`，后者不读任何参数 | 要么实现 `accountCode`/期间过滤，要么对未知参数报 400；顺便补一个真正的「科目明细账」（按科目 + 期间，带方向和逐笔余额） |
| 12 | **中** | 数电票（20 位号码）本地验真必然判「不合规」；且验真不合规完全不阻止生成凭证和挂进项税额 | `POST /api/invoices/{id}/verify` → `{"verifyStatus":"invalid","message":"发票号码格式不正确（应为8位数字）"}`；规则 `invoice-verify.ts:68` `/^\d{8}$/`；同一张票随后成功生成凭证 `ivv-…` 并过账 `付-2026-08-0007`，含 222102 进项税 60.00 | 号码规则放开为 8 位或 20 位；进项抵扣前置验真（或至少在生成凭证时给出阻断级提示） |
| 13 | **中** | 红冲用蓝字对冲而非红字，本期借贷发生额双向虚增 | 红冲后 660207 管理费用出现贷方发生额 1060.00（`/api/ledger/balances`、`/api/reports/trial-balance` 均可见） | 生成负数（红字）分录，或至少在报表口径上把 `source='reversal'` 的发生额单列 |
| 14 | **中** | 红冲与原凭证的关联关系不外露：库里有 `reverses_voucher_id` / `reversed_by`，API 一律不返回 | `GET /api/vouchers/{红冲凭证}` 的字段列表里无 `reversesVoucherId`；`reversal.ts` 的 `ReversalCandidate` 用的就是这两个字段 | 在凭证详情返回并在前台显示「本张冲销 XXX / 本张已被 XXX 冲销」 |
| 15 | **中** | `GET /api/invoices/:id` 路由不存在（404）；发票列表返回 snake_case，与全站 camelCase 不一致 | `GET /api/invoices/inv-1787822829201-d7ssp` → `{"error":"Not Found"}`，但同一 id 在列表里存在；列表字段 `invoice_no` / `seller_name` / `verify_status` | 补详情路由；列表统一成 camelCase |
| 16 | **中** | 重复计提折旧的报错要求「删除该期计提明细」，但系统没有这个接口 | 报错文案 `DEPRECIATION_ALREADY_RUN`「…请先红冲原折旧凭证并删除该期计提明细」；全站 DELETE 路由只有 `/api/ledger/opening-balances` | 提供「撤销本期计提」接口，或改掉这句做不到的引导 |
| 17 | **中** | 报销中心只有「我的报销」「填报销单」两个 tab，会计看不到待处理的他人报销单；inbox 也没有报销待办项 | `/reimbursements` 页面实测只显示我自己那张 `RMB-202608-0003`，而 `GET /api/reimbursements` 返回 4 张；`ReimbursementsPage.tsx:317` 只定义了 mine / create 两个任务；`/api/inbox` 七项里无报销 | 加「待我处理」tab；inbox 加报销待办 |
| 18 | **中** | 固定资产建卡不生成入账凭证，也不与总账 1601 勾稽 | 卡片 `[ACC]FA-2026-001` 原值 36000.00，`/api/reports/trial-balance` 中 1601 固定资产 期末借贷均为 0.00 | 建卡时生成固定资产入账凭证草稿，或在资产页显示「卡片原值 vs 1601 余额」的差异提示 |
| 19 | **中** | 重复点「审核通过」不报错，且无条件覆盖 `approved_by_user_id`，审计上「谁审的」可被顶掉；另无「制单人≠审核人」校验 | 对 `tpl-voucher-1787823708730` 连点两次 approve 均 200；`approveVoucher` 的 SQL `set approved_by_user_id = $4` 无前置条件（`vouchers/routes.ts:311-322`）；我自建的模板凭证自己审核直接通过 | 已审核的凭证再次 approve 应返回 409 或保留首次审核人；补制单/审核分离 |
| 20 | **中** | 凭证列表无筛选无分页，且不显示凭证号与记账日期 | `listVouchers` 只读 `businessEventId`（`vouchers/routes.ts:55`），一次返回 37 张；前台列表列为 摘要/类型/状态流转/创建日期 | 加 status/期间/日期/凭证号筛选与分页；列表补「凭证号」「记账日期」两列 |
| 21 | **中** | 会计角色触发的 403 被渲染成误导性空状态或英文 toast | `/events` 新建弹窗显示「还没有往来单位档案」，实际是 `403 GET /api/counterparties {"requiredPermission":"contracts.view"}`；`/vouchers` 上 `403 GET /api/risk/findings`；建事项失败只弹 `Forbidden` | 403 与「无数据」分开渲染；错误文案中文化并说明缺哪个权限 |
| 22 | **低** | 模板说明与实际科目不符 | `GET /api/vouchers/templates` 中 tax-surcharge 描述写「借税金及附加（6101）」，实际生成的分录科目是 `6403` | 改描述 |
| 23 | **低** | 报表中心默认停在 2026-05，月结页在 2026-08，两处期间不一致，容易看错期 | `/reports` 首屏「已更新 2026-05 财务三表」「期末：2026-05-31」；`/close` 标题「月度结账 · 2026-08」 | 统一走顶栏的全局期间 |
| 24 | **低** | 发票台账「本期进项合计 ¥1,378.00」实为价税合计（1060+318），不是进项税额 | 页面数值与两张票的 `totalAmount` 之和一致 | 改成「本期进项价税合计」，或另列「可抵扣进项税额」 |
| 25 | **低** | `accounting_periods` 表为空 —— 这家公司从没建过会计期间 | `GET /api/ledger/periods` → `{"items":[],"total":0}`（handler 无参数，直接全表查） | 建账时初始化会计期间；「凭证能不能过到未开/已锁期间」我**未验证**（会计日期恒为当天，测不出来） |

---

## 一句话总结

**站在会计这个岗位上，这套系统现在不能用。**

不是不好用，是**干不完**：我做出来的折旧凭证和报销凭证过不了账（`voucher_posting_records.business_event_id` 这个 NOT NULL 约束一条线堵死了所有「没有业务事项的凭证」，连带把月结永久卡在第 4 步）；已过账凭证的红冲按钮在前台是一段永远不会渲染的死代码；公司这个月 17 条待做账的事项我一条都看不见；我甚至建不了一条自己的事项。

**最要命的是数不对而且不吵**：凭证的会计日期被静默改写成「跑接口那天」——创建接口返回给我看的是 2026-07-15，库里存的是 2026-08-27，总账里 21 条分录清一色 2026-08-27。7 月的业务补录进去就记到 8 月，界面上还不告诉你。同一类问题还有 `?accountCode=660207` 被无声忽略、返回一堆别的科目的分录。**会到年审才被发现的错，比一个红色报错危险得多。**

按这个顺序修，这个岗位就能干活了：
1. `voucher_posting_records.business_event_id` 放开 nullable（一条迁移，解四类凭证 + 月结）
2. 两处 insert 补上 `accounting_date`（会计日期这条别再拖了）
3. `role-accountant` 补 `events.create`，并让会计能看到全公司事项
4. 红冲按钮从 `!isPosted` 块里挪出来；`review_required && !approvedAt` 时补上「审核通过」按钮
5. 手工凭证放开（`businessEventId` 可选 + 分录可编辑），再补一张真正的科目明细账

做对的地方也得说：**职责分离（复核人≠记账人、终审人≠执行人）是真的在拦人**；红冲的三条护栏（未过账不能红冲、红冲不能再红冲、不能重复红冲）都对；折旧的四条中国准则（当月增加次月起提、整数分、重复计提拦截、末期扫尾）算得准，`/asset-center` 的两步式入口是全站最顺手的一页；`close-plan` 把每个判据的 SQL 口径写在 `factSources` 里，排查起来省了我半天。底子在，就是几处接线没接上。
