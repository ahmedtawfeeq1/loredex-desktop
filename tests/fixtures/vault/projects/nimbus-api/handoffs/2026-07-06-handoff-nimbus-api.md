---
project: nimbus-api
topic: handoffs
type: handoff
date: '2026-07-06'
from_project: nimbus-web
to_project: nimbus-api
objective: Add a bulk endpoint for dashboard widgets to fetch quota state in one call
status: open
source: loredex
loredex: routed
---

# Handoff — nimbus-web → nimbus-api

One widget = one request is too chatty. The dashboard wants
`GET /v1/quota?keys=…` returning all quota states in one payload.

## Reading order

1. [[2026-07-03 - nimbus-web - dashboard layout decision]]
