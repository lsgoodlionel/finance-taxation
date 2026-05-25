import type { Contract } from "@finance-taxation/domain-model";

interface RelatedContractEvent {
  id: string;
  title: string;
  status: string;
  createdAt: string;
}

export interface ContractTimelineItem {
  id: string;
  date: string;
  title: string;
  kind: "contract" | "event";
  status: string;
  relatedEventId?: string;
}

function normalizeEventTitle(title: string) {
  return title
    .replace(/^[\s\S]*?\s/, "")
    .replace(/^合同执行事项$/, "合同执行事项");
}

export function buildContractTimeline({
  contract,
  relatedEvents
}: {
  contract: Contract;
  relatedEvents: RelatedContractEvent[];
}): ContractTimelineItem[] {
  const items: ContractTimelineItem[] = [];

  if (contract.signedDate) {
    items.push({
      id: `${contract.id}-signed`,
      date: contract.signedDate,
      title: "合同签订",
      kind: "contract",
      status: "done"
    });
  }

  if (contract.startDate) {
    items.push({
      id: `${contract.id}-start`,
      date: contract.startDate,
      title: "合同生效",
      kind: "contract",
      status: contract.status === "draft" ? "pending" : "done"
    });
  }

  for (const event of relatedEvents) {
    items.push({
      id: event.id,
      date: event.createdAt.slice(0, 10),
      title: normalizeEventTitle(event.title),
      kind: "event",
      status: event.status,
      relatedEventId: event.id
    });
  }

  if (contract.status === "fulfilled") {
    items.push({
      id: `${contract.id}-fulfilled`,
      date: contract.updatedAt.slice(0, 10),
      title: "合同已履行",
      kind: "contract",
      status: "done"
    });
  } else if (contract.status === "terminated") {
    items.push({
      id: `${contract.id}-terminated`,
      date: contract.updatedAt.slice(0, 10),
      title: "合同已终止",
      kind: "contract",
      status: "done"
    });
  } else if (contract.status === "expired" && contract.endDate) {
    items.push({
      id: `${contract.id}-expired`,
      date: contract.endDate,
      title: "合同已到期",
      kind: "contract",
      status: "done"
    });
  } else if (contract.endDate) {
    items.push({
      id: `${contract.id}-end`,
      date: contract.endDate,
      title: "合同到期",
      kind: "contract",
      status: "pending"
    });
  }

  return items.sort((a, b) => {
    if (a.date === b.date) return a.id.localeCompare(b.id);
    return a.date.localeCompare(b.date);
  });
}
