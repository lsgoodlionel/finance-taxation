/**
 * 路由表分组：总账 / 科目 / 成本中心。
 *
 * 自 `routes/registry.ts` 拆出（V15/P2）。原文件 1787 行里有 1300 行是
 * **一个数组字面量**，任何两个人同时加接口都在同一处冲突。
 */
import type { RouteDef } from "../../router/router.js";
import { createAccount, getAccountByCode, listAccounts, updateAccount } from "../../modules/accounts/routes.js";
import { createCostCenterRoute, listCostCentersRoute, updateCostCenterRoute } from "../../modules/cost-center/routes.js";
import { balanceCheckRoute, closeFiscalYearRoute, listFiscalYearsRoute } from "../../modules/ledger/fiscal-year.routes.js";
import { createOpeningBalancesRoute, deleteOpeningBalancesRoute, getOpeningBalancesRoute } from "../../modules/ledger/opening-balance.routes.js";
import { closeIncomeRoute, getCashJournal, getLedgerBalances, getLedgerSummary, listAccountingPeriods, listLedgerEntries, listLedgerPostingBatches, lockAccountingPeriod, unlockAccountingPeriod } from "../../modules/ledger/routes.js";

export const ledgerRoutes: RouteDef[] = [
  // ledger
  { method: "GET", path: "/api/ledger/entries", auth: true, permission: "ledger.view", handler: listLedgerEntries },
  { method: "GET", path: "/api/ledger/posting-batches", auth: true, permission: "ledger.view", handler: listLedgerPostingBatches },
  { method: "GET", path: "/api/ledger/summary", auth: true, permission: "ledger.view", handler: getLedgerSummary },
  { method: "GET", path: "/api/ledger/balances", auth: true, permission: "ledger.view", handler: getLedgerBalances },
  { method: "GET", path: "/api/ledger/cash-journal", auth: true, permission: "ledger.view", handler: getCashJournal },
  { method: "GET", path: "/api/ledger/periods", auth: true, permission: "ledger.view", handler: listAccountingPeriods },
  {
    method: "POST",
    path: "/api/ledger/periods/:id/lock",
    auth: true,
    permission: "ledger.post",
    handler: (req, res, p) => lockAccountingPeriod(req, res, p.id!)
  },
  {
    method: "POST",
    path: "/api/ledger/periods/:id/close-income",
    auth: true,
    permission: "ledger.post",
    handler: (req, res, p) => closeIncomeRoute(req, res, p.id!)
  },
  {
    method: "POST",
    path: "/api/ledger/periods/:id/unlock",
    auth: true,
    permission: "ledger.post",
    handler: (req, res, p) => unlockAccountingPeriod(req, res, p.id!)
  },

  // 期初建账（V12-B4）。录入与撤销都是记账动作 —— 期初余额直接决定所有后续报表的
  // 起点，比新建一张凭证重得多，故挂 ledger.post 而不是 ledger.view。
  { method: "GET", path: "/api/ledger/opening-balances", auth: true, permission: "ledger.view", handler: getOpeningBalancesRoute },
  { method: "POST", path: "/api/ledger/opening-balances", auth: true, permission: "ledger.post", handler: createOpeningBalancesRoute },
  { method: "DELETE", path: "/api/ledger/opening-balances", auth: true, permission: "ledger.post", handler: deleteOpeningBalancesRoute },

  // 会计年度与年末结转（V12-B5）
  { method: "GET", path: "/api/ledger/fiscal-years", auth: true, permission: "ledger.view", handler: listFiscalYearsRoute },
  {
    method: "POST",
    path: "/api/ledger/fiscal-years/:id/close",
    auth: true,
    permission: "ledger.post",
    handler: (req, res, p) => closeFiscalYearRoute(req, res, p.id!)
  },
  // 资产负债表恒等式自检：把「上年未结账」变成报表上看得见的一行，而不是静默错数。
  { method: "GET", path: "/api/ledger/balance-check", auth: true, permission: "ledger.view", handler: balanceCheckRoute },

  // accounts
  { method: "GET", path: "/api/accounts", auth: true, permission: "ledger.view", handler: listAccounts },
  // 科目维护归记账权：建科目会影响所有后续分录的归类，比查看账簿重得多。
  // 不提供 DELETE —— 科目被分录引用过就不能删，只能停用（见 account-store.ts）。
  { method: "POST", path: "/api/accounts", auth: true, permission: "ledger.post", handler: createAccount },
  {
    method: "PATCH",
    path: "/api/accounts/:code",
    auth: true,
    permission: "ledger.post",
    handler: (req, res, p) => updateAccount(req, res, p.code!)
  },
  {
    method: "GET",
    path: "/api/accounts/:code",
    auth: true,
    permission: "ledger.view",
    handler: (req, res, p) => getAccountByCode(req, res, p.code!)
  },

  // 成本中心（V12-D1）
  //
  // 建成本中心归 ledger.post（它决定费用往哪个部门归集，是记账口径的一部分）；
  // 查报表归 ledger.view——部门负责人要能看自己的费用，不该为此拿到记账权限。
  { method: "GET", path: "/api/cost-centers", auth: true, permission: "ledger.view", handler: listCostCentersRoute },
  { method: "POST", path: "/api/cost-centers", auth: true, permission: "ledger.post", handler: createCostCenterRoute },
  {
    method: "PATCH",
    path: "/api/cost-centers/:id",
    auth: true,
    permission: "ledger.post",
    handler: (req, res, p) => updateCostCenterRoute(req, res, p.id!)
  },
];
