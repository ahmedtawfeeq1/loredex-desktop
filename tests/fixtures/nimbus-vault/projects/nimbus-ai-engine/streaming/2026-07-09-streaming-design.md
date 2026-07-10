---
project: nimbus-ai-engine
topic: streaming
type: note
date: '2026-07-09'
tags:
  - streaming
  - agent-runtime
  - api-contract
  - sse
source: claude-code-session
loredex: routed
source_path: >-
  /Users/dana/dev/nimbus/nimbus-ai-engine/docs/streaming-design.md
source_project: nimbus-ai-engine
source_rel: docs/streaming-design.md
---

# Token streaming in the agent runtime

## Decision

`AgentEngine` gains a `run_stream(message)` generator alongside the existing
blocking `run()`. Channels (WhatsApp, Messenger, Instagram, TikTok) need
typing indicators and partial replies; a blocking string can't drive those.

## Chunk event shape

Every event is a small dict:

```json
{"type": "token", "text": "partial "}
{"type": "done",  "text": "<full reply text>"}
```

- `token` events carry incremental text only (append-only; consumers never
  need to diff).
- Exactly one terminal `done` event carries the full assembled reply so
  consumers that missed chunks (or don't stream, e.g. WhatsApp which only
  supports typing indicators, not message edits) can use it verbatim.
- Future event types (`tool_call`, `error`) will reuse the same envelope, so
  consumers must ignore unknown `type` values.

## Flush cadence

- v1 implementation chunks per whitespace-delimited word — good enough to
  exercise the pipeline end to end.
- When wired to a real model stream, flush on whichever comes first:
  ~40ms elapsed or ~24 chars buffered. Keeps perceived latency low without
  flooding channel rate limits.
- `done` is always emitted, including after an upstream error (with the text
  accumulated so far), so downstream can rely on it as the close signal.

## How backend should consume it

- Treat `run_stream()` as an (async-wrappable) generator: iterate, forward
  each event, stop on `done`.
- Backend needs a streaming transport on the public API — SSE is the
  suggested fit (one-directional, plays well with the existing REST surface);
  websocket is acceptable if the console/mobile teams prefer it.
- This means an openapi.yaml change on the backend side: a new
  `text/event-stream` response (or a `stream=true` flag on the existing
  reply endpoint). Backend owns that contract; this note only fixes the
  engine-side event shape.

## Out of scope

- Backpressure/rate limiting per channel (backend concern).
- Tool-call streaming events (follow-up once `tool_call` lands in schema).
