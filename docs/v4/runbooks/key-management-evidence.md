# V4-5 Key Management Evidence Runbook

## Goal

Prove that production secrets and encryption keys are inventoried, rotated on a
defined cadence, and validated after rotation.

## Required Evidence File

- `artifacts/v4/baseline/ops/key-management-rotation.json`

## Minimum Fields To Fill

- `inventoryId`
- `secrets`
- `encryptionKeys`
- `rotationCadence`
- `lastRotation`
- `postRotationChecks`
- `rollbackPlan`

## Operator Steps

1. List the production secret classes required by V4:
   - database credentials
   - JWT or session secrets
   - connector API credentials
   - object storage access credentials or KMS bindings
2. Record the owner for each class and the rotation cadence.
3. Record the most recent completed rotation event or ticket.
4. Record post-rotation validation for each affected path:
   - app login or token minting still works
   - connector round-trip still passes
   - object storage upload or read still passes
5. Record the rollback or emergency re-issue path if rotation fails.
6. If any secret is intentionally static for now, list the compensating control
   and target removal date under `exceptions`.

## Acceptance Criteria

- every production secret class has an owner
- every class has a rotation cadence or approved exception
- at least one real rotation record exists
- post-rotation checks prove the system still works

## Reviewer Checks

- verify the evidence is not limited to a policy statement
- verify key rotation proof includes a completed timestamp
- reject the release if production secrets have neither cadence nor exception
