import type { Contract } from "@finance-taxation/domain-model";
import { resolveContractProgressState, type ContractProgressState } from "./contract-automation";
import { buildContractWorkflow } from "./contract-workflow";

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
  status: ContractProgressState;
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
  const workflow = buildContractWorkflow({ contract, relatedEvents });
  const eventMap = new Map(relatedEvents.map((event) => [event.id, event]));

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

  for (const step of workflow.steps) {
    const event = step.relatedEventId ? eventMap.get(step.relatedEventId) ?? null : null;
    items.push({
      id: event?.id ?? `${contract.id}-${step.action}`,
      date: (event?.createdAt ?? contract.startDate ?? contract.signedDate ?? contract.endDate ?? contract.updatedAt).slice(0, 10),
      title: normalizeEventTitle(event?.title ?? `${contract.title} ${step.title}`),
      kind: "event",
      status: event ? resolveContractProgressState(event.status) : step.state,
      relatedEventId: event?.id
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
    if (a.date === b.date) {
      if (a.kind !== b.kind) {
        return a.kind === "contract" ? -1 : 1;
      }
      return a.id.localeCompare(b.id);
    }
    return a.date.localeCompare(b.date);
  });
}
