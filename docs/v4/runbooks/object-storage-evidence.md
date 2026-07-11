# V4-5 Object Storage Evidence Runbook

## Goal

Capture proof that production file storage uses the intended private-cloud
bucket or tenant, has encryption and retention defined, and can restore a
sample object without manual guesswork.

## Required Evidence File

- `artifacts/v4/baseline/ops/object-storage-verification.json`

## Minimum Fields To Fill

- `provider`
- `bucket`
- `tenantOrProject`
- `encryption`
- `retentionPolicy`
- `sampleObject`
- `restoreCheck`
- `accessReview`

## Operator Steps

1. Record the exact bucket, namespace, or tenant used by V4 documents.
2. Record the server-side encryption mode and key reference.
3. Record the retention or lifecycle policy path:
   - object versioning
   - retention days
   - delete / archive transition rule
4. Upload or reference a sample non-sensitive file in the target environment.
5. Verify the file can be listed, downloaded, and matched to metadata.
6. Verify one restore or version retrieval path and record the command, UI
   path, or ticket used.
7. Record who can access the bucket and who approved that access.

## Acceptance Criteria

- bucket or tenant identifier is explicit
- encryption mode is named and traceable
- lifecycle or retention policy has a stable reference
- sample object verification includes upload time and restore result
- access review identifies owner and reviewer

## Reviewer Checks

- verify storage evidence is for private-cloud target storage, not local disk
- verify restore proof exists in addition to upload proof
- reject the release if the bucket access list has no owner or review date
