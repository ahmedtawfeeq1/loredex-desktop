---
project: nimbus-api
topic: rate limit headers
type: handoff
date: '2026-07-04'
status: open
objective: Expose X-RateLimit headers so the web dashboard can render quota state
tags:
  - handoff
loredex: routed
---

# Handoff: rate limit headers

The api now emits X-RateLimit-Limit / Remaining / Reset. Web should read these
and render the quota meter on the dashboard.

_Consume with:_ `loredex handoffs --consume 2026-07-04 - handoff - nimbus-api to nimbus-web - rate limit headers`
