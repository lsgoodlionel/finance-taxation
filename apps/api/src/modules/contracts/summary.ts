import type { GeneratedDocument, Task, TaxItem, Voucher } from "@finance-taxation/domain-model";

function sortByCreatedAtDesc<T extends { createdAt?: string }>(rows: T[]) {
  return [...rows].sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}

export function buildContractWorkspaceSummary({
  relatedEventIds,
  linkedObjectIds,
  documents,
  taxItems,
  vouchers,
  tasks
}: {
  relatedEventIds: string[];
  linkedObjectIds?: {
    documentIds?: string[];
    taxItemIds?: string[];
    voucherIds?: string[];
    taskIds?: string[];
  };
  documents: GeneratedDocument[];
  taxItems: TaxItem[];
  vouchers: Voucher[];
  tasks: Task[];
}) {
  const eventIdSet = new Set(relatedEventIds);
  const documentIdSet = new Set(linkedObjectIds?.documentIds ?? []);
  const taxItemIdSet = new Set(linkedObjectIds?.taxItemIds ?? []);
  const voucherIdSet = new Set(linkedObjectIds?.voucherIds ?? []);
  const taskIdSet = new Set(linkedObjectIds?.taskIds ?? []);

  function includeByEventOrId<T extends { id: string; businessEventId?: string | null }>(
    rows: T[],
    idSet: Set<string>
  ) {
    const picked = rows.filter((item) => eventIdSet.has(item.businessEventId ?? "") || idSet.has(item.id));
    return Array.from(new Map(picked.map((item) => [item.id, item])).values());
  }

  return {
    documents: sortByCreatedAtDesc(includeByEventOrId(documents, documentIdSet)),
    taxItems: sortByCreatedAtDesc(includeByEventOrId(taxItems, taxItemIdSet)),
    vouchers: sortByCreatedAtDesc(includeByEventOrId(vouchers, voucherIdSet)),
    tasks: sortByCreatedAtDesc(includeByEventOrId(tasks, taskIdSet))
  };
}
