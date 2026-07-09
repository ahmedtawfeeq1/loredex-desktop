---
project: nimbus-web
topic: handoffs
type: handoff
date: '2026-07-01'
from_project: nimbus-api
to_project: nimbus-web
objective: Adopt the unified error-code envelope in the dashboard error toasts
status: consumed
consumed_by: Dana Reyes <dana@nimbus.dev>
consumed_at: '2026-07-02T09:15:00.000Z'
source: loredex
loredex: routed
---

# Handoff — nimbus-api → nimbus-web

Error responses now carry `{ code, message, retryable }`. Toasts should key off
`code`, not the message string.
