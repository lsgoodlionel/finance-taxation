# V4-5 Monitoring Evidence Runbook

## Goal

Prove that private-cloud production has dashboards, actionable alerts, and at
least one recent alert drill that reached the right responder path.

## Required Evidence File

- `artifacts/v4/baseline/ops/monitoring-alert-drill.json`

## Minimum Fields To Fill

- `dashboardLocation`
- `serviceLevelIndicators`
- `alertRules`
- `notificationTargets`
- `lastDrill`
- `incidentSample`

## Operator Steps

1. Record the dashboard or query path used during release review.
2. Capture the SLI or metric names that matter for V4-5:
   - API latency
   - page latency
   - error rate
   - background task backlog or retry count
   - object storage availability if uploads are enabled
3. For each critical alert, record:
   - rule ID or alert name
   - trigger condition
   - delivery target such as Slack, pager, or internal notification
4. Trigger or reference the latest drill for one production-like alert.
5. Save the drill ticket, acknowledgement timestamp, and responder identity.
6. If monitoring coverage is partial, list the uncovered metric explicitly in
   `coverageGaps`.

## Acceptance Criteria

- reviewer can open the dashboard or query path
- at least one alert route has been drilled recently
- drill evidence includes trigger time, acknowledgement time, and assignee
- no critical alert lacks a destination target

## Reviewer Checks

- verify alert rules cover the same domains used by `load.json` and
  `backup-restore.json`
- verify monitoring is not limited to screenshots without rule IDs
- reject the release if the alert drill lacks acknowledgement proof
