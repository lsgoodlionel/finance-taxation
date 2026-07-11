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

## V4-5 Private-Cloud Release Evidence Supplement

The four machine gates above remain the blocking JSON checks for load, recovery,
connectors, and AI quality. Private-cloud release readiness adds a second,
documentation-first evidence layer for:

- security
- monitoring and alerting
- object storage
- key management

This supplement exists because the V4-5 spec also requires final authorization
evidence, operational drills, and private-cloud deployment proof that cannot be
reduced to the current `ops/*.json` gate set without changing tool behavior.

### Required Document Set

Release owners must prepare and review:

- `docs/v4/runbooks/private-cloud-release-evidence.md`
- `docs/v4/runbooks/security-evidence.md`
- `docs/v4/runbooks/monitoring-evidence.md`
- `docs/v4/runbooks/object-storage-evidence.md`
- `docs/v4/runbooks/key-management-evidence.md`

The release packet should also retain:

- one manifest JSON under `artifacts/v4/baseline/ops/`
- one evidence JSON per required category under `artifacts/v4/baseline/ops/`
- one audit markdown entry under `docs/v4/audits/` when gaps are found

### Manifest Shape

The recommended manifest file is
`artifacts/v4/baseline/ops/private-cloud-evidence-manifest*.json`.

```ts
interface PrivateCloudEvidenceManifest {
  generatedAt: string;
  releaseId: string;
  environment: "sample" | "staging" | "production";
  sample: boolean;
  preparedBy: string;
  reviewedBy: string[];
  requiredCategories: Array<
    | "security"
    | "monitoring"
    | "object_storage"
    | "key_management"
  >;
  evidence: PrivateCloudEvidenceEntry[];
  notes?: string[];
}

interface PrivateCloudEvidenceEntry {
  category: "security" | "monitoring" | "object_storage" | "key_management";
  evidenceType: string;
  path: string;
  status: "sample" | "ready_for_backfill" | "collected" | "approved";
  sample: boolean;
  controlId: string;
  summary: string;
  verifiedAt?: string;
  verifiedBy?: string;
  requiresBackfill: string[];
}
```

### Category Evidence Rules

Each category must leave behind at least one concrete evidence record with
verifiable fields:

- `security`
  - identity control mode (`mfa` or `sso`)
  - privileged-access reviewer
  - audit-log export or query location
  - high-risk action sample IDs
- `monitoring`
  - dashboard or query path
  - alert rule identifiers
  - last drill timestamp
  - incident acknowledgement or escalation target
- `object_storage`
  - bucket or tenant identifier
  - encryption mode
  - lifecycle / retention policy reference
  - upload + restore verification record
- `key_management`
  - key inventory identifier
  - secret owner
  - rotation cadence
  - last rotation proof
  - rollback / re-encryption check

### Sample Versus Real Evidence

The repository may ship sample evidence files for structure validation and
operator onboarding. Samples must be clearly marked:

- filename contains `.sample.`
- root field `sample` is `true`
- any environment-specific field that must be replaced appears in
  `requiresBackfill`
- sample values use obvious placeholders such as `sample-private-cloud`

Real release evidence must instead satisfy all of the following:

- filename does not contain `.sample.`
- root field `sample` is `false`
- `requiresBackfill` is empty for every approved entry
- `verifiedAt` and `verifiedBy` are populated
- referenced dashboards, exports, or tickets exist and are reachable to the
  release reviewer

### Recommended Evidence Files

The repo now uses these lightweight sample filenames as templates:

- `artifacts/v4/baseline/ops/private-cloud-evidence-manifest.sample.json`
- `artifacts/v4/baseline/ops/security-access-review.sample.json`
- `artifacts/v4/baseline/ops/monitoring-alert-drill.sample.json`
- `artifacts/v4/baseline/ops/object-storage-verification.sample.json`
- `artifacts/v4/baseline/ops/key-management-rotation.sample.json`

### Review Contract

V4-5 private-cloud release is considered document-ready only when:

- the four existing machine gates are green
- every required manifest category is present
- every required runbook step has a named operator action and output path
- sample placeholders are replaced or explicitly called out as non-production
- any remaining gap is written to `docs/v4/audits/*.md` with owner and closure
  condition
