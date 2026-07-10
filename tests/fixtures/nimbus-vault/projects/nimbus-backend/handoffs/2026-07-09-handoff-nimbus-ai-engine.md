---
project: nimbus-backend
topic: handoffs
type: handoff
date: '2026-07-09'
from_project: nimbus-ai-engine
to_project: nimbus-backend
objective: >-
  Expose streaming replies over the public API (SSE) and update the API contract
  accordingly
status: consumed
source: loredex
loredex: routed
---
# Handoff — nimbus-ai-engine → nimbus-backend

**Objective:** Expose streaming replies over the public API (SSE) and update the API contract accordingly

This body of work covers token streaming in the nimbus-ai-engine agent runtime. Its core artifact is a single active design note, `2026-07-09-streaming-design`, which records the decision to add a `run_stream(message)` generator to `AgentEngine` alongside the existing blocking `run()`. The motivation is channel UX: WhatsApp, Messenger, Instagram, and TikTok need typing indicators and partial replies, which a blocking string return cannot drive. The implementation already exists in the repo (`run_stream()` landed in commit 76a67f0).

For the backend team, the key interface facts are in the note's "Chunk event shape" and "Flush cadence" sections. Every streamed event is a small dict with a `type` discriminator: `{"type": "token", "text": "partial "}` for incremental text, and a terminal `{"type": "done", "text": "<full reply>"}` event carrying the complete reply. That means consumers can either accumulate `token` events or simply take the `done` payload — but should treat `done` as the authoritative full text, not the concatenation. The note also has a dedicated "How backend should consume it" section, which is the closest thing to a consumption contract today and should be read before wiring anything.

Current state relative to the objective: the runtime side (generator + event shape) is designed and implemented, but nothing in the vault yet specifies the public SSE surface — no note defines the HTTP endpoint, the mapping from chunk dicts to SSE wire frames (`event:`/`data:` lines), error/heartbeat semantics, or the updated API contract document. The gap between "in-process generator" and "public SSE API" is the open work, and the note explicitly marks some of it out of scope. The backend team should treat the chunk event shape as the stable inner contract and drive the SSE wire-format and API-contract specification as the next deliverable.

## Reading order

1. [[2026-07-09-streaming-design]]

## Next actions

- Write an SSE endpoint spec note: route, method, auth, content-type text/event-stream, and how {type: token|done} chunk dicts map onto SSE event:/data: frames
- Update the public API contract document to add the streaming endpoint, including the done event carrying the full reply as the authoritative final text
- Define error and keep-alive semantics missing from the design note: an error event type, heartbeat/ping cadence for idle connections, and client reconnect/resume behavior
- Confirm flush cadence against real channel latency needs (typing indicators on WhatsApp/Messenger/Instagram/TikTok) and record the agreed cadence as a contract guarantee or explicitly best-effort
- Build a thin backend consumer prototype against run_stream() following the note's 'How backend should consume it' section, to validate the event shape before the SSE layer hardens
- File the items listed under the note's 'Out of scope' heading as explicit follow-up notes so they don't silently drop from the streaming workstream

---
_Consume with:_ `npx -y loredex@latest handoffs --consume <this note's name>`
