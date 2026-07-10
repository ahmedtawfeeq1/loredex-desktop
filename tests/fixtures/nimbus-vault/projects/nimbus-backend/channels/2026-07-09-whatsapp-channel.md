---
project: nimbus-backend
topic: channels
type: note
date: '2026-07-09'
tags:
  - whatsapp
  - channels
  - webhooks
  - escalation
  - mobile
  - api-contract
source: claude-code
loredex: routed
source_path: >-
  /Users/dana/dev/nimbus/nimbus-backend/docs/whatsapp-channel.md
source_project: nimbus-backend
source_rel: docs/whatsapp-channel.md
---

# WhatsApp channel — webhook flow, conversation mapping, escalation events

Decision record for wiring WhatsApp (Meta Cloud API) as Nimbus's first
messaging channel. Implemented in `src/channels/whatsapp.ts`, contract in
`openapi.yaml` + `postman_collection.json` (nimbus-backend is the source of
truth for both). Commit `839fd5d`.

## Webhook flow

1. **Verify handshake** — `GET /channels/whatsapp/webhook`. Meta calls once
   at registration with `hub.mode=subscribe`, `hub.verify_token`,
   `hub.challenge`. We echo `hub.challenge` (200) iff the token matches
   `WHATSAPP_VERIFY_TOKEN`, else 403.
2. **Inbound message** — `POST /channels/whatsapp/webhook`. Raw Meta payload
   → normalize → dispatch to engine → outbound reply via Graph API
   (`graph.facebook.com/v20.0/{PHONE_NUMBER_ID}/messages`). We always ack
   200 fast; Meta retries aggressively on non-2xx, so processing must be
   async in the real implementation.
3. **Attach channel** — `POST /agents/{id}/channels` with
   `{ channel: "whatsapp", phoneNumberId }` binds a Meta phone number to an
   agent. `phoneNumberId` is a reference, never a secret.

## Message mapping to the conversation model

- `conversationId = wa:<waId>` — deterministic, so one WhatsApp contact maps
  to exactly one Nimbus conversation across sessions.
- Normalized inbound shape: `{ conversationId, channel: "whatsapp", from
  (E.164), text, timestamp, raw }`. `raw` keeps the original Meta payload
  for audit/debug.
- Non-text payloads (status updates, media for now) are acked and skipped.
- Outbound replies reuse the same conversation; mobile/frontend can render a
  WhatsApp conversation with the exact same message list they already use.

## Escalation events (human-takeover) — MOBILE, read this

When the engine signals that a human must take over (or the customer asks
for one), the backend emits:

```json
{
  "type": "human-takeover",
  "conversationId": "wa:15551234567",
  "channel": "whatsapp",
  "reason": "agent-requested | customer-requested | policy",
  "lastMessageText": "I want to talk to a human",
  "timestamp": "2026-07-09T14:00:00Z"
}
```

- On escalation the agent reply is **suppressed** — the conversation is
  waiting on a human. The business owner must be pushed a notification
  (FCM) so they can open the conversation in the Android app and reply.
- Mobile needs: (a) push notification per `human-takeover` event carrying
  `conversationId` + `reason` + `lastMessageText` as preview, (b) a
  conversation list badge for escalated-and-unanswered conversations,
  (c) deep link from the notification into the conversation.
- Delivery transport for the event feed (poll vs push-only vs SSE reuse) is
  an open decision; the event **shape** above is settled.

## Operational config (deliberately NOT in this vault)

`WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`
come from env / secret manager. The Meta App dashboard (app id, webhook
subscription, permanent-token rotation) is per-environment operational
knowledge — the vault documents *which* secrets exist and where they live,
never values. A per-channel setup checklist belongs alongside this note as
follow-up.

## Related

- [[2026-07-09-streaming-api]] — SSE streaming (same conversation model).
- Ownership: endpoint changes travel from nimbus-backend outward; other
  teams consume openapi.yaml/Postman, never edit them.
