---
project: nimbus-mobile
topic: channels
type: finding
date: '2026-07-09'
tags:
  - whatsapp
  - channels
  - escalation
  - fcm
  - push
  - api-contract
source: claude-code
loredex: routed
source_path: >-
  /Users/dana/dev/nimbus/nimbus-mobile/docs/mobile-channel-notes.md
source_project: nimbus-mobile
source_rel: docs/mobile-channel-notes.md
---

# Mobile WhatsApp channel surface — what we built, and open questions for backend

First mobile consumption of the nimbus-backend WhatsApp handoff
(2026-07-09-handoff-nimbus-backend, consumed 2026-07-09). Implemented in
`lib/channels.dart` (commit `5fcef33`).

## What we built

- **WhatsAppConversationTile** — conversation-list tile keyed on the
  deterministic `wa:<waId>` conversationId. Carries the
  escalated-and-unanswered badge state ("NEEDS HUMAN") and the deep-link
  target `nimbus://conversation/<conversationId>` used by both tile tap and
  notification tap.
- **HumanTakeoverEvent** — parser for the settled escalation event shape
  `{ type: "human-takeover", conversationId, channel, reason,
  lastMessageText, timestamp }` with a strict reason enum
  (agent-requested | customer-requested | policy).
- **EscalationNotification** (stub) — FCM notification model:
  `lastMessageText` as preview, deep link into the conversation, and a
  placeholder data-only payload mirroring the event fields.

Deliberately NOT built, per the handoff: media rendering (backend acks and
skips non-text payloads), and any transport binding (poll vs push vs SSE is
flagged open — everything is built against the event shape only).

## OPEN QUESTIONS for nimbus-backend

1. **FCM push payload contract is undefined.** The human-takeover *event*
   shape is settled, but the actual FCM message is not: data-only vs
   notification message, exact key names, collapse/dedup key for repeated
   escalations on one conversation, and TTL. Our `toFcmData()` is a guess.
2. **Who sends the push, and how does mobile register device tokens?**
   `openapi.yaml` has no device-token registration endpoint (e.g.
   `POST /devices/token`). If backend owns FCM sending, mobile needs that
   endpoint added to the contract; if not, we need to know who does.
3. **Escalation feed transport** — the handoff flags poll vs push-only vs
   SSE reuse as an open decision. Mobile's preference: push (FCM data
   message) as the wake-up + a fetch-on-open reconcile endpoint (e.g.
   `GET /conversations?escalated=true`) so the badge state survives missed
   pushes. Does that endpoint exist or need adding to openapi.yaml?
4. **Per-channel setup checklist** (flagged as backend follow-up) — still
   needed before mobile can run any end-to-end test against a real
   WhatsApp sandbox number.

## Contract touchpoint

All four questions end in changes to `openapi.yaml` /
`postman_collection.json`, which nimbus-backend owns. Mobile will consume,
not edit — we need the answers to travel back as an updated contract plus a
note, ideally as a handoff addressed to nimbus-mobile.
