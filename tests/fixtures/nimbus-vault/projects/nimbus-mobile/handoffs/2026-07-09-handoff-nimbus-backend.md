---
project: nimbus-mobile
topic: handoffs
type: handoff
date: '2026-07-09'
from_project: nimbus-backend
to_project: nimbus-mobile
objective: Surface WhatsApp conversations and escalation notifications in the Android app
status: consumed
source: loredex
loredex: routed
---
# Handoff — nimbus-backend → nimbus-mobile

**Objective:** Surface WhatsApp conversations and escalation notifications in the Android app

This body of work is the backend side of Nimbus's first messaging channel: WhatsApp via the Meta Cloud API, implemented in `src/channels/whatsapp.ts` (commit `839fd5d`) with the contract published in `openapi.yaml` and `postman_collection.json` — nimbus-backend owns both; mobile consumes them and never edits them. The single active note, 2026-07-09-whatsapp-channel, is the decision record covering the webhook flow (verify handshake, inbound POST, agent attach via `POST /agents/{id}/channels` with `{ channel: "whatsapp", phoneNumberId }`), how WhatsApp messages map onto the existing conversation model, and the escalation event mobile must handle.

The key interface fact for mobile: `conversationId = wa:<waId>` is deterministic, so one WhatsApp contact is exactly one Nimbus conversation across sessions, and inbound messages are normalized to `{ conversationId, channel: "whatsapp", from (E.164), text, timestamp, raw }`. That means the Android app can render a WhatsApp conversation with the same message-list UI it already uses — no new message schema. Non-text payloads (status updates, media) are currently acked and skipped, so mobile should not expect media messages yet.

The escalation contract is the part built specifically for the mobile objective. On human-takeover the backend emits `{ type: "human-takeover", conversationId, channel, reason: "agent-requested" | "customer-requested" | "policy", lastMessageText, timestamp }` and suppresses the agent's reply — the conversation is blocked until a human answers. Mobile owes three things: an FCM push per event carrying `conversationId` + `reason` + `lastMessageText` as preview, a conversation-list badge for escalated-and-unanswered conversations, and a deep link from the notification into the conversation. Gotcha: the event shape is settled, but the delivery transport for the event feed (poll vs push-only vs SSE reuse) is still an open decision — build against the shape, not a transport assumption. Operational secrets (`WHATSAPP_VERIFY_TOKEN`, access token, phone number id) are deliberately kept out of the vault; the vault is currently a single-note corpus on this topic, so the reading order below is short by construction.

## Reading order

1. [[2026-07-09-whatsapp-channel]]

## Next actions

- Decide the escalation-event delivery transport (poll vs push-only vs reusing the existing SSE stream) with backend, since only the event shape is settled
- Build the FCM push pipeline: one notification per human-takeover event carrying conversationId, reason, and lastMessageText as the preview text
- Implement deep linking from the escalation notification into the target conversation, keyed by the deterministic wa:<waId> conversationId
- Add the conversation-list badge state for escalated-and-unanswered conversations (agent reply is suppressed until a human responds)
- Generate/verify the Android API client from nimbus-backend's openapi.yaml and postman_collection.json rather than hand-transcribing endpoints — backend is the sole source of truth for the contract
- Ask backend for the per-channel setup checklist flagged as follow-up (WhatsApp env/secret wiring), needed for any mobile-side end-to-end testing

---
_Consume with:_ `npx -y loredex@latest handoffs --consume <this note's name>`
