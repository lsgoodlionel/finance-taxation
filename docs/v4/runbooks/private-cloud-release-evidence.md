# V4-5 Private-Cloud Release Evidence Checklist

## Goal

Prepare a release packet that keeps the existing `ops/*.json` machine gates
unchanged while adding reviewable evidence for security, monitoring, object
storage, and key management.

## Scope

This checklist applies only to V4-5 private-cloud production certification.
It supplements, and does not replace, these existing machine gates:

- `artifacts/v4/baseline/ops/load.json`
- `artifacts/v4/baseline/ops/backup-restore.json`
- `artifacts/v4/baseline/ops/connectors.json`
- `artifacts/v4/baseline/ops/ai-evals.json`

## Required Outputs

Before release review, retain:

- `artifacts/v4/baseline/ops/private-cloud-evidence-manifest.json`
- `artifacts/v4/baseline/ops/security-access-review.json`
- `artifacts/v4/baseline/ops/monitoring-alert-drill.json`
- `artifacts/v4/baseline/ops/object-storage-verification.json`
- `artifacts/v4/baseline/ops/key-management-rotation.json`

If real environment evidence is not yet available, the matching `.sample.json`
files may be used only to validate structure. They do not satisfy production
certification on their own.

## Release Packet Assembly

1. Regenerate or verify the existing machine-gated files:
   - `npm run v4:ops`
   - `npm run test:load`
   - `npm run test:backup-restore`
   - `npm run test:connectors`
   - `npm run test:ai-evals`
2. Copy the sample private-cloud evidence files to non-sample filenames.
3. Replace every placeholder named in each file's `requiresBackfill`.
4. Follow the category runbooks to collect screenshots, exports, query paths,
   drill records, and reviewer names.
5. Set `sample: false` on every real evidence file.
6. Update `private-cloud-evidence-manifest.json` so every required category is
   `collected` or `approved`.
7. If any category cannot be completed, record the exact blocker in
   `docs/v4/audits/` before asking for release approval.

## Review Checklist

The reviewer must confirm all of the following:

- four machine gates are green
- manifest contains `security`, `monitoring`, `object_storage`,
  `key_management`
- every evidence file has `verifiedAt` and `verifiedBy`
- every `requiresBackfill` array is empty
- every referenced dashboard, ticket, export, or bucket path exists
- any release exception has a matching audit record and owner

## Evidence Status Meanings

- `sample`: structure example only; never enough for production release
- `ready_for_backfill`: template prepared but environment values still missing
- `collected`: operator captured real evidence and filled required fields
- `approved`: reviewer checked the evidence and accepted the control

## Failure Handling

Stop the release if any of these is true:

- machine-gated JSON fails thresholds
- any required category remains `sample` or `ready_for_backfill`
- privileged access, alert routing, storage restore, or key rotation cannot be
  demonstrated
- evidence links or query paths are unavailable to the reviewer

## Runbook Index

- `docs/v4/runbooks/security-evidence.md`
- `docs/v4/runbooks/monitoring-evidence.md`
- `docs/v4/runbooks/object-storage-evidence.md`
- `docs/v4/runbooks/key-management-evidence.md`
