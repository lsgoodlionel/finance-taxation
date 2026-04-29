import { readJson } from "../../services/json-store.js";
import { sendJson } from "../../utils/http.js";
import { appConfig } from "../../config/app.js";

const vouchersFile = new URL("vouchers.json", appConfig.dataDir);
const balancesFile = new URL("account-balances.json", appConfig.dataDir);
const bankJournalFile = new URL("bank-journal.json", appConfig.dataDir);
const cashJournalFile = new URL("cash-journal.json", appConfig.dataDir);

const seedVouchers = [
  {
    id: "vch-001",
    voucherNo: "记-202604-001",
    voucherDate: "2026-04-23",
    summary: "采购付款入账",
    status: "posted",
    entries: [
      { account: "库存商品", debit: "16800.00", credit: "0.00" },
      { account: "银行存款", debit: "0.00", credit: "16800.00" }
    ]
  }
];

const seedBalances = [
  {
    id: "bal-001",
    accountCode: "1002",
    accountName: "银行存款",
    period: "2026-04",
    openingDebit: "402300.00",
    periodDebit: "928000.00",
    periodCredit: "801700.00",
    closingDebit: "528600.00"
  },
  {
    id: "bal-002",
    accountCode: "6001",
    accountName: "主营业务收入",
    period: "2026-04",
    openingCredit: "2341000.00",
    periodCredit: "865000.00",
    closingCredit: "3206000.00"
  }
];

const seedBankJournal = [
  {
    id: "bj-001",
    journalDate: "2026-04-23",
    accountName: "招商银行基本户",
    summary: "支付采购款",
    debitAmount: "0.00",
    creditAmount: "16800.00",
    balance: "528600.00"
  }
];

const seedCashJournal = [
  {
    id: "cj-001",
    journalDate: "2026-04-10",
    cashier: "王会计",
    summary: "备用金报销",
    debitAmount: "0.00",
    creditAmount: "500.00",
    balance: "1200.00"
  }
];

export async function getGeneralLedger(req, res) {
  const vouchers = await readJson(vouchersFile, seedVouchers);
  sendJson(res, 200, { items: vouchers, total: vouchers.length });
}

export async function getDetailLedger(req, res) {
  const balances = await readJson(balancesFile, seedBalances);
  sendJson(res, 200, { items: balances, total: balances.length });
}

export async function getAccountBalance(req, res) {
  const balances = await readJson(balancesFile, seedBalances);
  sendJson(res, 200, { items: balances, total: balances.length });
}

export async function getBankJournal(req, res) {
  const rows = await readJson(bankJournalFile, seedBankJournal);
  sendJson(res, 200, { items: rows, total: rows.length });
}

export async function getCashJournal(req, res) {
  const rows = await readJson(cashJournalFile, seedCashJournal);
  sendJson(res, 200, { items: rows, total: rows.length });
}
