import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export interface BackupRestoreSourceInput {
  generatedAt: string;
  backupCompletedAt: string;
  restoreVerifiedAt: string;
  rpoHours: number;
  rtoHours: number;
  verifiedBy: string;
}

export interface ConnectorSourceInput {
  generatedAt: string;
  connectors: Array<{
    key: string;
    label: string;
    status: "passed" | "failed";
    lastVerifiedAt: string;
    roundtripMs: number;
    notes?: string;
  }>;
}

export interface AiEvalSourceInput {
  generatedAt: string;
  sampleSize: number;
  suggestionAcceptanceRate: number;
  documentRecallRate: number;
  highRiskAutoExecutionCount: number;
  falsePositiveRate: number;
}

function getOpsSourcesDir(repoRoot: string) {
  return path.join(repoRoot, "artifacts", "v4", "baseline", "ops-sources");
}

async function writeSourceFile(repoRoot: string, fileName: string, payload: unknown) {
  const dir = getOpsSourcesDir(repoRoot);
  await mkdir(dir, { recursive: true });
  const outputPath = path.join(dir, fileName);
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
  return outputPath;
}

export function createBackupRestoreTemplate(generatedAt: string): BackupRestoreSourceInput {
  return {
    generatedAt,
    backupCompletedAt: "",
    restoreVerifiedAt: "",
    rpoHours: 0,
    rtoHours: 0,
    verifiedBy: "fill-with-operator-or-runbook-id"
  };
}

export function createConnectorTemplate(generatedAt: string): ConnectorSourceInput {
  return {
    generatedAt,
    connectors: [
      { key: "invoice_verify", label: "发票验真", status: "failed", lastVerifiedAt: "", roundtripMs: 0, notes: "fill with certification result" },
      { key: "bank_api", label: "银行直连", status: "failed", lastVerifiedAt: "", roundtripMs: 0, notes: "fill with certification result" },
      { key: "tax_export", label: "税务导出", status: "failed", lastVerifiedAt: "", roundtripMs: 0, notes: "fill with certification result" },
      { key: "ocr", label: "OCR 识别", status: "failed", lastVerifiedAt: "", roundtripMs: 0, notes: "fill with certification result" }
    ]
  };
}

export function createAiEvalTemplate(generatedAt: string): AiEvalSourceInput {
  return {
    generatedAt,
    sampleSize: 0,
    suggestionAcceptanceRate: 0,
    documentRecallRate: 0,
    highRiskAutoExecutionCount: 0,
    falsePositiveRate: 0
  };
}

export async function writeBackupRestoreSource(repoRoot: string, input: BackupRestoreSourceInput) {
  return writeSourceFile(repoRoot, "backup-restore.json", input);
}

export async function writeConnectorSource(repoRoot: string, input: ConnectorSourceInput) {
  return writeSourceFile(repoRoot, "connectors.json", input);
}

export async function writeAiEvalSource(repoRoot: string, input: AiEvalSourceInput) {
  return writeSourceFile(repoRoot, "ai-evals.json", input);
}
