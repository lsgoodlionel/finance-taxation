# CI V4 Acceptance Runbook

## Goal

Make CI publish the same V4-0 acceptance evidence that local runs produce, then interpret failures consistently.

## CI Contract

CI should execute the V4 baseline flow in this order:

```bash
npm ci
npm run typecheck:v2
npm run test:unit
npm run test:e2e
npm run v4:report
```

If the workflow also provisions the isolated V4 stack in CI, keep the setup steps ahead of the test commands.

## Required Artifact Set

CI should retain and expose:

- `playwright-report/`
- `artifacts/v4/`

The critical machine-readable report outputs are:

- `artifacts/v4/baseline/reports/acceptance-report.json`
- `artifacts/v4/baseline/reports/acceptance-report.md`
- `artifacts/v4/baseline/ops/load.json`
- `artifacts/v4/baseline/ops/backup-restore.json`
- `artifacts/v4/baseline/ops/connectors.json`
- `artifacts/v4/baseline/ops/ai-evals.json`

## Environment Metadata

For reproducible CI reports, inject:

- `V4_REPORT_COMMIT_SHA` with the workflow commit SHA
- `V4_REPORT_GENERATED_AT` with the workflow timestamp

If not injected, the generator falls back to `git rev-parse HEAD` and uses `unknown` for the timestamp.

## Interpreting Outcomes

### Green

- `summary.failed === 0`
- `summary.blocked === 0`
- `warnings.length === 0`

### Needs Follow-Up

Any of these should trigger review:

- non-zero `failed`
- non-zero `blocked`
- warnings about missing screenshots, traces, or business-object IDs
- no supplemental `docs/v4/audits` evidence included in the report

### Acceptable Recorded Product Gaps

Per the V4-0 plan, a product-flow gap may remain temporarily only when:

- the failing case is present in `acceptance-report.json`
- the human-readable markdown explains the failure path
- the follow-up defect or feedback path is recorded elsewhere in the V4 workflow

## Triage Order

1. Read `summary`.
2. Read `warnings`.
3. Read `failuresByModule`.
4. Open the matching Playwright HTML artifact for screenshots and trace context.
5. Cross-check linked audit markdown in `docs/v4/audits`.

## Operator Notes

- Do not patch the generated report files in CI.
- Regenerate with `npm run v4:report` after any rerun that changes `results.json`.
- Keep CI and local interpretations aligned by treating the JSON report as the source of truth.
- Production certification gates now read machine evidence from `artifacts/v4/baseline/ops/*.json`:
  - `npm run v4:ops:init-sources`
  - `npm run v4:ops`
  - `npm run test:load`
  - `npm run test:backup-restore`
  - `npm run test:connectors`
  - `npm run test:ai-evals`
- `v4:ops:init-sources` should run before CI injects or patches the real `ops-sources/*.json` payloads.
- `v4:ops:record` can be used by CI jobs to normalize external certification payloads before `v4:ops`, for example:
  - `npm run v4:ops:record -- connectors --input docs/v4/examples/ops-source-samples/connector-certification.json`
  - `npm run v4:ops:record -- backup-restore --input docs/v4/examples/ops-source-samples/backup-drill.json`
  - `npm run v4:ops:record -- ai-evals --input docs/v4/examples/ops-source-samples/ai-evals.json`
- `v4:ops` should run before those four gates so CI always publishes the normalized evidence files even when some upstream source files are missing.
- If the CI runner blocks loopback health probes, call `node --import tsx tools/v4/run-production-gates-generation.mjs --repo-root <repo> --health-probe-latencies <csv>` after collecting latency samples through the runner's approved network path.
- Local reference: when the V4 docker test stack exposes `127.0.0.1:33100`, `npm run v4:ops` has been verified to produce `load.json` with `source: playwright-and-health-probe`.
- Evidence field requirements and thresholds are defined in `docs/v4/acceptance-evidence-schema.md`.
