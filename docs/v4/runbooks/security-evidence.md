# V4-5 Security Evidence Runbook

## Goal

Collect auditable proof that private-cloud production access uses MFA or SSO,
keeps privileged access reviewed, and leaves behind high-risk action audit
evidence.

## Required Evidence File

- `artifacts/v4/baseline/ops/security-access-review.json`

## Minimum Fields To Fill

- `identityControl.mode`
- `identityControl.provider`
- `privilegedRoles`
- `reviewWindow`
- `reviewedBy`
- `auditLog.exportLocation`
- `auditLog.highRiskActionSamples`
- `exceptions`

## Operator Steps

1. Identify the production identity mode:
   - `mfa` when platform login requires a second factor
   - `sso` when the IdP is the only production login path
2. Export or capture the privileged role list for the release window.
3. Record who reviewed each privileged role assignment and when.
4. Query or export at least one high-risk action per sensitive path:
   - user / role grant
   - connector credential update
   - payroll or tax submission authorization
   - document export or delete with financial impact
5. Store the export path, query link, or ticket ID in the JSON evidence file.
6. If any privileged access is temporary, add the expiry date and rollback
   owner under `exceptions`.

## Acceptance Criteria

- production auth path is explicitly `mfa` or `sso`
- every privileged role has a named reviewer
- at least one audit-log sample exists for each high-risk action family in use
- no open exception lacks owner and expiry

## Reviewer Checks

- verify the identity provider name matches the deployed environment
- verify exported role membership matches the release window
- verify audit-log samples include timestamp, actor, action, and target
- reject the release if evidence only says "已开启" without export or query path
