# 出纳（v4_cashier）操作实验报告

> 环境：API `http://127.0.0.1:33100`，前端 `http://127.0.0.1:55173`，公司 `cmp-v4-tech`，角色 `role-cashier`
> 实验时间：2026-08-27。造的数据一律带 `[CSH]` 前缀。
> 未做：未 reset/seed 数据库，未锁定/解锁任何会计期间，未做任何结转。

## 我是谁

我是出纳。我管钱不管账。我一天里的动作只有五种：**看今天要付什么、把钱转出去、
确认钱收进来了、把银行流水导进系统、月末出一张余额调节表**。

我最在意两件事，顺序不能颠倒：

1. **不能多付。** 一笔款付两次，追回来要求供应商配合、要走退款流程、要重开发票，
   而且这个月的银行余额和账面就对不上了。所以我对「重复提交会怎样」这件事，
   比对界面好不好看敏感一百倍。
2. **不能以为账做好了其实没做。** 我按下「付款」之后，如果系统只是生成了一张
   凭证草稿而没有明说，我会以为账已经进去了，月末一对账才发现银行少了一大截。

我**没有记账权**（`ledger.post` 不在我手上）。这是对的：管钱和管账必须分开。
所以下面凡是我碰到 403 的地方，我都先问「这本来是不是我的活」，
是别人的活我就写清楚它是对的。

---

## 10 件事的结果

### 1. 看今天/本月有哪些款要付 —— ❌ 做不了

- **怎么做的**：
  - 左侧导航找「付款中心」——**没有这一项**。
    实测（Playwright，`v4_cashier` 登录后）导航只有 17 项：
    `我的一天 / 记一笔 / AI 财税助手 / 经营事项总线 / 董事长驾驶舱 / 工资管理 /
    申请与借款 / 报销中心 / 票据中心 / 凭证中心 / 总账中心 / 资产与往来 / 成本结转 /
    税务中心 / 财务报表 / 导出与归档 / 制度库`
  - 深链 `http://127.0.0.1:55173/payments`：页面打得开，但整页显示「**加载失败 Forbidden 重试**」，
    三个页签（本月应付 / 待付借款 / 付款记录）全空。
  - API 直连：

    ```
    GET /api/payments/due  →  403 {"error":"Forbidden","requiredPermission":"contracts.view"}
    GET /api/payments      →  403 {"error":"Forbidden","requiredPermission":"contracts.view"}
    GET /api/access/menu   →  返回 21 项，其中不含 route "/payments"
    ```

  - 根因：`apps/api/src/middleware/auth.ts:65` 的 `role-cashier` 权限表里**没有 `contracts.view`**；
    而 `apps/api/src/modules/access/routes.ts:70` 把「付款中心」菜单挂在 `contracts.view` 上，
    `apps/api/src/routes/groups/expense-control.ts:267-268` 把应付列表和付款单列表也挂在 `contracts.view` 上。
  - 讽刺的是这段代码的注释写着「**应付列表（C7）。出纳每天要看的第一个东西就是「这个月还有什么要付」**」
    （`apps/api/src/modules/payments/routes.ts:130-134`），而出纳恰恰是唯一看不到它的财务角色
    （`role-accountant` 同样没有 `contracts.view`）。
- **结果**：做不了。
- **便捷性**：点不到。左侧栏没有入口，深链进去是一个红色错误。
- **逻辑正确性**：权限分层的意图是对的（改合同条款 vs 把钱付出去分两个人），
  但落地时把「读应付」也划进了「改合同」那一侧，等于把出纳的第一屏拿走了。
- **业务合理性**：不合理。出纳每天上班第一件事就是看应付清单。看不到就只能问会计要 Excel。
- **完整性**：功能后端完整（`listDuePayments` 有分组、有合计、有逾期判定），只是出纳被挡在门外。

### 2. 付一笔合同款（走付款中心）—— ❌ 做不了

- **怎么做的**：
  - 页面：`/payments` 的「本月应付」页签因上一条 403 永远为空，没有任何一行可以点「付款」。
  - API：`POST /api/payments` 我**有**权限（`banking.manage`），但它必须带 `scheduleId`
    （`createPayment` 强制 `targetCount === 1`）。而 `scheduleId` 只能从
    `GET /api/contracts/:id/schedules` 或 `GET /api/payments/due` 取，两者都是 `contracts.view`：

    ```
    GET /api/contracts → 403 {"requiredPermission":"contracts.view"}
    ```

  - 也就是说：**我有开付款单的权限，但拿不到开付款单必需的那个 id。**
  - 本公司当前 `contract_payment_schedules` 表为 0 行，我也无权建（`contracts.manage`）。
- **结果**：做不了。改用报销单作为付款对象验证付款机制（见第 2b）。
- **便捷性**：零入口。
- **逻辑正确性**：`POST` 有权限、`GET` 没权限，这个组合本身就是设计漏了。
- **业务合理性**：不合理。合同付款是出纳的核心动作。
- **完整性**：断在权限，不断在功能。

### 2b. 付款机制本身（用报销单验证）—— ⚠️ 能付，但**能付两次**

因为拿不到合同期次，我改用自己的报销单验证付款链路。结果是本次实验最严重的发现。

- **怎么做的**（全部 API，逐条贴响应）：

  1. 建一张 1200.00 元的报销单，**状态是 `draft`，从未提交、从未审批**：

     ```
     POST /api/reimbursements → 201
     {"reimbursement":{"reimbursementNo":"RMB-202608-0001","status":"draft","totalCents":120000}}
     ```

  2. 对这张**草稿**报销单开第一张全额付款单：

     ```
     POST /api/payments {"reimbursementId":"rmb-0cde...","amountCents":120000}
     → 201 {"paymentNo":"PAY-202608-0001","amountCents":120000,"status":"draft"}
     ```

  3. **再开一张同样全额的付款单**——系统号称有超付拦截：

     ```
     POST /api/payments {"reimbursementId":"rmb-0cde...","amountCents":120000}
     → 201 {"paymentNo":"PAY-202608-0002","amountCents":120000,"status":"draft"}
     ```

     拦截没有生效。原因在 `apps/api/src/modules/payments/store.ts:145-152`：
     未付余额只减掉 `status = 'paid'` 的付款单，两张草稿互相看不见对方。

  4. 依次确认两张：

     ```
     POST /api/payments/pay-22a9.../confirm → 200 voucherId=vch-pay-24ac1b34...
     POST /api/payments/pay-9c55.../confirm → 200 voucherId=vch-pay-c88d3b35...
     ```

     **一张 1200 元的报销单，付出去 2400 元，两张贷记银行存款的凭证草稿都生成了。**
     `confirmPayment` 全程没有再校验一次未付余额。

- **顺序重试是幂等的**（这一条是对的）：

  ```
  POST /api/payments/pay-22a9.../confirm （第二次）
  → 200 voucherId=vch-pay-24ac1b34-0b5a-4d44-8a5a-17747b0e2960  ← 同一张，没有新建
  ```

- **并发重试不幂等**。同一张付款单并发 6 次 confirm：

  ```
  for i in 1..6; do POST /api/payments/pay-360cfd40.../confirm & done
  → vch-pay-0c479fc9 / vch-pay-c09bb065 / vch-pay-5925d42c
    vch-pay-3d5f4895 / vch-pay-bf068f7b / vch-pay-4d9d9fbd
  ```

  **6 张不同的付款凭证**。一张 800 元的付款单，账上待过账 4800 元。
  代码注释明说「幂等：已有凭证的付款单直接返回那一张。重试不能生成第二张——
  两张一模一样的付款凭证过账后，银行存款会被扣两次」
  （`store.ts:262-265`），但那个 `if (payment.voucherId)` 判断在事务外，
  6 个请求同时读到 `null` 就一起建。
- **便捷性**：无关。
- **逻辑正确性**：**错的**。超付拦截可被「先开两张草稿再逐一确认」绕过；
  幂等只在串行重试下成立，并发（双击、网络重试、负载均衡重发）下失效。
- **业务合理性**：还有一条独立问题——**付款单不校验被付对象的状态**。
  我给一张 `draft`、从未提交、从未审批的报销单付了款，系统一句话没说。
  实务上出纳付款的前提是「单据已审批」，这道门在系统里根本不存在。
- **完整性**：需要三个补丁：(a) 未付余额把 `draft` 付款单也算进去；
  (b) `confirmPayment` 在事务内 `select ... for update` 再校验一次；
  (c) 付款前校验报销单/借款单已到「已批准」态。

### 3. 给一张已批准的借款单打款 —— ⚠️ API 能做，页面上点不到；且并发会打款 6 次

- **怎么做的**：
  - API 全流程通：

    ```
    POST /api/advances            → 201 ADV-202609-0001 status=draft
    POST /api/advances/:id/transition {"action":"submit"}  → 200 status=pending
    POST /api/advances/:id/transition {"action":"approve"} → 200 status=approved
    POST /api/advances/:id/pay    → 200 {"voucherId":"vch-adv-eac84ba3...","status":"draft",
                                          "note":"已生成付款凭证草稿，需会计复核后过账。"}
    重复 pay（串行）              → 200 同一个 voucherId ✅ 幂等
    ```

  - **页面上做不到。** 我又建了一张 `ADV-202608-0002 / 3000.00 / status=approved`，
    API 明确返回它：

    ```
    GET /api/advances?status=approved → {"items":[{"advanceNo":"ADV-202608-0002",
        "amountCents":300000,"status":"approved"}],"total":1}
    ```

    然后打开 `/payments` → 「待付借款」页签，页面显示：**「没有已批准待打款的借款单」**，
    「打款」按钮一个都没有。
    原因在 `apps/web/src/pages/payments/PaymentsPage.tsx:110-116`：三个列表用
    `Promise.all([listDuePayments, listPayments, listAdvances])` 一起加载，
    `listDuePayments` 的 403 让整个 `Promise.all` reject，借款列表也一起变空。
    这页的注释写着「不静默：应付列表加载失败显示成空，出纳会以为这个月没有要付的」——
    结果那个「显示成空」原样搬到了隔壁页签。
- **并发不幂等**（与 2b 同一个 bug）。同一张 1000 元借款单并发 6 次 `pay`：

  ```
  → vch-adv-0824ae97 / vch-adv-09cdae77 / vch-adv-bf468279
    vch-adv-96e743ca / vch-adv-7513f57b / vch-adv-03c85c4f
  DB: select ... where summary like '%ADV-202608-0001%' → 6 rows, 全部 status=draft
  ```

  **一张 1000 元的借款单，账上待过账的 1221 借出 6000 元。**
- **另发现：借款单号取错了月份。** `ADV-202609-0001` 是我在 **2026-08-27** 建的，
  预计还款日填的 2026-09-30。`store.ts:193` 用 `expectedReturnDate` 而不是建单日算年月：

  ```js
  const yearMonth = (input.expectedReturnDate ?? new Date()...).slice(0,7).replace("-","");
  ```

  实务上单据号必须按**业务发生月**连号，否则 8 月的单据编号在账簿上是断的。
- **另发现：借款可以自己批自己。** 上面 submit / approve 两步都是我（借款人本人、出纳）
  用同一个 token 做的，`transitionAdvance` 全程不看操作人是谁，`expense.submit` 权限即可。
  我给自己批了 5000 元备用金然后自己打款——**这是最典型的不相容职务未分离**。
  代码注释说「借款人自己不能给自己付款——这是最基本的不相容职务分离」
  （`expense-control.ts:73`），但拦的是付款权限，没拦审批权限，而出纳两个权限都有。
- **便捷性**：API 4 步能走完；页面 0 步（按钮不存在）。
- **逻辑正确性**：串行幂等 ✅ / 并发幂等 ❌ / 单据号月份 ❌ / 审批人校验 ❌
- **业务合理性**：不合理。自批自付在任何内控制度下都是红线。
- **完整性**：后端能力齐，前台入口被 403 连坐掉了。

### 4. 导出一批银行付款指令 CSV —— ⚠️ API 可以，页面上**永远勾不中任何一行**

- **怎么做的**：

  ```
  POST /api/payments/export {"paymentIds":["pay-22a9...","pay-9c55..."]}
  → 200, Content-Disposition: attachment; filename="EXP-20260827-2.csv", X-Content-Type-Options: nosniff
  ```

  ```csv
  "付款单号","收款人名称","收款账号","收款银行","金额","用途"
  "PAY-202608-0001","员工-V4 出纳","","","1200.00","[CSH]第一次付"
  "PAY-202608-0002","员工-V4 出纳","","","1200.00","[CSH]第二次付-本应被拦"
  ```

  带 UTF-8 BOM，Excel 打开中文不乱码 ✅
- **页面上做不到。** `PaymentsPage.tsx:480`：

  ```js
  getCheckboxProps: (row) => ({ disabled: row.status !== "submitted" })
  ```

  而 `submitted` 这个状态**整个系统里没有任何一条路径能产生**：
  `migrations/088_payments.sql:46` 默认 `draft`，全代码库唯一一处写 `payments.status` 的语句是
  `store.ts:351` 的 `set status = 'paid'`。所以列表里每一行的勾选框都是灰的，
  「导出银行指令」按钮永远 `disabled`（它依赖 `selectedPaymentIds.length > 0`）。
  `api-bank-connect.ts:145-148` 的注释还写着「**没接银行的公司只有这一条路**，
  而后端这个能力做完之后一直没有入口——前台建不出这个文件，等于这条路是断的」——
  入口补上了，但被一个不可达的状态判断挡死了。
- **另发现：导出批次号会重号，重复导出无提示。**
  批次号是 `EXP-{日期}-{本批笔数}`（`routes.ts:280`）：同一天导两批各 3 笔 → 两批都叫
  `EXP-20260827-3`。而且我把 `PAY-202608-0001` 第二次单独导出，接口 200 返回 CSV，
  静默把它的 `export_batch_no` 从 `EXP-20260827-2` 改写成 `EXP-20260827-1`：

  ```
  select payment_no, export_batch_no from payments;
   PAY-202608-0001 | EXP-20260827-1   ← 被第二次导出覆盖
   PAY-202608-0002 | EXP-20260827-2
  ```

  代码注释说这个字段的用途是「对账时要能反查『这笔是哪次导出的』」——重号加覆盖之后反查不成立。
  **对出纳的实际风险**：重复导出没有任何警告，同一笔款很容易被上传网银两次。
- **另发现：收款账号为空照样导出，且不提示有几笔缺账号。**
  上面 CSV 里「收款账号 / 收款银行」两列全空。代码是有意为之（注释：不因一条缺账户就整批导不出来），
  这个取舍我认同，但**响应里应该告诉我「本批 2 笔缺收款账号」**——
  现在我只能自己打开 CSV 数。银行拿到带空账号的文件是整批退回的。
- **便捷性**：API 一次调用；页面永远点不了。
- **逻辑正确性**：CSV 内容对，批次号不对。
- **业务合理性**：CSV 列名（付款单号/收款人名称/收款账号/收款银行/金额/用途）符合网银批量代付的常见格式。
- **完整性**：把 `disabled` 的判断改成 `status === 'draft' || status === 'paid'`，或者补一个
  「提交待发」的动作，这条路就通了。

### 5. 银企直连：配置在哪、能不能测试连接、能不能直接发款 —— ❌ 全线做不了

- **配置在哪**：`/api/bank-connect/configs` 是 `settings.manage`，我 403：

  ```
  GET  /api/bank-connect/configs        → 403 {"requiredPermission":"settings.manage"}
  POST /api/bank-connect/configs/x/test → 403 {"requiredPermission":"settings.manage"}
  ```

  「系统中心」也不在我的菜单里。**这条边界我认为是对的**——配银行证书等于交出付款能力，
  不该每个出纳都能改（`expense-control.ts:200-205` 的注释讲得很清楚）。
- **能不能测试连接**：不能，而且**这是对的**——测试连接会拿证书去连银行，属于配置动作。
- **但发款这条边界划错了**。`GET /api/bank-connect/instructions` 和
  `POST /api/bank-connect/instructions` 是 `banking.manage`，我有权限。可是发指令必须带 `configId`，
  而 `configId` 只能从我 403 的那个列表接口拿。**我有开枪的权限，但拿不到枪。**

  为了证明这一点，我从数据库里读到了本公司确实有一个配置 `bkc-seed-cmp-v4-tech`
  （provider=mock, enabled=true），拿它去试——权限确实是通的：

  ```
  GET /api/bank-connect/configs/bkc-seed-cmp-v4-tech/balance
  → 200 {"availableCents":10000000,"currency":"CNY","asOf":"2026-08-27T09:24:28.137Z"}
  ```

  所以缺的不是能力，是**可发现性**：应该给 `banking.manage` 开一个只返回
  `{id, displayName, payerAccount, enabled}` 的精简列表（不含 `cert_ref`、`cert_password_enc`）。
- **能不能直接发款**：**不能，而且谁都不能。**

  ```
  POST /api/bank-connect/instructions {"paymentId":"pay-22a9...","configId":"bkc-seed-cmp-v4-tech"}
  → 409 {"error":"付款单当前为「paid」，只有已提交的付款单能发往银行",
         "code":"BANK_PAYMENT_NOT_SUBMITTED"}
  ```

  `bank-connect/store.ts:414` 要求 `payment.status === "submitted"`，
  而如第 4 条所述，`submitted` 在这套系统里**不可达**。
  **银企直连付款是一条完全走不通的路，不分角色。**
- **另发现：系统里有两套互不相干的「银企直连」。**
  - 一套是 `bank_connect_configs` 表 + `/api/bank-connect/*`（我公司有一条 mock 配置，enabled=true）
  - 另一套是 `integration_configs` + `loadBankApiConfig`，服务 `/api/banking/sync-statements`
    和 `/api/payroll/transfer/batches/:id/submit-api`

    ```
    POST /api/banking/sync-statements → 400
    {"error":"当前为手工模式，请在「系统设置 → 外部对接」配置银行 API，或继续使用 CSV 导入。",
     "provider":"manual"}
    ```

  第一套配了、第二套没配，界面上都叫「银企直连」。出纳无法判断「我们公司到底接没接」。
- **另发现：假的空状态提示。** `BankInstructionPanel.tsx:212-219`，配置列表拿不到时显示
  「**没有可用的银企账号——需要在「系统设置 → 银企直连」里添加**」。
  对出纳来说这句话是**假的**（账号明明存在，只是他读不到），而且指向一个他进不去的页面。
  应该区分「403 读不到」和「真的没有」，403 时说「请联系管理员」。
- **便捷性 / 完整性**：0 / 0。
- **业务合理性**：配置与发款分权是对的；把发款卡在一个不可达状态上是纯 bug。

### 6. 导入/查看银行流水 —— ✅ 能做，但「导入 N 条」这个数是假的

- **怎么做的**：
  - 页面：`票据中心 → 银行` 页签（`/bills?tab=banking`），有拖拽上传区，
    提示「支持招行/工行/建行/通用格式 · 系统自动识别列头 · 重复流水自动去重」。
  - 我先建了自己的银行账户：

    ```
    POST /api/banking/accounts → 201 {"id":"ba-1787822492592-iauor"}
    「[CSH]招商银行深圳科苑支行 / 755900123456789」
    ```

  - 导入一份 4 行的招行格式 CSV：

    ```
    POST /api/banking/statements/import?account_id=ba-1787822492592-iauor
    → 200 {"detectedFormat":"cmb","totalRows":4,"inserted":4,"skipped":0,"errorRows":0}
    ```

    格式自动识别 ✅
  - 页面上「流水明细 (5)」显示正确，金额带正负号和颜色（收款绿 / 付款红），
    有「对账状态」筛选。这一页是整个实验里体验最好的地方。
- **⚠️ 重复导入的计数是错的。** 把同一份 CSV 再导一次：

  ```
  → 200 {"detectedFormat":"cmb","totalRows":4,"inserted":4,"skipped":0,"errorRows":0}
  ```

  界面告诉我「新导入 4 条」。但数据库里：

  ```
  select transaction_ref, count(*) from bank_statements where company_id='cmp-v4-tech' group by 1;
   CSHREF0001 | 1
   CSHREF0002 | 1
   CSHREF0003 | 1
   CSHREF0004 | 1
  ```

  **实际写入 0 条。** `bank.routes.ts:110` 的 `inserted++` 无条件自增，
  而 SQL 是 `ON CONFLICT (company_id, transaction_ref) DO NOTHING`——冲突时也算「成功导入」。
  隔壁 `bank-api.routes.ts:50` 的同类代码用 `RETURNING id` 判断行数，是对的；两处口径不一致。

  **对出纳的实际后果**：我这个月导了两次流水，系统说「导入 4 条 + 导入 4 条」，
  我会以为有 8 条。去核对笔数时对不上，而真正的问题（去重）其实是正确的。
- **便捷性**：从登录到导完 3 次点击（票据中心 → 银行 → 拖文件）。很顺。
- **逻辑正确性**：去重 ✅ / 格式识别 ✅ / **计数 ❌**
- **业务合理性**：合理。招行/工行/建行 + 通用四种格式覆盖了中小企业的实际情况。
- **完整性**：够用。

### 7. 银行对账（流水与账面匹配）—— ⚠️ 能跑，但自动匹配可能匹配错，而且改不了

- **怎么做的**：

  ```
  POST /api/banking/reconciliation/run {} → 200 {"matched":0,"suggested":0,"unmatched":4}
  GET  /api/banking/reconciliation/rules → {"amountTolerance":0.01,"dateWindowDays":3,
        "autoConfirmThreshold":85,"unmatchedEventDays":5,
        "keywordWeights":{"工资":15,"薪资":15,"代发":15,"货款":10,"回款":10,"付款":10}}
  ```

  页面在 `票据中心 → 银行 → 智能对账`，有「对账规则」表单（金额容差 / 日期窗口 /
  自动确认阈值 / 未匹配转事项天数）+「运行智能对账」按钮 + 候选表。做得很完整。
- **✅ 好的地方：超期未匹配自动转事项。** 5 天以上未匹配的流水自动生成
  「待核查银行流水」经营事项 + 高优先级任务给会计：

  ```
  select id,title,amount,source from business_events where source='bank_unmatched';
   evt-bk-...-3b4n | 待核查银行流水 2026-08-22 |   5000.00 | bank_unmatched
   evt-bk-...-oftn | 待核查银行流水 2026-08-21 |  50000.00 | bank_unmatched
   evt-bk-...-v2hr | 待核查银行流水 2026-08-20 | 120000.00 | bank_unmatched
  ```

  2026-08-25 那笔（2 天）正确地没有转事项。这条设计对出纳很有用：
  **这是我把「钱到账了但账上没有」告诉会计的唯一正规渠道。**
- **⚠️ 自动匹配在多个等分候选下不降级为人工。**
  我导了一笔 `2026-08-27 / -1060.00 / 北京华云网络科技有限公司`。本公司当天有**三张**
  金额同为 1060.00 的已过账凭证（另一位 agent 造的：一张报销付款凭证、一张进项发票凭证、
  一张红冲凭证）。系统直接自动确认到了其中一张：

  ```
  select transaction_ref,match_status,matched_voucher_id from bank_statements ...;
   CSHREF0005 | auto | ivv-1787822864400-8t7o   ← 进项发票凭证，不是付款凭证
  ```

  `reconciliation.ts:220-224` 只取 `score` 最高的一张，**不检查是否存在并列最高分**。
  金额一致 50 分 + 日期一致 30 分 + 关键词/名称加分 ≥ 85，三张都够格，随便挑一张就自动确认。
  对出纳来说这意味着调节表上的对应关系可能是错的，而且——
- **⚠️ 自动匹配的结果在界面上既看不到、也改不掉。**
  流水明细表只有一个「对账状态」标签列（`banking-columns.tsx:71`），
  **没有「匹配到哪张凭证」列，没有「撤销匹配」按钮，没有「人工匹配」入口**。
  后端 `PATCH /api/banking/statements/:id/match` 是有的（`banking.manage`，我有权限），
  实测可用：

  ```
  PATCH /api/banking/statements/bs-.../match {"matchStatus":"unmatched"} → 200 {"ok":true}
  ```

  **但前台完全没有调它的地方。**又一处「后端能做、前台点不到」。
- **⚠️ 人工匹配接口不校验凭证。** 我把一笔流水匹配到一个**根本不存在**的凭证号：

  ```
  PATCH /api/banking/statements/bs-1787822866505-aeewd/match
       {"voucherId":"vch-根本不存在-9999","matchStatus":"manual"} → 200 {"ok":true}

  select match_status,matched_voucher_id from bank_statements where id='bs-...aeewd';
   manual | vch-根本不存在-9999
  ```

  不校验凭证是否存在、是否属于本公司、金额是否相符。这笔流水从此在调节表上算「已达账」，
  余额调节表会少算它。（`matchStatus` 本身有枚举校验，写「随便写的状态」会 400，这部分是对的。）
  我已把这条流水改回 `unmatched`。
- **⚠️ 匹配的日期口径用的是凭证的创建时间，不是会计日期。**
  `reconciliation.ts:150` 取 `voucher.created_at`。一张 8 月的业务在 9 月补录的凭证，
  日期分会是 0，出纳补导上月流水时几乎全部匹配不上。应该用 `accounting_date`。
- **业务合理性**：把对账限定在 `status='posted'` 的凭证上（`reconciliation.ts:209`）是对的——
  没入账的东西不该参与对账。但这也意味着**出纳永远无法对自己刚付的款**：
  我付的每一笔都只生成草稿凭证，要等会计过账。这是职责分离的必然代价，我认可，
  但界面应该说清楚「这笔的凭证还是草稿，会计过账后才会参与对账」。
- **便捷性**：3 次点击到工作台，规则可视化。好。
- **完整性**：缺「看匹配对象 / 撤销匹配 / 人工匹配」三个入口。

### 8. 出银行余额调节表 —— ✅ 做得最好的一件事（一个致命死角除外）

- **怎么做的**：
  - **左侧栏没有入口。** 后端菜单里有（`/api/access/menu` 返回
    `{"key":"bank-reconciliation","label":"银行余额调节表","route":"/banking/reconciliation",
    "permissionKey":"ledger.view"}`），但前端 `nav-filter.ts` 的 `proNavItems` 里没有这一项，
    过滤后自然不出现。设计上说它「由月结向导跳来」——可**月结向导 `/close` 不在出纳的菜单里**，
    所以对出纳来说这一页只能靠背 URL 进。
  - 深链 `http://127.0.0.1:55173/banking/reconciliation` 可以打开，表单三个字段：
    银行账户（下拉，正确列出我的 `[CSH]招商银行深圳科苑支行 755900123456789`）、
    截止日、对账单余额。
  - Playwright 实测填 `2026-08-31` + `922740` → 点「生成调节表」：

    ```
    GET /api/banking/reconciliation/balance?bankAccountId=ba-1787822492592-iauor
        &asOf=2026-08-31&statementBalance=922740 → 200
    ```

    页面渲染：

    | | | | |
    |---|---|---|---|
    | 银行对账单余额 | 922740.00 | 企业账面余额 | 0.00 |
    | 加：企业已收、银行未收 | 0.00 | 加：银行已收、企业未收 | 50000.00 |
    | 减：企业已付、银行未付 | 0.00 | 减：银行已付、企业未付 | 126200.00 |
    | 调节后银行余额 | 922740.00 | 调节后账面余额 | -76200.00 |

    加上 4 行未达账项明细（日期 / 类别 / 摘要 / 金额）。
- **✅ 三处让我这个出纳觉得「作者真懂对账」的设计**：
  1. **不肯替我瞎填对账单余额。** `statementBalance` 缺省时 400：
     「银行对账单余额需从对账单抄入，系统无从推算」。默认成 0 会算出一个看起来精确的假差额。
  2. **不肯自动补平差额。** 提示原文：「调节后仍有 998940.00 的差额（银行侧偏高）。
     系统不会自动补平这个差额 —— 请检查：是否还有未识别的未达账项、是否有收付款漏记或重记、
     银行对账单余额是否抄录正确。」这正是调节表存在的意义。
  3. **两侧加减方向交叉**，且界面把这件事解释出来了（「银行侧调的是企业已记而银行未记的」）。
     国内实务的标准做法，做对了。
- **✅ 封存有确认门槛**：差额不为 0 时直接封存被拒：

  ```
  POST /api/banking/reconciliation/close {...没有 acknowledgeDifference}
  → 409 {"code":"DIFFERENCE_NOT_ACKNOWLEDGED"}
  ```

  勾选确认并写备注后成功，并冻结当时的未达账项快照（界面文案：
  「封存会把当时的未达账项一并冻结——三个月后复查，看到的必须是当时那份表」）。
- **❌ 致命死角：封存无法撤销，但错误提示叫你去撤销。**
  重复封存返回：

  ```
  POST .../close （同账户同日期第二次）
  → 409 {"error":"2026-08-31 的对账已封存。如需重做，请先撤销封存。",
         "code":"RECONCILIATION_CLOSED"}
  ```

  我把全部路由过了一遍，`/api/banking/reconciliation/*` 只有
  `balance`（GET）、`sessions`（GET）、`close`（POST）、`run`、`candidates`、`rules`。
  **没有任何撤销封存的接口，页面上也没有按钮。**
  也就是说：**出纳抄错一位对账单余额并封存，这个账户这个日期的调节表就永久定格在错的数上。**
  我自己就是这么干的——我在账面余额还是 0（会计没过账）的情况下勾了「确认差额」封存了
  `brec-ba-1787822492592-iauor-2026-08-31`，现在改不回来了。
- **便捷性**：找不到入口（要背 URL）；找到之后 4 步出表，很快。
- **逻辑正确性**：算式对，方向对，拒绝自动补平对。
- **业务合理性**：这是整个系统里最像真会计做的东西。
- **完整性**：缺「撤销封存」，且缺侧栏入口。

### 9. 确认一笔客户回款 —— ⚠️ 只能做到「让会计知道」，核销做不了（这一半是对的）

- **怎么做的**：
  - 逐笔核销：`/asset-center → 往来账龄 → 逐笔核销`，按钮在页面上是亮的，但接口：

    ```
    POST /api/settlement/settle → 403 {"requiredPermission":"ledger.post"}
    ```

  - **这个 403 我认为是对的。** `expense-control.ts:401-403` 的注释解释得很清楚：
    核销是「声明这笔收款抵的是那笔欠款」，属于记账动作，归会计。
    出纳管钱不管账，不该决定这 5 万块冲的是哪张发票。
  - **出纳实际能做的是**：把回款流水导进来，让系统识别成未达账项 + 生成待核查事项。
    我那笔 `2026-08-21 / +50,000.00 / 广州某某贸易有限公司 / [CSH]客户回款` 走完了这条路：

    ```
    → 未匹配（账上没有对应的已过账收款凭证）
    → 5 天后自动生成 business_events「待核查银行流水 2026-08-21 / 50000.00」+ 高优先级任务
    → 出现在余额调节表的「加：银行已收、企业未收 50000.00」
    ```

  - 「我的一天」也把它聚合了：`未匹配银行流水 4 / 银行流水待对账 → /banking`。
- **⚠️ 但从「按钮亮着」到「知道该找谁」中间是空的。**
  「逐笔核销」按钮对出纳完全可点，点下去得到的唯一反馈是一个写着 **`Forbidden`** 的 toast。
  英文单词，没有任何说明。一个真出纳看到这个只会以为系统坏了，
  而不会理解「这件事该找会计」。
- **便捷性**：能做的部分 3 步；不能做的部分白点一次。
- **逻辑正确性**：账龄/未达账项的数都对。
- **业务合理性**：**权限边界是对的**，只是没有把「对的边界」讲给人听。
- **完整性**：缺一个「转交会计核销」的动作，和一句人话的权限提示。

### 10. 工资代发：看批次、导出或提交 —— ⚠️ 只能看，四个动作全 403，且按钮全亮着

- **怎么做的**：
  - 入口有：`工资管理 → 发这个月的工资`（`/payroll?task=transfer`）。页面完整。
  - **读**都通：

    ```
    GET /api/payroll/transfer/batches        → 200 {"items":[],"total":0}
    GET /api/payroll/transfer/batches/:id/file → payroll.view，有权限（本公司暂无批次，返回 404）
    GET /api/runtime/payroll-transfer        → 200 {"executionLabel":"等待生成代发批次",...}
    GET /api/payroll?period=2026-08          → 200
    ```

  - **写**全部 403：

    ```
    POST /api/payroll/transfer/batches                 → 403 payroll.manage
    POST /api/payroll/transfer/batches/:id/approve     → 403 payroll.manage
    POST /api/payroll/transfer/batches/:id/disburse    → 403 payroll.manage
    POST /api/payroll/transfer/batches/:id/submit-api  → 403 payroll.manage
    POST /api/payroll/transfer/batches/:id/compensate  → 403 payroll.manage
    ```

  - Playwright 实测点「生成代发批次」：按钮**完全可点、没有禁用、没有任何权限提示**，
    点下去 → `403 POST /api/payroll/transfer/batches` → 页面右下角弹出一个写着
    **`Forbidden`** 的提示。
- **⚠️ 前端的授权文案和后端的权限表自相矛盾。**
  `apps/api/src/modules/runtime/summary.ts:436` 和
  `apps/web/src/features/runtime/workflow-runtime.ts:382` 是同一句：

  ```js
  const canPushTransfer = canFinallyAuthorize(roleIds) || hasAnyRole(roleIds, ["role-cashier"]);
  ```

  批次处于 `exported` 时，这段代码会对出纳显示「**你可推进代发 —— 当前身份可确认银行已执行，
  并回写代发完成结果**」；补偿失败时显示「**你可执行修复**」。
  可是回写用的 `disburse`、修复用的 `compensate` 都是 `payroll.manage`，出纳一个都没有。
  **界面明说「你可以」，点下去 403。**
  *（诚实说明：本公司当前 0 个代发批次，我无权生成，所以这条我**没能在页面上复现出那句文案**。
  上面是代码比对 + 四个写接口 403 实测的结论，文案分支本身未验证。）*
- **实务上这条边界本身也值得商榷。** 国内中小企业的常规分工是：
  会计算工资、财务负责人审批、**出纳去银行代发并回单核对**。
  现在出纳连「银行已执行」这个纯事实回写都做不了，这一步会卡在会计手上，
  而会计并没有去银行操作，他只能听出纳口头说「发了」再点一下。
- **便捷性**：入口好找（工资管理页把 5 件事平铺出来）。但对出纳来说 5 件里 0 件能做。
- **逻辑正确性**：权限判断本身一致（都是 payroll.manage），错的是前端的授权文案。
- **业务合理性**：`disburse`（回写银行已执行）划给 payroll.manage 偏严。
- **完整性**：出纳这条线上「导出代发文件 → 去网银 → 回写已执行」缺最后一环。

---

## 发现的问题（按严重度排序）

| # | 严重度 | 问题 | 证据 | 我建议 |
|---|--------|------|------|--------|
| 1 | **阻断** | **超付拦截可绕过：同一张单据先开两张全额付款单再逐一确认，能付两倍的钱** | 1200 元报销单 `RMB-202608-0001` → `POST /api/payments` 两次各 120000 均 201（`PAY-202608-0001/0002`）→ 两次 confirm 均 200，生成两张贷记银行存款 1200 的凭证。根因 `payments/store.ts:145-152` 未付余额只减 `status='paid'` 的付款单 | 未付余额把 `draft`/`submitted` 的付款单一并计入；`confirmPayment` 在事务内 `select for update` 再校验一次 |
| 2 | **阻断** | **并发重试不幂等：一次付款动作生成 N 张付款凭证** | 同一付款单并发 6 次 `POST /api/payments/:id/confirm` → 6 个不同 voucherId；同一借款单并发 6 次 `POST /api/advances/:id/pay` → 6 个不同 voucherId，DB 实查 6 行 draft 凭证。代码注释自称幂等（`store.ts:262`、`advances/payment.ts:50-53`），但判断在事务外 | 幂等判断挪进事务并对单据行加锁；或给 `vouchers` 加 `(company_id, source_type, source_id)` 唯一约束 |
| 3 | **阻断** | **付款不校验被付单据是否已审批**：可以给一张 `draft`、从未提交的报销单付全款 | `RMB-202608-0001` 建单后 `status=draft`，直接 `POST /api/payments` 成功付款 | `createPayment` 校验报销单 ∈ {approved, paying}、合同期次未作废 |
| 4 | **阻断** | **出纳看不到任何应付信息**：左侧栏无「付款中心」，深链整页 403 | `GET /api/payments/due` / `/api/payments` / `/api/contracts` 全部 403 `contracts.view`；`/api/access/menu` 21 项不含 `/payments`；Playwright 实测导航 17 项无付款中心 | 给 `role-cashier` 加 `contracts.view`（只读），或把 `/api/payments/due`、`/api/payments`、菜单项改挂 `banking.manage` |
| 5 | **阻断** | **银企直连发款不可达**：只接受 `payments.status='submitted'`，而该状态无任何路径能产生 | `POST /api/bank-connect/instructions` → 409 `BANK_PAYMENT_NOT_SUBMITTED`；`migrations/088:46` 默认 draft，全库唯一写状态处是 `store.ts:351` 写 `paid` | 补一个「提交待发」动作把 draft→submitted，或把直连的门槛改成 `draft` |
| 6 | **阻断** | **导出银行 CSV 在页面上永远勾不中任何一行**（同上一条同源） | `PaymentsPage.tsx:480` `disabled: row.status !== "submitted"`；「导出银行指令」按钮依赖选中数，恒为 disabled | 改成 `disabled: row.status === "cancelled"` |
| 7 | **高** | **借款可以自己批自己再自己打款**，出纳同时持有 `expense.submit` 和 `banking.manage` | 同一 token 完成 create→submit→approve→pay：`ADV-202609-0001` 5000 元备用金全流程自批自付；`advances/store.ts:239` 的 `transitionAdvance` 不看操作人 | `approve` 校验 `operatorUserId !== borrowerUserId`，并要求审批权限而非 `expense.submit` |
| 8 | **高** | **余额调节表封存后无法撤销，但错误提示叫你去撤销** | `POST .../close` 重复 → 409「如需重做，请先撤销封存」；全代码库无任何 unclose/reopen 路由，页面无按钮。实验中已产生一条不可撤销的错误封存 `brec-ba-1787822492592-iauor-2026-08-31` | 加 `DELETE /api/banking/reconciliation/sessions/:id`（`banking.manage` + 审计留痕），或把提示改成「已封存不可修改，请联系管理员」 |
| 9 | **高** | **借款单打款在页面上完全点不到**：一个 403 让 `Promise.all` 连坐掉借款列表 | API `GET /api/advances?status=approved` 返回 `ADV-202608-0002`，但 `/payments`「待付借款」页签显示「没有已批准待打款的借款单」。`PaymentsPage.tsx:110-116` | 三个列表 `Promise.allSettled` 分别降级；每个页签单独显示自己的错误 |
| 10 | **高** | **自动对账在多个等分候选下直接挑一张自动确认，且界面看不到匹配对象、不能撤销** | 一笔 -1060.00 流水在三张同额同日已过账凭证中被自动确认到进项发票凭证 `ivv-1787822864400-8t7o`；`reconciliation.ts:220` 只取最高分不查并列；`banking-columns.tsx:71` 只有状态标签列 | 并列最高分时降级为 `pending` 候选；流水表加「匹配凭证」列 + 「撤销匹配」按钮（后端 `PATCH .../match` 已就绪） |
| 11 | **高** | **人工匹配不校验凭证**：可以把流水匹配到一个不存在的凭证号 | `PATCH /api/banking/statements/:id/match {"voucherId":"vch-根本不存在-9999","matchStatus":"manual"}` → 200，DB 实写入 | 校验凭证存在、同公司、已过账、金额在容差内 |
| 12 | **高** | **重复导入银行流水的计数是假的**：实际去重 0 条，接口报「导入 4 条」 | 同一 CSV 导两次均返回 `inserted:4, skipped:0`，DB 实查每个 `transaction_ref` 各 1 行。`bank.routes.ts:110` 无条件 `inserted++` | 照抄 `bank-api.routes.ts:50` 的写法，用 `RETURNING id` 判断 |
| 13 | **中** | **导出批次号会重号且重复导出静默覆盖**：批次号是「日期+本批笔数」 | `EXP-20260827-2` 的 `PAY-202608-0001` 被第二次单独导出后改写成 `EXP-20260827-1`；`payments/routes.ts:280` | 批次号用当日递增序号；已导出的付款单再次导出时返回警告或要求 `force` |
| 14 | **中** | **前端授权文案与后端权限表矛盾**：runtime 对出纳显示「你可推进代发 / 你可执行修复」，但 disburse / compensate 都要 `payroll.manage` | `runtime/summary.ts:436` 与 `workflow-runtime.ts:382` 的 `canPushTransfer` 含 `role-cashier`；四个写接口实测 403。**文案分支本身未验证**（本公司无 exported 批次，且我无权生成） | 要么给出纳 `payroll.transfer.execute` 一类的细粒度权限，要么把 `canPushTransfer` 里的 `role-cashier` 去掉 |
| 15 | **中** | **无权限的按钮全部亮着，点下去只弹一个英文 `Forbidden`** | `/payroll` 的「生成代发批次」实测可点 → 403 → toast 显示 `Forbidden`；`/asset-center` 的「逐笔核销」同样；`/payments` 整页显示「加载失败 Forbidden」 | 按 `/api/access/me` 的权限集禁用按钮并加 tooltip「需要 payroll.manage，请联系会计」；403 统一转成中文文案 |
| 16 | **中** | **银企直连的配置 id 出纳拿不到**：有权发指令，无权读列表 | `GET /api/bank-connect/configs` → 403 `settings.manage`；但 `GET .../configs/bkc-seed-cmp-v4-tech/balance` → 200（我从 DB 读到 id 才试出来） | 给 `banking.manage` 开一个精简列表接口，只返回 `{id, displayName, payerAccount, enabled}`，不含证书字段 |
| 17 | **中** | **假的空状态提示**：403 读不到配置时显示「没有可用的银企账号，需要在系统设置里添加」 | `BankInstructionPanel.tsx:212-219`；实际 `bank_connect_configs` 里本公司有一条 `enabled=true` 的配置 | 区分 403 与真空，403 时提示「无权查看，请联系管理员」 |
| 18 | **中** | **借款单号取的是预计还款日的月份，不是建单日** | 2026-08-27 建的单，还款日填 2026-09-30 → 单号 `ADV-202609-0001`；`advances/store.ts:193` | 用 `createdAt` 或显式的 `borrowedOn` 算年月 |
| 19 | **中** | **对账匹配的日期口径用凭证 `created_at` 而非 `accounting_date`** | `reconciliation.ts:150` `toDateOnly(voucher.created_at)`；补录上月凭证时日期分恒为 0 | 改用 `accounting_date` |
| 20 | **中** | **「银行余额调节表」有后端菜单项但不在前端侧栏清单里**，且它依赖的月结向导 `/close` 出纳也没有 | `/api/access/menu` 含 `bank-reconciliation`，`nav-filter.ts` 的 `proNavItems` 不含它 | 把它加进 `g-finance` 组（与 V15 补「成本结转」同一处理） |
| 21 | **中** | **系统里有两套互不相干的「银企直连」**，出纳无法判断公司到底接没接 | `bank_connect_configs`（本公司有 mock 配置，enabled=true）vs `integration_configs`（`sync-statements` 返回 `provider:"manual"`「当前为手工模式」） | 合并为一处配置，或在界面上明确区分「付款直连」与「流水直连」 |
| 22 | **低** | **导出 CSV 缺收款账号不提示笔数** | 导出的两笔「收款账号/收款银行」两列全空，响应里没有任何计数 | 响应头或旁边加一句「本批 N 笔缺收款账号，银行会退回」 |
| 23 | **低** | **建银行账户不校验账号格式、不查重** | `POST /api/banking/accounts` 任意字符串即可，同账号可重复建 | 加长度/数字校验 + `(company_id, account_no)` 唯一 |

### 我在这个库里留下的东西

带 `[CSH]` 前缀，供后续清理：

- 银行账户 `ba-1787822492592-iauor`（[CSH]招商银行深圳科苑支行）
- 银行流水 5 条（`CSHREF0001`~`CSHREF0005`）
- 借款单 `ADV-202609-0001`（已付）、`ADV-202608-0001`（已付）、`ADV-202608-0002`（已批准待付）
- 报销单 `RMB-202608-0001`、`RMB-202608-0005`
- 付款单 `PAY-202608-0001/0002/0003`
- 对账封存 `brec-ba-1787822492592-iauor-2026-08-31`（**无法撤销**，见问题 8）
- 未匹配流水自动生成的 3 条 `business_events` + 3 条 `tasks`（source=`bank_unmatched`）

**并发实验产生的 11 张重复付款凭证草稿我已经删掉了**（10 张孤儿 + 1 张重复付款的），
以免其他 agent 的会计把它们过账成 12200 元的幻影付款。
`PAY-202608-0002` 的付款记录保留着（`voucher_id` 已置空、note 标注「已由CSH撤回重复凭证」），
作为问题 1 的现场。

---

## 一句话总结

**站在出纳的岗位上，这套系统现在不能用。**

不是因为功能没做——功能做得相当细：余额调节表拒绝替我瞎填对账单余额、拒绝自动补平差额，
封存时冻结未达账项快照，超期未匹配流水自动转成给会计的任务，银行流水四种格式自动识别加去重。
这些都是真懂业务的人写的。

不能用是因为两件事：

**第一，出纳被挡在自己的工作台外面。** 「付款中心」不在我的菜单里，深链进去整页 403，
连带把借款打款的按钮也一起弄没了。我这个岗位一天里最核心的三个动作——
看应付、付合同款、给借款打款——在界面上**一个都做不了**。
根因只是 `role-cashier` 的权限表里少了一个 `contracts.view`。

**第二，最要命的是钱能付两次。** 一张 1200 元的报销单，我用两次正常的接口调用付出去 2400 元，
系统一句提醒都没有；一次付款动作并发重试，能生成 6 张一模一样的付款凭证。
代码注释里明明白白写着「两张一模一样的付款凭证过账后，银行存款会被扣两次」——
作者知道这个风险，但那道锁没上紧。**对出纳来说，这一条比前面所有问题加起来都重要。**

值得单独说一句好话：**「付款后凭证是不是草稿」这件事，系统交代得是清楚的。**
API 每次都返回「已生成付款凭证草稿，需会计复核后过账」，
付款记录表里有一个常驻的「草稿待过账」标签列（不是一闪而过的 toast）。
这正是我最怕误会的地方，而它没有让我误会——**只可惜我看不到那张表。**

**要让我明天能用，最少要补三件事**：
给出纳 `contracts.view`（问题 4）；把幂等锁挪进事务、把 draft 付款单算进未付余额（问题 1、2）；
付款前校验单据已审批（问题 3）。这三件补完，剩下的都是可以边用边改的。
