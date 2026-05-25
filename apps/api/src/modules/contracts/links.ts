import type {
  ContractObjectLink,
  GeneratedDocument,
  Task,
  TaxItem,
  Voucher
} from "@finance-taxation/domain-model";

function makeLinkId(contractId: string, objectType: ContractObjectLink["objectType"], objectId: string) {
  return `contract-link-${contractId}-${objectType}-${objectId}`;
}

export function buildContractObjectLinks({
  companyId,
  contractId,
  businessEventId,
  tasks,
  documents,
  taxItems,
  vouchers
}: {
  companyId: string;
  contractId: string;
  businessEventId: string;
  tasks: Task[];
  documents: GeneratedDocument[];
  taxItems: TaxItem[];
  vouchers: Voucher[];
}): ContractObjectLink[] {
  const now = new Date().toISOString();
  return [
    ...tasks.map((item) => ({
      id: makeLinkId(contractId, "task", item.id),
      companyId,
      contractId,
      businessEventId,
      objectType: "task" as const,
      objectId: item.id,
      relationKind: "event-generated",
      createdAt: now,
      updatedAt: now
    })),
    ...documents.map((item) => ({
      id: makeLinkId(contractId, "document", item.id),
      companyId,
      contractId,
      businessEventId,
      objectType: "document" as const,
      objectId: item.id,
      relationKind: "event-generated",
      createdAt: now,
      updatedAt: now
    })),
    ...taxItems.map((item) => ({
      id: makeLinkId(contractId, "tax_item", item.id),
      companyId,
      contractId,
      businessEventId,
      objectType: "tax_item" as const,
      objectId: item.id,
      relationKind: "event-generated",
      createdAt: now,
      updatedAt: now
    })),
    ...vouchers.map((item) => ({
      id: makeLinkId(contractId, "voucher", item.id),
      companyId,
      contractId,
      businessEventId,
      objectType: "voucher" as const,
      objectId: item.id,
      relationKind: "event-generated",
      createdAt: now,
      updatedAt: now
    }))
  ];
}
