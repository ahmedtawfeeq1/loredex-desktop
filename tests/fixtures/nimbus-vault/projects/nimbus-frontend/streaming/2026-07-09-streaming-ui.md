---
project: nimbus-frontend
topic: streaming
type: finding
date: '2026-07-09'
tags:
  - streaming
  - sse
  - console
  - ux
source: claude-code
loredex: routed
source_path: >-
  /Users/dana/dev/nimbus/nimbus-frontend/docs/streaming-ui.md
source_project: nimbus-frontend
source_rel: docs/streaming-ui.md
---

# Console streaming UI — useStreamingReply()

## What the hook does

`useStreamingReply()` (in `src/App.tsx`, commit `eb6cccd`) wires the console
chat tester to the backend's SSE endpoint
`GET /conversations/{id}/stream?text=<message>` (nimbus-backend commit
`f3a398e`). It opens a plain `EventSource` and exposes
`{ text, streaming, error, send }`:

- `token` events append incremental text to `text`.
- The single terminal `done` event **replaces** the concatenated buffer with
  its authoritative full reply, flips `streaming` to false, and closes the
  stream — `done` is the only close signal, so no timeout logic exists.
- `event: error` surfaces the error text but keeps listening: per the
  contract, a trailing `done` with the partial text still finalizes the
  stream.
- Unknown event types (the engine's upcoming `tool_call`) are ignored by
  construction, since `EventSource` only dispatches listened-for events.

## UX finding: "agent is typing" needs a first-token signal

The gap between `send()` and the first `token` event is dead air in the UI.
The hook exposes `streaming && text === ''` as the "agent is typing" window,
but that state begins at request time, not when the agent actually starts
generating. Because flush cadence (~40ms/~24 chars) is explicitly best-effort
and keep-alive pings are not yet implemented, a slow or stalled upstream is
indistinguishable from a long think. Recommendation for backend: emit an
initial zero-length `token` (or a dedicated `start` event) as soon as the
engine begins, so the console (and later WhatsApp/Messenger typing
indicators) can distinguish "queued" from "generating" from "stalled".
