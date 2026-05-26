import type { Contract } from "@finance-taxation/domain-model";
import { buildContractTimeline } from "./contract-timeline";

function expectEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function expectTrue(value: boolean, message: string) {
  if (!value) {
    throw new Error(message);
  }
}

const contract: Contract = {
  id: "contract-1",
  companyId: "cmp-1",
  contractNo: "CNT-001",
  contractType: "sales",
  title: "企业软件订阅合同",
  counterpartyName: "甲公司",
  counterpartyType: "external",
  amount: 100000,
  currency: "CNY",
  signedDate: "2026-05-01",
  startDate: "2026-05-10",
  endDate: "2027-05-09",
  status: "active",
  notes: "按季度回款",
  createdByUserId: "u1",
  createdByName: "admin",
  createdAt: "2026-05-01T00:00:00.000Z",
  updatedAt: "2026-05-01T00:00:00.000Z"
};

const timeline = buildContractTimeline({
  contract,
  relatedEvents: [
    {
      id: "evt-1",
      title: "企业软件订阅合同 开票申请事项",
      status: "analyzed",
      createdAt: "2026-05-12T00:00:00.000Z"
    },
    {
      id: "evt-2",
      title: "企业软件订阅合同 收入确认事项",
      status: "draft",
      createdAt: "2026-05-20T00:00:00.000Z"
    }
  ]
});

expectEqual(timeline[0]?.title, "合同签订", "timeline should start with contract signing");
expectEqual(timeline[1]?.title, "合同生效", "timeline should include contract start");
expectTrue(timeline.some((item) => item.title === "开票申请事项"), "timeline should include invoice event");
expectTrue(timeline.some((item) => item.title === "收入确认事项"), "timeline should include revenue event");
expectTrue(timeline.some((item) => item.title === "回款跟踪事项"), "timeline should include pending collection milestone even before event exists");
expectEqual(
  timeline.find((item) => item.title === "回款跟踪事项")?.status,
  "pending",
  "missing collection milestone should show pending status"
);

const fulfilledTimeline = buildContractTimeline({
  contract: {
    ...contract,
    status: "fulfilled",
    updatedAt: "2027-05-10T00:00:00.000Z"
  },
  relatedEvents: []
});

expectEqual(fulfilledTimeline.at(-1)?.title, "合同已履行", "fulfilled contract should end with terminal milestone");

console.log("contract-timeline-ok");
