---
project: nimbus-web
topic: handoffs
type: handoff
date: '2026-07-04'
from_project: nimbus-api
to_project: nimbus-web
objective: Expose X-RateLimit headers so the web dashboard can render quota state
status: open
source: loredex
loredex: routed
---

# Handoff — nimbus-api → nimbus-web

The api now emits X-RateLimit-Limit / Remaining / Reset. Web should read these
and render the quota meter on the dashboard.

## Reading order

1. [[2026-07-02 - nimbus-api - rate limiting research]]
2. [[2026-07-03 - nimbus-web - dashboard layout decision]]
