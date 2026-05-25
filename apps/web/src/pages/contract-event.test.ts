import {
  buildContractEventInput,
  buildContractFollowupEventInput,
  buildContractTerminalEventInput,
  getContractFollowupActions
} from "./contract-event";

function expectEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function expectMatch(value: string, pattern: RegExp, message: string) {
  if (!pattern.test(value)) {
    throw new Error(`${message}: received ${value}`);
  }
}

const salesInput = buildContractEventInput({
  id: "contract-1",
  companyId: "company-1",
  contractNo: "CNT-001",
  contractType: "sales",
  title: "企业软件订阅合同",
  counterpartyName: "甲公司",
  counterpartyType: "external",
  amount: 100000,
  currency: "CNY",
  signedDate: "2026-05-01",
  startDate: null,
  endDate: null,
  status: "active",
  notes: "按季度回款",
  createdByUserId: "u1",
  createdByName: "admin",
  createdAt: "2026-05-01T00:00:00.000Z",
  updatedAt: "2026-05-01T00:00:00.000Z"
});

expectEqual(salesInput.type, "sales", "sales contract should map to sales event");
expectEqual(salesInput.department, "销售部", "sales contract should map to sales department");
expectEqual(salesInput.contractId, "contract-1", "contract id should be preserved");
expectEqual(salesInput.amount, "100000.00", "amount should be normalized");
expectMatch(salesInput.description, /合同编号：CNT-001/, "description should include contract number");

const leaseInput = buildContractEventInput({
  id: "contract-2",
  companyId: "company-1",
  contractNo: "CNT-002",
  contractType: "lease",
  title: "办公室租赁合同",
  counterpartyName: "乙公司",
  counterpartyType: "external",
  amount: 0,
  currency: "CNY",
  signedDate: null,
  startDate: "2026-06-01",
  endDate: null,
  status: "active",
  notes: "",
  createdByUserId: "u1",
  createdByName: "admin",
  createdAt: "2026-06-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z"
});

expectEqual(leaseInput.type, "expense", "lease contract should map to expense event");
expectEqual(leaseInput.department, "行政部", "lease contract should map to admin department");
expectEqual(leaseInput.occurredOn, "2026-06-01", "lease contract should pick start date");
expectEqual(leaseInput.amount, null, "zero amount should not be forced into event amount");

console.log("contract-event-ok");

const procurementContract = {
  id: "contract-3",
  companyId: "company-1",
  contractNo: "CNT-003",
  contractType: "procurement" as const,
  title: "服务器采购合同",
  counterpartyName: "供应商A",
  counterpartyType: "external",
  amount: 300000,
  currency: "CNY",
  signedDate: "2026-05-10",
  startDate: null,
  endDate: null,
  status: "active" as const,
  notes: "",
  createdByUserId: "u1",
  createdByName: "admin",
  createdAt: "2026-05-10T00:00:00.000Z",
  updatedAt: "2026-05-10T00:00:00.000Z"
};

const procurementActions = getContractFollowupActions(procurementContract);
expectEqual(procurementActions.join(","), "procurement_execution,payment_arrangement,acceptance", "procurement should expose execution chain");

const paymentInput = buildContractFollowupEventInput(procurementContract, "payment_arrangement");
expectEqual(paymentInput.type, "procurement", "payment arrangement should remain procurement type");
expectEqual(paymentInput.department, "财务部", "payment arrangement should route to finance");
expectMatch(paymentInput.description, /安排付款、发票和资金计划/, "payment arrangement description should mention payment flow");

const fulfilledInput = buildContractTerminalEventInput(procurementContract, "fulfilled", "2026-05-30");
expectEqual(fulfilledInput.title, "服务器采购合同 合同已履行事项", "fulfilled contract should create terminal event title");
expectEqual(fulfilledInput.department, "采购部", "fulfilled procurement contract should stay with procurement department");
expectMatch(fulfilledInput.description, /合同已标记为已履行/, "fulfilled terminal event should explain final status");
