---
project: nimbus-backend
topic: streaming
type: note
date: '2026-07-09'
tags:
  - streaming
  - sse
  - api-contract
  - openapi
  - postman
source: claude-code-session
loredex: routed
source_path: >-
  /Users/dana/dev/nimbus/nimbus-backend/docs/streaming-api.md
source_project: nimbus-backend
source_rel: docs/streaming-api.md
---

# Public SSE streaming endpoint

## Decision

The engine's token streaming (`run_stream()` in nimbus-ai-engine, handoff
`2026-07-09-handoff-nimbus-ai-engine`) is exposed over the public API as
Server-Sent Events, not websockets: one-directional fits the use case, and it
composes with the existing REST surface without a new transport stack.

## Endpoint

`GET /conversations/{id}/stream?text=<message>` → `200`,
`Content-Type: text/event-stream`. Implemented in `src/api.ts`
(`streamMessage()`), declared in `openapi.yaml`, and mirrored in
`postman_collection.json` as "Stream reply (SSE)". Commit `f3a398e`.

## SSE event format

Each engine chunk dict maps 1:1 onto an SSE frame:

```
event: token
data: {"type":"token","text":"partial ","convId":"c1"}

event: done
data: {"type":"done","text":"<full reply>","convId":"c1"}
```

- `token` — incremental, append-only text.
- `done` — exactly one, always last, carries the full authoritative reply.
  Consumers must prefer it over concatenated tokens.
- `error` — see below.
- Unknown event types must be ignored (engine will add `tool_call` later).

Flush cadence is inherited from the engine (whichever comes first: ~40ms
elapsed or ~24 chars buffered) and is **best-effort, not a contract
guarantee** — to be revisited against real channel latency needs.

## Error semantics

On upstream failure the stream emits `event: error` with
`data: {"type":"error","text":"<message>","convId":...}`, then still emits
`done` with the text accumulated so far. `done` is therefore always the close
signal; clients never need a timeout to detect normal termination.
Keep-alive: a comment frame (`: ping`) every 15s on idle connections
(follow-up work; not yet implemented).

## Contract ownership — open question

`openapi.yaml` and `postman_collection.json` live in **this repo**
(nimbus-backend is the source of truth for endpoints). But their consumers
are nimbus-frontend and nimbus-mobile, who do not watch this repo's commits.
Today an endpoint change only reaches them if the handoff brief happens to
describe it. There is no mechanism that attaches the actual contract diff
(the openapi.yaml hunk, the new Postman request) to a handoff — consumers
get prose, not the machine-readable delta. Until that exists, every
endpoint-affecting handoff from this repo must manually restate the
endpoint, verb, params, and event/response shapes in the brief.
