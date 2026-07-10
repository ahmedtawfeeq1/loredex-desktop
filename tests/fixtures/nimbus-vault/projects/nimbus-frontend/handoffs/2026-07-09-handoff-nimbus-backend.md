---
project: nimbus-frontend
topic: handoffs
type: handoff
date: '2026-07-09'
from_project: nimbus-backend
to_project: nimbus-frontend
objective: Consume the SSE streaming endpoint in the console chat tester
status: consumed
source: loredex
loredex: routed
---
# Handoff — nimbus-backend → nimbus-frontend

**Objective:** Consume the SSE streaming endpoint in the console chat tester

This body of work exposes the nimbus-ai-engine's token streaming over the public API as Server-Sent Events, shipped in commit `f3a398e`. The contract is `GET /conversations/{id}/stream?text=<message>` returning `200` with `Content-Type: text/event-stream` — implemented in `streamMessage()` in `src/api.ts`, declared in `openapi.yaml`, and mirrored in `postman_collection.json` as "Stream reply (SSE)". SSE was chosen over websockets deliberately: replies are one-directional and it composes with the existing REST surface, so the chat tester can use a plain `EventSource` with no new transport stack.

For the console chat tester, the event semantics in `2026-07-09-streaming-api` are the contract you build against. `token` events carry incremental, append-only text (`{"type":"token","text":"...","convId":"..."}`). Exactly one `done` event arrives last and carries the **full authoritative reply** — replace your concatenated token buffer with `done.text` rather than trusting the concatenation. On upstream failure the stream emits `event: error` (same JSON shape, `text` is the error message) and then *still* emits `done` with whatever text accumulated. That means `done` is always the close signal: the client never needs a timeout to detect normal termination.

Two gotchas before you build. First, unknown event types must be ignored — the engine will add `tool_call` later, so switch on known types and drop the rest silently. Second, flush cadence (~40ms or ~24 chars, whichever first) is inherited from the engine and is explicitly best-effort, not a contract guarantee — don't build UI timing assumptions on it. Also note keep-alive comment frames (`: ping` every 15s on idle) are follow-up work and not yet implemented, so long-idle connections have no heartbeat today.

One open process issue worth knowing: `openapi.yaml` and `postman_collection.json` live in nimbus-backend (source of truth for endpoints), but nothing automatically delivers contract diffs to frontend consumers — handoffs restate the contract in prose. Until that's fixed, verify field shapes against the actual `openapi.yaml` in nimbus-backend rather than relying solely on briefs.

## Reading order

1. [[2026-07-09-streaming-api]]
2. [[2026-07-09-handoff-nimbus-ai-engine]]

## Next actions

- Wire the console chat tester to `GET /conversations/{id}/stream?text=<message>` with EventSource, appending `token` event text into the message bubble
- On `done`, replace the accumulated token buffer with `done.text` (authoritative full reply) and treat the stream as closed — no timeout logic needed
- Handle `event: error` by surfacing the error text in the tester UI, then still finalize on the trailing `done` with partial text
- Switch on known event types (`token`, `done`, `error`) and silently ignore unknown ones — `tool_call` is coming later
- Cross-check field names and shapes against `openapi.yaml` / the "Stream reply (SSE)" Postman request in nimbus-backend before coding, since contract diffs don't auto-propagate to frontend
- Decide whether the tester needs idle-connection handling now, given the 15s `: ping` keep-alive is not yet implemented

---
_Consume with:_ `npx -y loredex@latest handoffs --consume <this note's name>`
