/**
 * 财税资料包与现金流前瞻 相关接口。自 `lib/api.ts` 拆出（V15/P2）。
 */
import {
  request
} from "./client";

// ── F9 财税资料包 ────────────────────────────────────────────────────────────

export interface ArchiveSection { stage: string; label: string; count: number; detail: string; complete: boolean }
export interface ArchivePackage {
  period: string;
  company: { name: string; creditCode: string };
  sections: ArchiveSection[];
  completeCount: number;
  total: number;
  archived: boolean;
  readyToArchive: boolean;
  generatedAt: string;
}

export async function getArchivePackage(period?: string) {
  const q = period ? `?period=${encodeURIComponent(period)}` : "";
  return request<ArchivePackage>(`/api/archive/package${q}`);
}

// ── P7 现金流前瞻 ────────────────────────────────────────────────────────────

export interface CashForecast {
  cashBalance: number;
  expectedInflow: number;
  expectedOutflow: number;
  projectedBalance: number;
  salaryNeed: number;
  canPaySalary: boolean;
  gap: number;
  verdict: string;
}

export async function getCashForecast(period?: string) {
  const q = period ? `?period=${encodeURIComponent(period)}` : "";
  return request<{ period: string; forecast: CashForecast }>(`/api/forecast/cash${q}`);
}
