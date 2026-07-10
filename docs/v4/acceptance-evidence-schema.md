# V4 Acceptance Evidence Schema

## Scope

V4-0 acceptance evidence is generated from existing baseline artifacts instead of hand-written summaries. The report generator reads:

- `artifacts/v4/baseline/browser/results.json`
- `docs/v4/audits/**/*.md`

It writes:

- `artifacts/v4/baseline/reports/acceptance-report.json`
- `artifacts/v4/baseline/reports/acceptance-report.md`

## Source Inputs

### Playwright JSON

`results.json` is the primary machine-readable input. Each Playwright spec contributes one or more acceptance cases. The generator derives:

- `caseId` from a stable token in the test title such as `PUR-STD-001`, `TRA-STD-001`, or `CON-MISSING-001`
- `status` from the final Playwright result:
  - `passed` for fully passing cases
  - `failed` for `failed` or `timedOut`
  - `blocked` for `interrupted`, `skipped`, or `cancelled`
- `attachments` from Playwright attachments such as screenshots, traces, and JSON business-object payloads
- `objectIds` from embedded JSON attachments like `resolved-business-chain`

### Audit Markdown

Markdown files under `docs/v4/audits` are treated as supplemental acceptance evidence. For each file the generator captures:

- `title` from the first `#` heading
- `date` from a `日期：YYYY-MM-DD` line when present
- `summary` from the first bullet line

## Acceptance Case Shape

Each case in `acceptance-report.json` uses this structure:

```ts
interface AcceptanceEvidence {
  caseId: string;
  scenario: string;
  role: string;
  status: "passed" | "failed" | "blocked";
  expected: string;
  actual: string;
  objectIds: Record<string, string[]>;
  attachments: string[];
  defectId?: string;
}
```

## Object ID Keys

The generator currently normalizes business-object references into these keys:

- `eventIds`
- `taskIds`
- `documentIds`
- `voucherIds`
- `taxItemIds`
- `contractIds`

Empty arrays are preserved so downstream tooling can distinguish “field absent” from “no IDs captured.”

## Report JSON Shape

Top-level `acceptance-report.json` contains:

- `runLabel`: currently `baseline`
- `generatedAt`: ISO timestamp or injected deterministic value
- `commitSha`: git SHA or injected CI value
- `environment`: Node version and platform
- `summary`: total, passed, failed, blocked, and `byStatus`
- `evidence`: sorted acceptance cases
- `failuresByModule`: failed cases grouped by V4 scenario module such as `purchase_expense`
- `audits`: supplemental audit entries from `docs/v4/audits`
- `warnings`: missing-evidence warnings

`markdown` is intentionally excluded from the JSON file because it is emitted separately to `acceptance-report.md`.

## Missing-Evidence Warnings

The generator emits warnings when:

- a case has no screenshot or trace attachment
- a case has no business-object IDs
- no supplemental audit markdown is found

Warnings do not automatically fail the run, but V4-0 handoff should treat them as acceptance gaps until explained in the report or follow-up feedback.

## Retention Rules

- Keep `results.json`, `acceptance-report.json`, and `acceptance-report.md` together for the same baseline run.
- Keep linked audit markdown under `docs/v4/audits` so the report remains reproducible.
- Do not edit generated report files by hand; regenerate them with `npm run v4:report`.

## Production Gate Evidence

V4-5 production gates read deterministic JSON evidence from:

- `artifacts/v4/baseline/ops/load.json`
- `artifacts/v4/baseline/ops/backup-restore.json`
- `artifacts/v4/baseline/ops/connectors.json`
- `artifacts/v4/baseline/ops/ai-evals.json`

These files are machine-checked by:

- `npm run v4:ops:init-sources`
- `npm run v4:ops`
- `npm run test:load`
- `npm run test:backup-restore`
- `npm run test:connectors`
- `npm run test:ai-evals`

`v4:ops:init-sources` creates fillable templates for the optional source files. `v4:ops:record` can then import external JSON into those files. `v4:ops` uses these sources:

- required:
  - `artifacts/v4/baseline/browser/results.json`
  - `artifacts/v4/baseline/reports/acceptance-report.json`
- optional:
  - `artifacts/v4/baseline/ops-sources/backup-restore.json`
  - `artifacts/v4/baseline/ops-sources/connectors.json`
  - `artifacts/v4/baseline/ops-sources/ai-evals.json`

When optional source files are missing, the generator must emit explicit failing placeholder evidence instead of faking a passing result.

Import examples:

- `npm run v4:ops:record -- connectors --input docs/v4/examples/ops-source-samples/connector-certification.json`
- `npm run v4:ops:record -- backup-restore --input docs/v4/examples/ops-source-samples/backup-drill.json`
- `npm run v4:ops:record -- ai-evals --input docs/v4/examples/ops-source-samples/ai-evals.json`

The repository ships these three sample payloads under `docs/v4/examples/ops-source-samples/` so local and CI flows can exercise the import path without preparing external files first.

For `load.json`, the runtime also accepts explicit latency samples through `node --import tsx tools/v4/run-production-gates-generation.mjs --repo-root <repo> --health-probe-latencies <csv>`. Use this fallback when the current shell, CI runner, or sandbox blocks direct loopback probe collection.

### `load.json`

```ts
interface LoadEvidence {
  generatedAt: string;
  samples: number;
  pageP95Ms: number;  // must be <= 2000
  apiP95Ms: number;   // must be <= 500
  errorRate: number;  // must be <= 0.05
  scenarios: string[];
}
```

### `backup-restore.json`

```ts
interface BackupRestoreEvidence {
  generatedAt: string;
  backupCompletedAt: string;
  restoreVerifiedAt: string;
  rpoHours: number;   // must be <= 24
  rtoHours: number;   // must be <= 4
  verifiedBy: string;
}
```

### `connectors.json`

```ts
interface ConnectorsEvidence {
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
```

Any connector with `status !== "passed"` will fail the gate.

### `ai-evals.json`

```ts
interface AiEvalEvidence {
  generatedAt: string;
  sampleSize: number;
  suggestionAcceptanceRate: number;   // must be >= 0.85
  documentRecallRate: number;         // must be >= 0.95
  highRiskAutoExecutionCount: number; // must be 0
  falsePositiveRate: number;
}
```
