# 税务专员（v4_tax）操作实验报告

> 实验时间：系统日期 2026-08-27（周四）。账号 `v4_tax` / 公司 `cmp-v4-service`（V4 服务子公司）。
> API `http://127.0.0.1:33100`，前端 `http://127.0.0.1:55173`。
> 关键截图存于 `docs/v16-role-simulation/reports/TAX-shots/`。
> 我造的数据一律带 `[TAX]` 前缀；未做 reset / 未锁解会计期间 / 未做增值税期末结转。

## 我是谁

我是这家服务公司的税务专员（很可能是代账机构派驻的，因为整个 `cmp-v4-service` 账套里只有我一个用户）。
我的一个月是这样过的：月初盯上月的销项进项对不对得上票，15 号之前把增值税、附加税、个税扣缴报掉；
季度末加一道企业所得税预缴；年底做汇算清缴和研发费用加计扣除的归集。

我最在意三件事，顺序不能换：

1. **数不能错。** 报出去的数字是要盖章的，错了是滞纳金加罚款。
2. **口径要跟着业务发生日走。** 增值税基本税率 17%→16%→13% 改过两次，小规模 3% 从 2023 年起减按 1%，
   小微企业优惠有年度和门槛。用今天的税率算 2018 年的账，每个数都是错的。
3. **别漏报。** 逾期一天就要罚，所以到期提醒必须是可信的——它说"已申报"我就真的不会再去看第二眼。

---

## 10 件事的结果

### 1. 查本期增值税应纳税额，并核对账簿口径

- **怎么做的**：
  - 页面：`/tax` → 「核对税率与账簿」→ 顶部会计期间切到 2026-05（截图 `05-period-05.png`）。
  - 接口：`GET /api/tax/vat-working-paper/ledger?period=2026-05`、`GET /api/tax/vat-working-paper?filingPeriod=2026-05`。
- **结果**：**部分成功**。账簿口径这一半是对的、可追溯的；税目口径这一半算出来是 `NaN`。

  账簿侧（正确）：
  ```
  {"ledger":{"period":"2026-05","outputTax":"0.00","inputTax":"0.00","inputTransferOut":"0.00",
   "taxPaid":"0.00","simplified":"0.00","payable":"0.00","lines":[]}}
  ```
  税目侧（错误）：
  ```
  {"filingPeriod":"2026-05","taxpayerType":"general_vat","outputTaxAmount":"NaN",
   "payableVatAmount":"NaN","lines":[{"taxRate":"13","taxableAmount":"NaN","taxAmount":"NaN"}]}
  ```
  对账结论页面上原样显示：**「账簿口径 0.00，税目口径 NaN，差额 NaN」**、
  **「有 NaN 的税额录了税目但没有入账——账面少记了这笔负债」**。

  2026-04 / 2026-05 / 2026-06 三个属期全部复现，不是偶发。

- **便捷性**：登录后 3 次点击（税务中心 → 核对税率与账簿 → 切期间）就到了，路径很短，这块设计得好。
- **逻辑正确性**：账簿侧对——它是从总账按增值税科目归集，每行可追溯到凭证，"已交税金单独列示不冲减应纳税额"的处理符合申报表。税目侧是 `NaN`，等于没算。
- **业务合理性**：把"账簿口径 vs 税目口径"并排放、明确写"系统不会自动抹平这个差额"，是懂业务的做法。可惜差额那一栏是 NaN，会计看了只会当成系统坏了。
- **完整性**：本账套一张凭证都没过账（`GET /api/vouchers` 里 3 张全是 draft/review_required），所以账簿侧永远是 0。真要用，得先有人把凭证过账。

### 2. 看销项/进项明细，确认发票和账对得上（票税一致性）

- **怎么做的**：页面 `/risk` →「票税一致性比对」标签（截图 `17-consistency`，见 `nav_risk.png` 同页）；
  接口 `GET /api/tax-integration/consistency?period=2026-08`。
- **结果**：**部分成功**——功能在，入口找得到，但这一期没有可比的数据。
  ```
  {"period":"2026-08","checks":[
    {"key":"output_tax","label":"销项税额（发票 vs 申报）","invoiceValueCents":0,"comparedValueCents":0,"severity":"ok"},
    {"key":"input_tax", ...},{"key":"invoice_vs_ledger_revenue", ...}],
   "overall":"ok","declaredDataAvailable":false,"notes":["申报数据未接入"]}
  ```
  页面同时显示「属期 2026-08 整体比对结果：**一致**」和「申报数据未接入 / 当前申报值暂按 0 计算」。
  另外 `GET /api/invoices` 返回 `total:0`——本账套没有发票，所以是 0 比 0。
- **便捷性**：藏在「风险勾稽中心」而不是「税务中心」，我第一反应是去税务中心找的，没找到。3 次点击但要先猜对模块。
- **逻辑正确性**：0 与 0 相比得出绿色的"一致"是误导。它诚实地在旁边写了"申报数据未接入"，但结论标签应该是"无法比对"而不是"一致"。
- **业务合理性**：比对项选得对（销项/进项/收入三条），这正是税务局比对的三条线。用属期做维度也对。
- **完整性**：缺"申报数据接入"这一环，所以永远只能拿发票和账面比，比不了申报值。真正的票表比对做不了。

### 3. 查纳税人身份配置，看它怎么影响税率推导

- **怎么做的**：页面 `/tax?task=profile`（截图 `23-profile`）；接口 `GET/POST /api/taxpayer-profiles`、`GET /api/tax/rules`。
- **结果**：**部分成功，并发现一个阻断级缺陷**。
  1. 起手 `GET /api/taxpayer-profiles` → `{"items":[],"total":0}`，**整个增值税链条是断的**：
     `GET /api/tax/vat-working-paper` → `{"error":"Active taxpayer profile not found"}`，
     `GET /api/tax/vat-settlement` → `{"code":"TAXPAYER_PROFILE_NOT_FOUND"}`。
     必须先建档案。页面上有入口（一般纳税人/小规模/一般纳税人简易计税 三选一 + 保存口径），能建。
  2. 建完后「解析增值税规则」返回：
     ```
     GET /api/tax/rules?taxType=增值税&occurredOn=2026-05-01
     {"taxType":"增值税","taxpayerType":"general_vat","filingFrequency":"monthly","defaultRate":"13","filingPeriod":"2026-05"}
     ```
     **默认税率 13% 对这家公司是错的**——它是服务公司，自己的凭证就是按 6% 记的
     （`voucher-CON-MISSING-001-accrual`：预收 83018.87 + 销项 4981.13 = 88000，正好 6%）。
  3. 我用一条生效日放在 2030 年的探针档案验证小规模口径：
     ```
     GET /api/tax/rules?...&occurredOn=2030-03-15
     {"taxpayerType":"small_scale","filingFrequency":"quarterly","defaultRate":"3"}
     ```
     **返回 3%，但税率主数据里 2023-01-01~2027-12-31 明确是「3% 征收率，减按 1% 征收」**。两个数据源打架。
  4. **最严重的**：新建这条 2030 年的档案，把 2026-01-01 那条**直接改成了 inactive**：
     ```
     {"id":"taxpayer-1787822620299","taxpayerType":"general_vat","effectiveFrom":"2026-01-01","status":"inactive"}
     ```
     结果 `GET /api/tax/rules?...&occurredOn=2026-05-01` 立刻变成 `{"error":"Active taxpayer profile not found"}`。
     一条**未来生效**的登记，把**当期**的口径打没了。
     代码确认（`apps/api/src/modules/tax/routes.ts:909-919`）：插入前无条件
     `update taxpayer_profiles set status='inactive' where company_id=$1 and status='active'`。
     而解析函数 `profile.ts:resolveActiveTaxpayerProfile` 是按 `status==='active' && effectiveFrom<=onDate` 挑最晚的一条——
     它本来就是为"多条 active 带生效日"设计的。写入端和读取端的口径互相矛盾。
- **便捷性**：4 次点击能建档，不难找。
- **逻辑正确性**：**不对**。①默认税率不查税率主数据、写死 13/3（`rules.ts:resolveTaxRuleProfile`）；②新增即作废旧档，纳税人身份沿革保存不了。
- **业务合理性**：**不合实务**。小规模转一般纳税人是极常见的事件，转完之后所有旧属期的底稿全部报"没有生效档案"，等于历史不可重算——这恰恰是税率模块自己反复强调要避免的。另外档案里**没有纳税人识别号 / 统一社会信用代码 / 主管税务机关**字段，这不叫纳税人档案。
- **完整性**：申报频率是推导出来的、不可配置。现实中一般纳税人也有核定按季申报的，小规模也有申请按月的，改不了。

### 4. 查税率主数据，看历史沿革在不在

- **怎么做的**：页面 `/tax?task=rates`，切「当期适用」/「全部沿革」（截图 `03-rates.png`、`06-history.png`）；
  接口 `GET /api/tax/rates?taxType=vat[&on=YYYY-MM-DD]`；另外测了 `POST /api/tax/rates` 和 `POST /api/tax/rates/:id/expire`。
- **结果**：**成功。这是整套系统里做得最好的一块。**
  ```
  on=2018-03-15: vat_basic=17%, vat_low=11%, vat_service=6%, vat_small=3%
  on=2018-06-15: vat_basic=16%, vat_low=10%, vat_service=6%, vat_small=3%
  on=2019-05-10: vat_basic=13%, vat_low=9%,  vat_service=6%, vat_small=3%
  on=2026-08-27: vat_basic=13%, vat_low=9%,  vat_service=6%, vat_small=3%(减按1%)
  ```
  沿革全在：17→16→13、11→10→9、小规模 3%（2016-05-01~2022-12-31）→ 3% 减按 1%（2023-01-01~2027-12-31）。
  页面**确实按业务发生日取**：切到 2026-05 时请求是 `?taxType=vat&on=2026-05-01`（属期首日），不是取今天。
  页面上还写了原因：「税率按业务发生日取，不是取"最新的那档"……用今天的税率重算 2018 年的账，每个数都是错的」。
  自定义税率写入的护栏也对：重叠区间被挡住——
  ```
  POST /api/tax/rates {"code":"TAX_probe","effectiveFrom":"2026-03-01",...}
  → {"code":"TAX_RATE_OVERLAPS","error":"税率 TAX_probe 已有生效区间与此重叠（2026-01-01 起）…请先给旧记录填上失效日，再新增。"}
  ```
- **便捷性**：2 次点击。当期/全历史一键切换，比我平时翻政策文件快。
- **逻辑正确性**：对。减征用 `levyRate` 单列、`describeRate` 把"3% 征收率，减按 1% 征收"两个数都写出来，符合底稿要求。
- **业务合理性**：完全认可。这是真懂税的人设计的。
- **完整性**：**缺一个前台入口**——`POST /api/tax/rates`（新增公司自定义税率）后端有、我也有 `tax.manage` 权限、API 调通了，
  但前端 `apps/web/src/lib/api/cost-and-rates.ts` 里只有 `listTaxRates` 和 `expireTaxRate`，**没有 create**，
  页面「操作」列只有"停用"。我只能用 curl 建一档，然后回页面点"停用"把它封口（这一步页面是好用的，
  提示写着「已给「[TAX] 探针税率 6%」设止日 2026-08-31，此后不再适用」）。

### 5. 企业所得税预缴测算

- **怎么做的**：页面 `/tax?task=materials` → 资料视图「企业所得税准备」→「生成准备稿」（截图 `14-cit.png`）；
  接口 `GET /api/tax/corporate-income-tax-preparation?filingPeriod=2026-Q2`。
- **结果**：**部分成功**——出得来数，但口径是简化到不能用的程度。
  ```
  {"filingPeriod":"2026-Q2","accountingProfit":"0","taxableIncomeEstimate":"0",
   "incomeTaxRate":"25","prepaymentTaxEstimate":"0","adjustmentHints":[],"checklist":[...]}
  ```
  代码 `corporate-income-tax.ts`：`const incomeTaxRate = 25;`，`prepayment = taxableIncome * 25%`。
- **便捷性**：4 次点击，不难。
- **逻辑正确性**：作为"会计利润×25%"是对的，但少了四件必须的事：
  ① **没有小型微利企业优惠**——全库 grep `小型微利|小微企业|高新技术企业` 在 `apps/api/src` 里**零命中**。
     年应纳税所得额 300 万以内减按 25% 计入、按 20% 税率（实际 5%）这条对一家中小科技企业是最相关的优惠，系统完全没建模，预缴会高估 5 倍。
  ② **没有弥补以前年度亏损**。
  ③ **没有减除累计已预缴税额**——Q2/Q3 用累计利润总额×25% 会重复缴。
  ④ `Math.max(totalProfit, 0)` 把亏损直接夹成 0，亏损期看不出来是亏损。
- **业务合理性**：一个真的税务专员不会用这个数去填 A200000，只会当成一个粗算的参考值。研发加计扣除只给了一句文字提示，没有真的抵减应纳税所得额——而 2023 年起预缴期就可以享受加计扣除了。
- **完整性**：**申报期默认是 `2026-Q2`（硬编码）**，今天是 8 月，该准备的是 Q3，Q2 的预缴 7 月 15 已经到期了。这个默认值来自 `apps/web/src/pages/tax/useTaxWorkspace.ts:74 setIncomeTaxPeriod("2026-Q2")`。

### 6. 查研发费用加计扣除的归集情况

- **怎么做的**：左侧菜单「研发风控」→ `/rnd`（截图 `16-rnd.png`）；接口 `GET /api/rnd/projects`、`GET /api/rnd/trend`。
- **结果**：**做不了**。
  ```
  GET /api/rnd/projects → 403 {"error":"Forbidden","requiredPermission":"rnd.view"}
  GET /api/rnd/trend    → 403 同上
  ```
  角色权限表 `apps/api/src/middleware/auth.ts:73-80`，`role-tax-specialist` 里**没有 `rnd.view`**。
  更糟的是页面**没有告诉我是权限问题**，它照常渲染了完整的研发辅助账界面，然后写着：
  > 「还没有研发项目 / 点击右上角「新建研发项目」立项后，才能开始归集费用」
  > 「研发台账概览：研发项目 0 个」

  角落里只有一个孤零零的 `Forbidden`。如果我不看网络面板，我会得出"这家公司没有研发项目、不用做加计扣除"的结论——这是会导致漏享受优惠的误导。
- **便捷性**：菜单里就有入口，1 次点击。但点进去是死路。
- **逻辑正确性**：把"无权限"渲染成"无数据"是错的。
- **业务合理性**：**角色划分不合理**。研发费用加计扣除归集就是税务专员的活（备查资料、辅助账、汇算填报），把它划给别的角色而不给税务专员看的权限，说不通。反证：`/api/tax/corporate-income-tax-preparation` 内部**就要读** R&D 汇总来生成"存在研发加计扣除基础"的提示——税务模块自己要用，却不让税务角色看底稿。
- **完整性**：政策口径本身写得对（`rnd/summary.ts`：加计基数只含费用化部分，资本化按成本 200% 摊销分期实现，引了财税 2023 年第 7 号），但我够不着。

### 7. 生成一份申报底稿并预览

- **怎么做的**：
  - 页面 A：`/tax?task=materials` →「增值税底稿」→「生成底稿」→「打印底稿」（截图 `11-generated.png`）。
  - 页面 B：`/tax` →「按向导申报增值税（2026-05）」四步向导（截图 `13b-wiz2.png`）。
  - 页面 C：`/tax?task=batches` 申报批次工作台（截图 `20-batch.png`、`21-submit.png`）。
  - 接口：`GET /api/tax/vat-working-paper`、`GET /api/tax/printable?kind=vat&filingPeriod=`、`POST /api/tax-filing-batches` 全套。
- **结果**：**部分成功**——四条路都走得通，但终点上的数是 NaN，而且批次提交在这家公司**永远提交不了**。

  生成底稿（页面原文）：
  ```
  纳税人口径：一般纳税人 / 申报期：2026-05
  销项税额：NaN   进项税额：0   简易计税额：0   应纳增值税：NaN
  类型      说明                            税率   计税基础  税额
  output   复核销项税确认时点、税率和开票节点。  13%    NaN      NaN
  ```
  向导第三步（页面原文）：
  ```
  申报表已就绪
  申报期间 2026-05 / 销项税额 ¥NaN / 进项税额 ¥0.00 / 应缴税额 ¥NaN
  ```
  向导没有任何校验拦住 NaN，可以一路点到"记录结果"。

  打印底稿：`GET /api/tax/printable?filingPeriod=2026-05` 返回的是一段 `<pre>` 包着的原始 JSON——
  英文字段名、`"outputTaxAmount": "NaN"`、没有表头、没有属期栏、没有纳税人识别号、没有制表/复核签字位。这不是能附在申报后面的底稿。

  批次全流程：
  ```
  POST /api/tax-filing-batches {"taxType":"增值税","filingPeriod":"2026-05","itemIds":[...]}
    → status:"review_required"
  POST .../validate → {"valid":false,"issues":["批次中存在未 ready 的税务事项"]}   ← 护栏正确
  POST .../submit   → {"error":"Tax filing batch is not ready for submit"}          ← 护栏正确
  PUT /api/tax-items/:id {"status":"ready"} → ok
  POST .../validate → {"valid":true}
  POST .../review {"reviewResult":"approved"} → status:"ready"
  POST .../submit {"authorizerUserId":"usr-v4-tax",...}
    → 400 {"error":"executor and authorizer must be different users","code":"WORKFLOW_DUTY_CONFLICT"}
  ```
  在页面上点「提交批次」，屏幕上直接弹出**英文原文** `executor and authorizer must be different users`（截图 `21-submit.png`）。
  批次工作台的表单里**只有** 复核说明 / 留档标签 / 留档说明 三个输入框，**没有授权人选择**。
  而 `GET /api/settings/users` 显示 `cmp-v4-service` **总共只有我一个用户**。
  → 这家公司的增值税申报批次**在产品内无法完成提交**。
  （测完我已把 `tax-item-CON-MISSING-001-增值税` 的状态改回 `review_required`。）

  另外 `GET /api/runtime/tax` 同时告诉我：
  ```
  "authorizationState":"authorized","authorizationLabel":"你可推进申报",
  "authorizationMessage":"当前身份可继续完成申报提交、复核或留档动作。"
  ```
  说我可以提交，点下去必然 400。运行态在说谎。

- **便捷性**：入口很多（任务切换器 6 个按钮 + 向导 + 批次台），找得到。但同一件事有三个入口、三套口径，反而要想一下该从哪进。
- **逻辑正确性**：**核心数字是 NaN**。根因已定位：`buildVatWorkingPaper` 用 `Number(item.basis)` 当计税依据
  （`vat-working-paper.ts` 的 `parseAmount(item.basis)`），而 `basis` 在整个生成侧写的都是**政策依据文字**——
  `events/event-mappings.ts`、`contract-revenue-rules.ts`、`purchase-expense-rules.ts` 全部写的是
  `basis: scenario.taxSummary` 这类散文。实测 7 条税目的 basis 分别是「阻止重复生成销项税额」「已开票部分按税法确认增值税义务…」等。
  `Number("阻止重复生成销项税额")` = `NaN`。领域模型里 `TaxItem.basis: string` 一个字段被两边当成两个意思用。
  （模块自己的单测里 `basis: "1000"`，所以测试是绿的，生产是 NaN。）
- **业务合理性**：批次的四步（校验→复核→提交→留档）和不相容职务分离，是我认可的内控设计。但对单人税务岗**没有任何逃生口**（没有委派、没有"本单位仅一人"豁免、没有跨公司授权人）。而且复核可以自己批、提交不能自己批，这个口径本身就不一致。
- **完整性**：底稿不能打印成可用文件；批次不能提交；应纳税额是 NaN。这件事实际上干不完。

### 8. 导出申报数据（增值税 XML / 个税 CSV）

- **怎么做的**：页面 `/export-center` →「税务申报文件」（截图 `18-export-tax.png`），点四个导出按钮；
  接口 `GET /api/tax-integration/{vat-xml,iit-csv,si-csv,fund-csv}?period=`、`GET /api/tax-integration/submissions`。
- **结果**：**部分成功**——增值税 XML 能下载但内容有毒；三个 CSV 全部 500。

  增值税 XML（浏览器实际下载成功，文件名 `增值税申报_2026-05.xml`）：
  ```xml
  <纳税人信息>
    <纳税人识别号></纳税人识别号>          ← 空
    <纳税人名称>V4 服务子公司</纳税人名称>
  </纳税人信息>
  <一般计税>
    <本期销项税额>NaN</本期销项税额>       ← NaN
    <应纳税额>0.00</应纳税额>             ← 与下面自相矛盾
  </一般计税>
  <合计><本期应补（退）税额>NaN</本期应补（退）税额></合计>
  ```
  文件头还写着「本文件仅供上传至电子税务局使用，请勿手工修改」。没有任何校验拦住它。

  三个 CSV：
  ```
  GET /api/tax-integration/iit-csv?period=2026-05  → 500 {"error":"Internal Server Error","requestId":"req-b0fae25d124d3298"}
  GET /api/tax-integration/si-csv                  → 500
  GET /api/tax-integration/fund-csv                → 500
  ```
  服务端日志给出根因：
  ```
  {"level":"error","msg":"unhandled request error","path":"/api/tax-integration/iit-csv",
   "error":"relation \"payroll_policies\" does not exist"}
  ```
  代码 `declaration-export.routes.ts:240` 查的是 `payroll_policies`（复数），
  而迁移 `migrations/008_employees_payroll.sql:20` 建的表叫 **`payroll_policy`（单数）**。纯粹的表名拼写不一致，三个导出全挂。

  「申报文件历史」表格里，我生成的记录**税种、文件名、生成时间三列全是空白**（截图 `18-export-tax.png`）。
  原因：`listSubmissions` 直接把数据库行 `SELECT id, tax_type, filing_period, file_name, created_at …` 原样返回，
  而前端 `DeclarationExportPanel.tsx:102,106` 的 `dataIndex` 用的是 `taxType` / `fileName` —— snake_case 对 camelCase，对不上。

  统一社会信用代码为什么是空的：`GET /api/settings/company` → `"creditCode":""`，
  而我去填 → `PUT /api/settings/company` → `403 {"requiredPermission":"settings.manage"}`。
  同时「我的一天」的快速开始清单**却在催我**「完善公司信息：填写统一社会信用代码、开户行等档案」。
- **便捷性**：导出中心分区清晰，「这一栏生成的是上传电子税务局用的申报文件，算多少仍在税务中心完成」这句边界说明写得很好。3 次点击到位。
- **逻辑正确性**：XML 含 NaN、税号为空、`应纳税额` 与 `本期应补（退）税额` 自相矛盾；CSV 全 500；历史表格列错位。
- **业务合理性**：一个真人会把这个 XML 上传上去，然后被电子税务局校验打回（或者更糟——被接收）。生成申报文件前必须有一道"金额必须是有效数字、纳税人识别号必填"的闸门。
- **完整性**：增值税这一半勉强跑通，个税/社保/公积金这一半完全不通。

### 9. 查本期的税务风险提示

- **怎么做的**：左侧菜单「研发风控」→「风险勾稽中心」`/risk`（截图 `nav_risk.png`）；接口 `GET /api/risk/findings`。
- **结果**：**做不了**。
  ```
  GET /api/risk/findings → 403 {"error":"Forbidden","requiredPermission":"risk.view"}
  ```
  `role-tax-specialist` 的权限列表里**没有 `risk.view`**（`auth.ts:73-80`）。
  和研发页一样，页面照常渲染，然后显示：
  > 高危 0 · 全部已关闭 / 中危 0 · 全部已关闭 / 低危 0 · 全部已关闭 / 整体关闭率 0% · 共 0 条 · 已关 0 条
  > 当前筛选范围内暂无风险发现

  但**同一个账号**在导出中心能看到：
  ```
  GET /api/archive/package?period=2026-08
  {"stage":"risk","label":"风险勾稽","detail":"已关闭 0 项，未关闭 7 项","complete":false}
  ```
  系统一边告诉我有 7 条未关闭的风险，一边拒绝告诉我是哪 7 条，同时风险页面又显示"全部已关闭"。

  而这些风险恰恰是我的活——风险引擎 `risk/engine.ts` 里的规则是：
  「销售收入已入账但未形成增值税事项」「采购事项缺少进项税处理」「报销事项缺少可税前扣除或抵扣依据」。
- **便捷性**：入口在，1 次点击，但是死路。
- **逻辑正确性**：把 403 渲染成"0 条 / 全部已关闭 / 关闭率 0%"是最坏的一种错——它给了一个虚假的安心。
- **业务合理性**：税务风险规则全是税务规则，却对税务角色关闭。这个角色权限表明显没按岗位职责配。
- **完整性**：这件事在这个账号下 0% 完成。

### 10. 看申报到期提醒，确认不会漏报

- **怎么做的**：`/` 我的一天首页提醒卡；`/tax?task=calendar` 税务日历（截图 `07-deadlines.png`）；
  接口 `GET /api/tax/deadlines?period=`。
- **结果**：**部分成功，但提醒本身不可信**。

  ① **前后端两套申报义务清单，互相不认**：
  ```
  后端 GET /api/tax/deadlines?period=2026-08
  → vat「增值税及附加」/ iit「个人所得税扣缴」/ si「社保费」/ housing_fund「住房公积金」  ── 4 项
  ```
  ```
  前端 /tax?task=calendar 页面显示
  → 增值税 / 个人所得税 / 印花税                                                     ── 3 项
  ```
  税务日历根本**没有调 `/api/tax/deadlines`**（网络面板里一次请求都没有），它用的是前端自己的
  `apps/web/src/pages/tax/tax-obligations.ts:TAX_SCHEDULE`（vat/iit/stamp/cit）。
  于是首页卡片说「2026-08 申报到期：**还有 4 个税种**没申报」，点进税务中心的日历显示「已完成 **0/3**」。同一页面链路上两个数。

  ② **后端从不提示企业所得税，即使在季末月**：
  ```
  GET /api/tax/deadlines?period=2026-06 → ['vat','iit','si','housing_fund']
  ```
  代码 `deadlines.ts:OBLIGATIONS` 是四个写死的常量，也没有印花税。
  企业所得税季度预缴（季末次月 15 日）是我最不能漏的一项，后端提醒里根本没有。

  ③ **前端把印花税当成按月申报**（`TAX_SCHEDULE` 里 `stamp: frequency "monthly"`）。
     印花税法之后绝大多数应税凭证是按季申报（季度终了 15 日内），按月每月提醒一次不符合实务。

  ④ **最危险的一条：生成一个文件就算"已申报"。**
  我在第 8 件事里点了一次「增值税申报表 (XML)」，然后：
  ```
  GET /api/tax/deadlines?period=2026-05
  vat filed=True  urgent=False  2026-06-15     ← 变成已申报，不再提醒
  iit filed=False urgent=True
  si  filed=False urgent=True
  housing_fund filed=False urgent=True
  ```
  而这笔申报的真实状态是：
  ```
  GET /api/tax-integration/submissions?period=2026-05
  tax_type=vat  status=generated  confirmed_at=None
  ```
  代码 `deadlines.routes.ts`：`SELECT DISTINCT tax_type FROM tax_declaration_submissions WHERE company_id=$1 AND filing_period=$2`
  ——**只要有一条记录就算已申报，不看 status**。
  我只是导了个文件，还没上传电子税务局、没登记回执流水号，逾期 73 天的提醒就自己消失了。这是真的会导致漏报罚款的。

  ⑤ 日历只显示"当前会计期间"这一期。2026-04/05/06/07 全部未申报（`filed:false`、`daysLeft:-73`），
     但税务日历上看不到任何逾期期间，我得手动一个月一个月切期间去找。
- **便捷性**：首页有卡片、日历有独立入口、卡片上带「去税务中心看明细」的直达链接——这块的交互是好的。
- **逻辑正确性**：见上，四个问题，其中"生成即已申报"是硬伤。
- **业务合理性**：税务日历的形态（卡片、剩余天数、逾期红色、"开始申报向导 →"）很像真实的申报日历，方向对。但义务清单要按纳税人身份推导（小规模按季）、要包含企业所得税、要能看历史逾期期。
- **完整性**：作为"不会漏报"的保障，现在不合格。

---

## 发现的问题（按严重度排序）

| # | 严重度 | 问题 | 证据 | 我建议 |
|---|--------|------|------|--------|
| 1 | 阻断 | 增值税底稿 / 申报向导 / 申报 XML 的销项税额与应纳税额全是 `NaN`。`buildVatWorkingPaper` 把 `TaxItem.basis` 当计税依据 `Number()`，但生成侧写进去的是政策依据散文 | `GET /api/tax/vat-working-paper?filingPeriod=2026-05` → `"outputTaxAmount":"NaN"`；2026-04/05/06 均复现；`tax_items.basis` 实值如「阻止重复生成销项税额」；`vat-working-paper.ts:parseAmount(item.basis)` vs `events/event-mappings.ts:basis:"需按合同性质复核税目与计税依据。"` | `TaxItem` 拆成 `taxableAmountCents`（数字）与 `policyBasis`（文字）两个字段；解析失败时抛错而不是让 `NaN` 流下去；底稿/向导/导出三处各加一道"金额必须有限数"的闸门 |
| 2 | 阻断 | 个税/社保/公积金 CSV 导出全部 500 —— 代码查 `payroll_policies`，迁移建的表叫 `payroll_policy` | `GET /api/tax-integration/iit-csv?period=2026-05` → 500；API 日志 `relation "payroll_policies" does not exist`；`declaration-export.routes.ts:240` vs `migrations/008_employees_payroll.sql:20` | 改表名（一行）；补一个覆盖这三个导出的冒烟测试——`tsc` 查不到 SQL 里的表名 |
| 3 | 阻断 | 单人公司的申报批次**提交不了**：职责分离要求执行人≠授权人，而 `cmp-v4-service` 只有我一个用户，批次工作台又没有授权人选择框 | `POST /api/tax-filing-batches/:id/submit` → `400 WORKFLOW_DUTY_CONFLICT`；页面弹出英文原文（截图 `21-submit.png`）；`GET /api/settings/users` → `total:1` | 批次台加授权人选择器（列出本公司/上级公司有 `tax.manage`/审批权限的人）；单人组织给出明确的替代路径（如上级公司授权人、或"仅一人"配置项）；错误文案汉化 |
| 4 | 阻断 | 新建纳税人档案会把**所有**历史档案改成 inactive，纳税人身份沿革保存不了；连一条未来生效的登记都会立刻打断当期口径 | 建 2030-01-01 小规模档后：`{"effectiveFrom":"2026-01-01","status":"inactive"}`，`GET /api/tax/rules?occurredOn=2026-05-01` → `Active taxpayer profile not found`；`tax/routes.ts:909-919` 的无条件 `set status='inactive'` 与 `profile.ts:resolveActiveTaxpayerProfile` 的多档设计矛盾 | 照搬税率主数据那套：新增时给上一档填 `effective_to`，允许多条 active 带生效区间；档案里补 `纳税人识别号 / 统一社会信用代码 / 主管税务机关 / 认定日期` |
| 5 | 阻断 | 税务专员没有 `rnd.view` 与 `risk.view`，研发费用加计扣除归集与税务风险提示两件本职工作完全做不了 | `GET /api/rnd/projects` → 403；`GET /api/risk/findings` → 403；`auth.ts:73-80` 角色权限表；风险规则本身全是税务规则（`risk/engine.ts`：「销售收入已入账但未形成增值税事项」等） | 给 `role-tax-specialist` 加上 `rnd.view` 与 `risk.view`（读权限，不含关闭动作） |
| 6 | 高 | 403 被渲染成"没有数据"：研发页显示「还没有研发项目 / 研发项目 0 个」，风险页显示「0 条 · 全部已关闭 · 关闭率 0%」。同一账号在归档包里却能看到「未关闭 7 项」 | 截图 `16-rnd.png`、`nav_risk.png`；`GET /api/archive/package?period=2026-08` → `"detail":"已关闭 0 项，未关闭 7 项"` | 403 必须渲染成"你没有查看权限，请联系管理员"，绝不能落到空态文案；空态与无权限是两个状态 |
| 7 | 高 | 只要生成过一次申报文件，到期提醒就认为该税种"已申报"，逾期告警消失——不看 `status`，也不看有没有回执 | 点一次「增值税申报表 (XML)」后 `GET /api/tax/deadlines?period=2026-05` → `vat filed=True`；而 `submissions` 里 `status=generated, confirmed_at=None` | `filed` 判定改为 `status='confirmed'`（或有 `submission_ref`）；"已生成未上传"要单独是一个中间状态并继续提醒 |
| 8 | 高 | 服务业公司的底稿按 13% 算。`resolveVatRateCode` 只认 基本/简易/小规模 三档，6%（现代服务）和 9% 分不出来；`rules.ts` 的默认税率更是直接写死 13/3，根本不查税率主数据 | 底稿行 `"taxRate":"13"`，而同一公司的凭证是 6%（88000 = 83018.87 + 4981.13）；`GET /api/tax/rules` → `"defaultRate":"13"`；小规模探针 → `"defaultRate":"3"`，但主数据是"减按 1%" | 给 `tax_items` 加 `rate_code`，录入/复核时选定档次；`rules.ts` 的 `defaultRate` 改为查 `tax_rates`（按业务发生日 + 纳税人身份），删掉写死的 13/3 |
| 9 | 高 | 企业所得税预缴：税率写死 25%，无小型微利企业优惠、无高新 15%、无弥补以前年度亏损、无减除累计已预缴，亏损被 `Math.max(...,0)` 夹成 0 | `corporate-income-tax.ts:const incomeTaxRate = 25;`；`grep -r "小型微利\|小微企业\|高新技术企业" apps/api/src` → 0 命中；`GET /api/tax/corporate-income-tax-preparation?filingPeriod=2026-Q2` → `"incomeTaxRate":"25"` | 建一张所得税优惠口径表（小微分档、高新 15%、生效区间），按属期取；预缴公式补上"累计已预缴"和"以前年度亏损"；亏损保留负号 |
| 10 | 高 | 申报期默认值是开发期写死的 `2026-05` / `2026-Q2`，与顶部全局会计期间（2026-08）脱钩 | `useTaxWorkspace.ts:71-74` 四个 `useState("2026-05")` / `("2026-Q2")`；页面上向导标题就是「按向导申报增值税（2026-05）」 | 默认值从全局会计期间推导（月报取上月、季报取上一完整季）；那四个裸 `<input placeholder="申报期">` 换成带校验的期间选择器 |
| 11 | 中 | 前后端两套申报义务清单：后端 vat/iit/si/housing_fund，前端 vat/iit/stamp/cit；日历不调后端接口，导致首页说"4 个税种"、日历说"0/3" | `GET /api/tax/deadlines?period=2026-08` 四项 vs 页面三项；`tax-obligations.ts:TAX_SCHEDULE`；首页卡片原文「还有 4 个税种没申报」 | 义务清单收敛到后端一处，按纳税人身份推导频率（小规模季报）；前端只渲染不推导 |
| 12 | 中 | 后端到期提醒里没有企业所得税季度预缴，也没有印花税；前端把印花税当按月 | `GET /api/tax/deadlines?period=2026-06` → `['vat','iit','si','housing_fund']`；`deadlines.ts:OBLIGATIONS` 四常量；`TAX_SCHEDULE` 里 `stamp: monthly` | 补企业所得税（季度）与印花税（按季/按次）；到期日加节假日顺延 |
| 13 | 中 | 附加税（城建税、教育费附加、地方教育附加）全系统没有任何计算 | `grep -r "城建\|教育费附加" apps/api/src` 只命中科目名 `222106` 和凭证模板文案，没有计算模块；`GET /api/tax/stamp-and-surtax-summary` 只是按 `taxType.includes("附加")` 过滤税目，返回 `"surtaxItems":[]` | 附加税按实缴增值税×(城建 7/5/1% + 教育费附加 3% + 地方教育附加 2%) 计算，小规模/小微减半，与增值税底稿联动 |
| 14 | 中 | 「申报文件历史」表格税种/文件名/生成时间三列空白：接口返回 snake_case，前端列用 camelCase | `GET /api/tax-integration/submissions` → `{"tax_type":"vat","file_name":"增值税申报_2026-05.xml","created_at":...}`；`DeclarationExportPanel.tsx:102,106` `dataIndex:"taxType"/"fileName"`；截图 `18-export-tax.png` | 接口按全站惯例转 camelCase（其余税务接口都是 camelCase） |
| 15 | 中 | 「打印底稿」输出的是 `<pre>` 包的原始 JSON——英文字段名、`NaN` 明文、无表头/属期/纳税人识别号/签字位 | `GET /api/tax/printable?kind=vat&filingPeriod=2026-05` 返回体；`printable.ts` 11 行 | 做成真正的底稿版式：抬头（公司名+纳税人识别号+属期）、销项/进项/应纳税额分区、明细表、制表人/复核人/日期 |
| 16 | 中 | 运行态说「你可推进申报 / 当前身份可继续完成申报提交」，实际提交必然 400 | `GET /api/runtime/tax` → `"authorizationState":"authorized"`；`POST .../submit` → 400 `WORKFLOW_DUTY_CONFLICT` | 授权态判定要把职责分离一起算进去，否则它是在鼓励用户去撞墙 |
| 17 | 中 | 票税一致性在"申报数据未接入、0 比 0"的情况下给出绿色「整体比对结果：一致」 | `GET /api/tax-integration/consistency?period=2026-08` → `"overall":"ok","declaredDataAvailable":false` | `declaredDataAvailable:false` 时整体结论改为「无法比对」，不要给绿灯 |
| 18 | 中 | 后端能新增公司自定义税率，前台点不到 | `POST /api/tax/rates` 我用 curl 建成功了（我有 `tax.manage`）；`apps/web/src/lib/api/cost-and-rates.ts` 只有 `listTaxRates`/`expireTaxRate`，没有 create；页面「操作」列只有"停用" | 补一个"新增自定义税率"按钮 + 表单（含重叠校验的错误提示回显，后端消息已经写得很好） |
| 19 | 中 | 公司统一社会信用代码为空，申报 XML 的 `<纳税人识别号>` 就是空的；税务专员改不了，但首页快速开始清单在催他去改 | `GET /api/settings/company` → `"creditCode":""`；`PUT /api/settings/company` → `403 settings.manage`；XML 中 `<纳税人识别号></纳税人识别号>`；首页「⬜ 完善公司信息 填写统一社会信用代码…」 | 生成申报文件前校验纳税人识别号非空；快速开始清单按当前角色的实际权限过滤，别派给做不了的人 |
| 20 | 低 | 会计期间选择器右侧显示空括号「[ ] 切换月份」（快捷键占位没渲染出来） | DOM：`<span aria-hidden="true" …>[ ] 切换月份</span>`，全站每页都有 | 补上快捷键或去掉方括号 |
| 21 | 低 | 底稿「类型」列显示英文 `output` / `input` | 页面原文「output 复核销项税确认时点、税率和开票节点。 13% NaN NaN」 | 映射成 销项 / 进项 / 调整 |
| 22 | 低 | 角色标识不一致：`/api/access/me` 给 `role-tax-specialist`，`/api/settings/users` 给 `role-v4-service-tax-specialist`；税务专员的部门是"人力资源部" | 两个接口的返回体 | 统一角色 id；修种子数据的部门 |

### 一个未定位的环境异常（如实记录，未查明）

实验开始时我拿到的一个 access token（`a7545d4a…`）在整个实验期间**稳定地**返回 `cmp-v4-tech` 的数据
（`/api/vouchers` 19~20 条全是 cmp-v4-tech），而同一账号**新登录**拿到的 token 稳定返回 `cmp-v4-service`（3 条）。
两个 session 同时有效、各自确定。代码上 session 的 company 来自 `users.company_id`（`auth.ts:buildSession`），
所以只有"那一刻 `users` 表里 v4_tax 的公司是 cmp-v4-tech"能解释——但我没有找到任何能改用户公司的接口。
考虑到有 5 个 agent 在同库并发作业，也可能是别人重播了种子数据。**我没有查明，记录在此，不作为结论。**
后续验证我全部改用新登录的 token（`cmp-v4-service`，与 `tests/fixtures/v4/users.json` 一致）。

### 我在这个账套里留下的东西

| 对象 | 说明 |
|------|------|
| `taxpayer-1787822620299` / `taxpayer-1787823662453` / `taxpayer-1787823691509` | 纳税人档案 3 条，均带 `[TAX]` 备注。最终生效的是最后一条 general_vat（2026-01-01），与实验开始前"零档案"的差别是：现在有档案了（否则增值税链路全部不可用） |
| `rate-cmp-v4-service-TAX_probe-2026-01-01` | `[TAX] 探针税率 6%`，已通过页面「停用」封口到 2026-08-31。系统按设计不提供删除接口 |
| `tax-batch-1787823487044` | `[TAX]` 复核记录所在的增值税申报批次（2026-05），状态停在 `ready`（提交被职责分离挡住） |
| `sub-1787822793952-xubms` 等 | 增值税 XML 导出记录 2 条（2026-05）。**注意：这两条会让 `/api/tax/deadlines?period=2026-05` 把增值税显示为"已申报"**，见问题 #7 |
| `tax-item-CON-MISSING-001-增值税` | 曾临时改为 `ready` 走批次流程，**已改回 `review_required`** |

---

## 一句话总结

**现在不能用。** 税率主数据这一块（按业务发生日取税率、17→16→13 全沿革、小规模减按 1%、封口不删除）是真懂税的人做的，
我愿意直接拿它当政策速查表用；申报批次的四步内控和「账簿口径 vs 税目口径」并排对差的思路也对。
但从税务专员的椅子上看，这套系统在四个地方是断的：**算出来的增值税是 `NaN`**、
**个税社保公积金三个申报文件全部 500**、**单人公司的申报批次永远提交不了**、
**研发加计扣除和税务风险两件本职工作被权限挡在门外还伪装成"没有数据"**。
再加上"生成一个文件就当已申报"让到期提醒失去意义、企业所得税没有小微优惠、附加税压根没算——
我这个月的税，一样也报不出去。

缺的东西按优先级只有四件：把 `basis` 的一字两义拆开让金额算得出来、把 `payroll_policies` 的表名改对、
给税务专员补上 `rnd.view`/`risk.view` 并把 403 渲染成"无权限"而不是"无数据"、
给单人组织一条能走通的申报授权路径。这四件做完，剩下的（优惠税率、附加税、申报期默认值、义务清单统一）
才是能一件件补的功能债。
