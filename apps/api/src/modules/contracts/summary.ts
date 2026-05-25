import type { GeneratedDocument, Task, TaxItem, Voucher } from "@finance-taxation/domain-model";

function sortByCreatedAtDesc<T extends { createdAt?: string }>(rows: T[]) {
  return [...rows].sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}

export function buildContractWorkspaceSummary({
  relatedEventIds,
  documents,
  taxItems,
  vouchers,
  tasks
}: {
  relatedEventIds: string[];
  documents: GeneratedDocument[];
  taxItems: TaxItem[];
  vouchers: Voucher[];
  tasks: Task[];
}) {
  const eventIdSet = new Set(relatedEventIds);

  return {
    documents: sortByCreatedAtDesc(documents.filter((item) => eventIdSet.has(item.businessEventId))),
    taxItems: sortByCreatedAtDesc(taxItems.filter((item) => eventIdSet.has(item.businessEventId))),
    vouchers: sortByCreatedAtDesc(vouchers.filter((item) => eventIdSet.has(item.businessEventId))),
    tasks: sortByCreatedAtDesc(tasks.filter((item) => item.businessEventId && eventIdSet.has(item.businessEventId)))
  };
}
