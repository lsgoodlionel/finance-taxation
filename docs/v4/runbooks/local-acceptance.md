# Local V4 Acceptance Runbook

## Goal

Run the V4-0 local gate with deterministic seed data, execute the baseline acceptance checks, and regenerate the machine-readable acceptance report.

## Preconditions

- Work from the intended V4 worktree and branch.
- Use the isolated V4 test stack only.
- Ensure `npm ci` has completed.

## Full Local Gate

Run these commands in order:

```bash
npm ci
npm run v4:test:setup
npm run typecheck:v2
npm run test:unit
npm run test:e2e
npm run v4:report
npm run verify:v4
```

## Focused Report Regeneration

If browser artifacts already exist and only the report needs refresh:

```bash
./node_modules/.bin/tsx --test tools/v4/generate-acceptance-report.test.ts
npm run v4:report
```

## Expected Outputs

After `npm run v4:report`, verify these files exist:

- `artifacts/v4/baseline/browser/results.json`
- `artifacts/v4/baseline/reports/acceptance-report.json`
- `artifacts/v4/baseline/reports/acceptance-report.md`

Supplemental audits should remain under:

- `docs/v4/audits/`

For V4-5 production certification, prepare these machine-readable evidence files before running the extra gates:

- `artifacts/v4/baseline/ops/load.json`
- `artifacts/v4/baseline/ops/backup-restore.json`
- `artifacts/v4/baseline/ops/connectors.json`
- `artifacts/v4/baseline/ops/ai-evals.json`

Then run:

```bash
npm run v4:ops:init-sources
npm run v4:ops
npm run test:load
npm run test:backup-restore
npm run test:connectors
npm run test:ai-evals
```

说明：

- `npm run v4:ops:init-sources` 会初始化 `artifacts/v4/baseline/ops-sources/*.json` 模板，供恢复演练、连接器认证和 AI 评测结果录入。
- 如已有真实结果文件，可执行：
  - `npm run v4:ops:record -- connectors --input docs/v4/examples/ops-source-samples/connector-certification.json`
  - `npm run v4:ops:record -- backup-restore --input docs/v4/examples/ops-source-samples/backup-drill.json`
  - `npm run v4:ops:record -- ai-evals --input docs/v4/examples/ops-source-samples/ai-evals.json`
- `npm run v4:ops` 会从 `artifacts/v4/baseline/browser/results.json` 与 `artifacts/v4/baseline/reports/acceptance-report.json` 生成四份标准化证据。
- `load` 会优先使用本地健康探针，默认目标是 `V4_API_HEALTH_URL` 或 `http://127.0.0.1:33100/api/health`；若当前环境限制回环访问，可改为 `node --import tsx tools/v4/run-production-gates-generation.mjs --repo-root <repo> --health-probe-latencies 12,10,9` 这类显式样本方式。
- `backup-restore / connectors / ai-evals` 若存在 `artifacts/v4/baseline/ops-sources/*.json` 原始来源文件，会按真实值生成；若缺失，会生成显式失败占位证据。
- 已验证的本机参考结果：在 `finance-taxation-v4-test` stack 正常启动时，`npm run v4:ops` 可直接采集 `http://127.0.0.1:33100/api/health`，并生成 `source: playwright-and-health-probe` 的 `load.json`。

Field requirements and thresholds follow `docs/v4/acceptance-evidence-schema.md`.

For V4-5 private-cloud release review, also prepare the supplemental evidence
layer described in:

- `docs/v4/runbooks/private-cloud-release-evidence.md`
- `docs/v4/runbooks/security-evidence.md`
- `docs/v4/runbooks/monitoring-evidence.md`
- `docs/v4/runbooks/object-storage-evidence.md`
- `docs/v4/runbooks/key-management-evidence.md`

Use the sample files under `artifacts/v4/baseline/ops/*.sample.json` only as
fillable templates. Before production sign-off, copy them to non-sample
filenames, replace every field listed in `requiresBackfill`, and set
`sample: false`.

## How To Read The Report

- Check `summary` first for total/pass/fail/blocked counts.
- Review `warnings` next. Missing screenshot or object-ID evidence means the run is not fully documented even if Playwright passed.
- Use `failuresByModule` to see which V4 scenario slice needs follow-up.
- Open `acceptance-report.md` when handing results to humans; use `acceptance-report.json` for scripts and CI artifacts.

## Exit Criteria

The V4-0 local gate is ready to hand off when:

- setup and verification commands complete
- the acceptance report is regenerated successfully
- any remaining product-flow failures are explicitly present in the report
- any missing-evidence warnings are either resolved or called out in handoff notes
