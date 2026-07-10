---
project: nimbus-backend
topic: handoffs
type: handoff
date: '2026-07-09'
from_project: nimbus-mobile
to_project: nimbus-backend
objective: >-
  Answer mobile's open questions on the WhatsApp escalation push: FCM payload
  contract, device-token registration endpoint, feed transport decision, and the
  per-channel setup checklist — expected to land as openapi.yaml updates
status: consumed
source: loredex
loredex: routed
consumed_by: Machine Two <machine2@nimbus.dev>
consumed_at: '2026-07-09T22:49:49.812Z'
loredex_schema: 1
---
# Handoff — nimbus-mobile → nimbus-backend

**Objective:** Answer mobile's open questions on the WhatsApp escalation push: FCM payload contract, device-token registration endpoint, feed transport decision, and the per-channel setup checklist — expected to land as openapi.yaml updates

This body of work is the mobile side's first consumption of the nimbus-backend WhatsApp handoff. In commit `5fcef33` (`lib/channels.dart`), mobile built two surfaces: **WhatsAppConversationTile**, a conversation-list tile keyed on the deterministic `wa:<waId>` conversationId from the backend contract, and an **escalation notification stub** that currently has no real push behind it. The single active note, 2026-07-09-mobile-channel-notes, records what was built and — critically for you — enumerates the open questions mobile is blocked on.

Current state: mobile has committed to the `wa:<waId>` conversationId as the join key between the conversation list and any push it receives, so whatever FCM payload you define must carry that exact identifier for the tile to deep-link correctly. The escalation path is stubbed end-to-end on the client; nothing ships until backend answers four things: (1) the FCM payload contract for the escalation push (field names, data-vs-notification message shape, escalation reason semantics), (2) the device-token registration endpoint (how mobile hands you FCM tokens, refresh/invalidation semantics, platform field), (3) the feed transport decision (does the conversation feed poll REST, or move to SSE/WebSocket — this changes what the push needs to carry), and (4) the per-channel setup checklist so additional channels beyond WhatsApp onboard the same way.

For the nimbus-backend team the deliverable shape is already agreed: answers land as openapi.yaml updates, not prose. The main gotcha is the deterministic conversationId — mobile derives UI state from `wa:<waId>` strings, so any payload or endpoint that identifies conversations differently (raw waId, internal UUID) will break the tile keying. Treat 2026-07-09-mobile-channel-notes as the requirements list; the original 2026-07-09-handoff-nimbus-backend handoff (referenced in the note) is the contract baseline being extended.

## Reading order

1. [[2026-07-09-mobile-channel-notes]]

## Next actions

- Define the FCM escalation-push payload schema (data message carrying conversationId in `wa:<waId>` form, escalation reason, message ref) as a component in openapi.yaml
- Spec the device-token registration endpoint in openapi.yaml — token, platform, upsert/refresh and invalidation semantics
- Make and record the feed transport decision (REST polling vs SSE/WebSocket) since it determines how much payload the push must carry vs a fetch-on-tap pointer
- Write the per-channel setup checklist (WhatsApp as the template: credentials, webhook, conversationId scheme, push wiring) so new channels follow the same contract
- Publish the updated openapi.yaml back to mobile as a handoff explicitly answering the four open questions in 2026-07-09-mobile-channel-notes

---
_Consume with:_ `npx -y loredex@latest handoffs --consume <this note's name>`
