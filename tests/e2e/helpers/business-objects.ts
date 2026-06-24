import assert from "node:assert/strict";
import { expect, type TestInfo } from "@playwright/test";
import type { TestApiClient } from "./api-client";
import { attachBusinessObject } from "../fixtures/evidence";

type EventListPayload = {
  items: Array<{
    id: string;
    title: string;
    type: string;
    status: string;
  }>;
  total: number;
};

export type EventDetailPayload = {
  id: string;
  title: string;
  type: string;
  status: string;
  amount: string | null;
  generatedDocuments: Array<{ id: string; documentType: string; title: string }>;
  vouchers: Array<{ id: string; voucherType: string; summary: string }>;
  voucherDrafts: Array<{ id: string; voucherType: string; summary: string }>;
  taxItems: Array<{ id: string; taxType: string; status: string }>;
  tasks: Array<{ id: string; title: string; status: string }>;
};

type TaskPayload = {
  items: Array<{
    id: string;
    title: string;
    status: string;
    businessEventId: string;
  }>;
  total: number;
};

type DocumentPayload = {
  items: Array<{
    id: string;
    title: string;
    documentType: string;
    businessEventId: string;
    status: string;
  }>;
  total: number;
};

type VoucherPayload = {
  items: Array<{
    id: string;
    summary: string;
    status: string;
    businessEventId: string;
    voucherType: string;
  }>;
  total: number;
};

type TaxItemPayload = {
  items: Array<{
    id: string;
    taxType: string;
    status: string;
    businessEventId: string;
  }>;
  total: number;
};

type ContractListPayload = {
  items: Array<{
    id: string;
    title: string;
    contractNo: string;
    status: string;
  }>;
  total: number;
};

type ContractDetailPayload = {
  contract: {
    id: string;
    title: string;
    contractNo: string;
    status: string;
  };
  relatedEvents: Array<{
    id: string;
    title: string;
    status: string;
  }>;
  relatedTasks: Array<{
    id: string;
    title: string;
    status: string;
  }>;
  relatedDocuments: Array<{
    id: string;
    title: string;
    documentType: string;
    status: string;
  }>;
  relatedTaxItems: Array<{
    id: string;
    taxType: string;
    status: string;
  }>;
  relatedVouchers: Array<{
    id: string;
    summary: string;
    status: string;
    voucherType: string;
  }>;
};

export interface ExpectedBusinessChain {
  eventTitle: string;
  taskTitles?: string[];
  documentTypes: string[];
  voucherRequired: boolean;
  taxTypes: string[];
  contractTitle?: string;
  contractNo?: string;
}

export interface ResolvedBusinessChain {
  event: EventListPayload["items"][number];
  tasks: TaskPayload["items"];
  documents: DocumentPayload["items"];
  vouchers: VoucherPayload["items"];
  taxItems: TaxItemPayload["items"];
  contract: ContractDetailPayload["contract"] | null;
  contractRelations: Omit<ContractDetailPayload, "contract"> | null;
}

async function findEventByTitle(
  apiClient: TestApiClient,
  token: string,
  eventTitle: string
): Promise<EventListPayload["items"][number]> {
  const payload = await apiClient.get<EventListPayload>("/api/events", token);
  const event = payload.items.find((item) => item.title === eventTitle);
  assert(event, `Expected business event "${eventTitle}" to exist`);
  return event;
}

export async function getEventDetailByTitle(
  apiClient: TestApiClient,
  token: string,
  eventTitle: string
): Promise<EventDetailPayload> {
  const event = await findEventByTitle(apiClient, token, eventTitle);
  return apiClient.get<EventDetailPayload>(`/api/events/${event.id}`, token);
}

export async function ensureEventAnalyzed(
  apiClient: TestApiClient,
  token: string,
  eventTitle: string
): Promise<EventDetailPayload> {
  const detail = await getEventDetailByTitle(apiClient, token, eventTitle);
  const needsAnalyze =
    detail.generatedDocuments.length === 0 &&
    detail.vouchers.length === 0 &&
    detail.voucherDrafts.length === 0 &&
    detail.taxItems.length === 0 &&
    detail.tasks.length === 0;

  if (!needsAnalyze) {
    return detail;
  }

  await apiClient.post(`/api/events/${detail.id}/analyze`, token, {});
  return apiClient.get<EventDetailPayload>(`/api/events/${detail.id}`, token);
}

async function findContract(
  apiClient: TestApiClient,
  token: string,
  expected: ExpectedBusinessChain
): Promise<ContractDetailPayload | null> {
  if (!expected.contractTitle && !expected.contractNo) {
    return null;
  }

  const payload = await apiClient.get<ContractListPayload>("/api/contracts", token);
  const contract = payload.items.find((item) =>
    (expected.contractTitle ? item.title === expected.contractTitle : true) &&
    (expected.contractNo ? item.contractNo === expected.contractNo : true)
  );
  assert(
    contract,
    `Expected contract ${expected.contractTitle ?? expected.contractNo} to exist`
  );
  return apiClient.get<ContractDetailPayload>(`/api/contracts/${contract.id}`, token);
}

export async function resolveBusinessChain(
  apiClient: TestApiClient,
  token: string,
  expected: ExpectedBusinessChain
): Promise<ResolvedBusinessChain> {
  const event = await findEventByTitle(apiClient, token, expected.eventTitle);
  const [tasks, documents, vouchers, taxItems, contractDetail] = await Promise.all([
    apiClient.get<TaskPayload>(`/api/tasks?businessEventId=${event.id}`, token),
    apiClient.get<DocumentPayload>(`/api/documents?businessEventId=${event.id}`, token),
    apiClient.get<VoucherPayload>(`/api/vouchers?businessEventId=${event.id}`, token),
    apiClient.get<TaxItemPayload>(`/api/tax-items?businessEventId=${event.id}`, token),
    findContract(apiClient, token, expected)
  ]);

  return {
    event,
    tasks: tasks.items,
    documents: documents.items,
    vouchers: vouchers.items,
    taxItems: taxItems.items,
    contract: contractDetail?.contract ?? null,
    contractRelations: contractDetail
      ? {
          relatedEvents: contractDetail.relatedEvents,
          relatedTasks: contractDetail.relatedTasks,
          relatedDocuments: contractDetail.relatedDocuments,
          relatedTaxItems: contractDetail.relatedTaxItems,
          relatedVouchers: contractDetail.relatedVouchers
        }
      : null
  };
}

export async function assertBusinessChain(
  apiClient: TestApiClient,
  token: string,
  expectedChain: ExpectedBusinessChain,
  testInfo: TestInfo
): Promise<ResolvedBusinessChain> {
  const chain = await resolveBusinessChain(apiClient, token, expectedChain);

  await attachBusinessObject(testInfo, "resolved-business-chain", {
    event: chain.event,
    taskIds: chain.tasks.map((item) => item.id),
    documentIds: chain.documents.map((item) => item.id),
    voucherIds: chain.vouchers.map((item) => item.id),
    taxItemIds: chain.taxItems.map((item) => item.id),
    contractId: chain.contract?.id ?? null
  });

  for (const taskTitle of expectedChain.taskTitles ?? []) {
    expect(
      chain.tasks.some((task) => task.title.includes(taskTitle)),
      `Expected task containing "${taskTitle}" for event "${expectedChain.eventTitle}"`
    ).toBe(true);
  }

  for (const documentType of expectedChain.documentTypes) {
    expect(
      chain.documents.some((document) => document.documentType === documentType),
      `Expected document type "${documentType}" for event "${expectedChain.eventTitle}"`
    ).toBe(true);
  }

  if (expectedChain.voucherRequired) {
    expect(
      chain.vouchers.length,
      `Expected at least one voucher for event "${expectedChain.eventTitle}"`
    ).toBeGreaterThan(0);
  }

  for (const taxType of expectedChain.taxTypes) {
    expect(
      chain.taxItems.some((item) => item.taxType === taxType),
      `Expected tax item "${taxType}" for event "${expectedChain.eventTitle}"`
    ).toBe(true);
  }

  if (expectedChain.contractTitle || expectedChain.contractNo) {
    expect(chain.contract, "Expected linked contract details").not.toBeNull();
    expect(
      chain.contractRelations?.relatedEvents.some((item) => item.id === chain.event.id),
      "Expected contract detail to link back to the business event"
    ).toBe(true);
  }

  return chain;
}
