---
project: nimbus-api
topic: rate limiting
type: research
date: 2026-07-02
status: active
tags: [api, throttling]
---

# Rate limiting research

Token bucket beats sliding window for our burst profile. Redis-backed counters
keep the limiter consistent across api replicas.
