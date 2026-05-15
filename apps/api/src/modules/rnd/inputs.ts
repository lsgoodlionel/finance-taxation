import type { RndCostLine, RndTimeEntry } from "@finance-taxation/domain-model";

interface NormalizedRndCostLineInput {
  businessEventId: string | null;
  voucherId: string | null;
  costType: RndCostLine["costType"];
  accountingTreatment: RndCostLine["accountingTreatment"];
  amount: string;
  occurredOn: string;
  notes: string;
}

interface NormalizedRndTimeEntryInput {
  businessEventId: string | null;
  userId: string | null;
  staffName: string;
  workDate: string;
  hours: string;
  notes: string;
}

function normalizeMoney(value: string | number): string {
  const amount = typeof value === "number" ? value : Number(value || 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("amount must be greater than 0");
  }
  return amount.toFixed(2);
}

function normalizeHours(value: string | number): string {
  const hours = typeof value === "number" ? value : Number(value || 0);
  if (!Number.isFinite(hours) || hours <= 0) {
    throw new Error("hours must be greater than 0");
  }
  return hours.toFixed(2);
}

function normalizeDate(value: unknown, fieldName: string): string {
  const text = String(value || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new Error(`${fieldName} must be in YYYY-MM-DD format`);
  }
  return text;
}

export function normalizeRndCostLineInput(input: {
  businessEventId?: string | null;
  voucherId?: string | null;
  costType?: RndCostLine["costType"];
  accountingTreatment?: RndCostLine["accountingTreatment"];
  amount?: string | number;
  occurredOn?: string;
  notes?: string;
}): NormalizedRndCostLineInput {
  return {
    businessEventId: input.businessEventId ?? null,
    voucherId: input.voucherId ?? null,
    costType: input.costType || "other",
    accountingTreatment: input.accountingTreatment || "expensed",
    amount: normalizeMoney(input.amount ?? 0),
    occurredOn: normalizeDate(input.occurredOn, "occurredOn"),
    notes: String(input.notes || "").trim()
  };
}

export function normalizeRndTimeEntryInput(input: {
  businessEventId?: string | null;
  userId?: string | null;
  staffName?: string;
  workDate?: string;
  hours?: string | number;
  notes?: string;
}): NormalizedRndTimeEntryInput {
  const staffName = String(input.staffName || "").trim();
  if (!staffName) {
    throw new Error("staffName is required");
  }
  return {
    businessEventId: input.businessEventId ?? null,
    userId: input.userId ?? null,
    staffName,
    workDate: normalizeDate(input.workDate, "workDate"),
    hours: normalizeHours(input.hours ?? 0),
    notes: String(input.notes || "").trim()
  };
}
