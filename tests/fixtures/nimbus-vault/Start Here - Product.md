---
type: brief
date: '2026-07-09'
loredex: brief
---
# Start here — Product

**Objective:** Derived: ship Nimbus — a multi-channel AI customer-agent platform (streaming agent runtime, configurable agents, WhatsApp channel, web console builder, Android escalation surface) — with the four repos coordinating through one shared loredex vault via handoffs.

**Nimbus** is a customer-facing AI agent product built across four repos: `nimbus-ai-engine` (the agent runtime and agent-config schema owner), `nimbus-backend` (public API, channel integrations, and the openapi.yaml/Postman contract), `nimbus-frontend` (web console with a chat tester and agent builder UI), and `nimbus-mobile` (Android app surfacing conversations and escalation notifications). All four file decisions and handoffs into one shared loredex vault, which is itself being dogfooded as the coordination layer.

Three feature threads are in flight, all active today (2026-07-09). **Token streaming** is complete end-to-end: the engine's `run_stream()` generator (`2026-07-09-streaming-design`) is exposed by backend as an SSE endpoint (`2026-07-09-streaming-api`) and consumed by the console's `useStreamingReply()` hook (`2026-07-09-streaming-ui`). **Agent-config schema v2** (tone + escalation_rules) went request → engine contract → public API in one day and now sits with frontend as an open handoff to build the builder UI. **WhatsApp** — Nimbus's first messaging channel — is live in backend (`2026-07-09-whatsapp-channel`); mobile built its first consumption of it (`2026-07-09-mobile-channel-notes`) and has bounced an open handoff back to backend with concrete API questions (FCM payload, device-token registration, feed transport).

The flow state is healthy but front-loaded: five handoffs were consumed same-day, and the two remaining open handoffs (backend→frontend builder UI; mobile→backend WhatsApp push questions) are the product's critical path. Notably, no project has a Start Here brief yet, which matters because the mobile findings note describes an imminent rollout of this vault to ~12 engineers — the material exists but the entry points don't.

## Where each project stands

- **nimbus-ai-engine** — Runtime work is done and published: run_stream() streaming generator shipped and handed off, and agent-config schema v2 (tone + escalation_rules) is the published canonical contract with no open inbound handoffs. _Next: Write the project's Start Here brief anchoring 2026-07-09-agent-config-v2 and 2026-07-09-streaming-design as the canonical entry points, since the engine is upstream schema owner for everything else._
- **nimbus-backend** — The busiest hub: SSE streaming endpoint, agents API v2, and the WhatsApp channel are all live in openapi.yaml/Postman, with one open inbound handoff from mobile. _Next: Answer mobile's open handoff — FCM payload contract, device-token registration endpoint, feed transport decision, per-channel setup checklist — as openapi.yaml updates._
- **nimbus-frontend** — Console streaming UI (useStreamingReply) is shipped and its schema-v2 request was fulfilled upstream; the builder UI for tone + escalation_rules is now its open inbound handoff. _Next: Build the agent builder screens against the agents API v2 fields and consume the open backend→frontend handoff._
- **nimbus-mobile** — First WhatsApp channel surface is built in lib/channels.dart from the backend handoff, but push/escalation work is blocked on open questions sent back to backend. _Next: Consume backend's openapi.yaml answers when the open handoff closes, then implement FCM escalation push and device-token registration against the answered contract._

## Reading order for the full picture

1. [[2026-07-09-streaming-design]] (nimbus-ai-engine)
2. [[2026-07-09-streaming-api]] (nimbus-backend)
3. [[2026-07-09-streaming-ui]] (nimbus-frontend)
4. [[2026-07-09-schema-v2-request]] (nimbus-frontend)
5. [[2026-07-09-agent-config-v2]] (nimbus-ai-engine)
6. [[2026-07-09-agents-api-v2]] (nimbus-backend)
7. [[2026-07-09-whatsapp-channel]] (nimbus-backend)
8. [[2026-07-09-mobile-channel-notes]] (nimbus-mobile)
9. [[2026-07-09-findings]] (nimbus-mobile)

## Risks and contradictions (review — not auto-applied)

- Two projects claim contract ownership in different places: nimbus-ai-engine's 2026-07-09-agent-config-v2 declares the engine 'the schema owner' and that note 'the published v2 contract', while nimbus-backend's 2026-07-09-agents-api-v2 and 2026-07-09-whatsapp-channel call openapi.yaml + Postman 'backend's source of truth' for the contract. — [[nimbus-ai-engine/2026-07-09-agent-config-v2]], [[nimbus-backend/2026-07-09-agents-api-v2]], [[nimbus-backend/2026-07-09-whatsapp-channel]]
- Escalation semantics span three projects without a single defining note: engine implements check_escalation from escalation_rules, backend emits WhatsApp escalation events, and mobile plans escalation push notifications — the FCM payload and feed transport for those events are still open questions, so mobile could build against assumptions that drift from backend's event shape. — [[nimbus-ai-engine/2026-07-09-agent-config-v2]], [[nimbus-backend/2026-07-09-whatsapp-channel]], [[nimbus-mobile/2026-07-09-mobile-channel-notes]], [[nimbus-backend/2026-07-09-handoff-nimbus-mobile]]
- No project has a Start Here brief, while nimbus-mobile's dogfooding findings describe judging onboarding for a rollout to ~12 engineers — new joiners currently have no entry point into any of the four projects' vault slices. — [[nimbus-mobile/2026-07-09-findings]]

## Duplicate coverage across projects

- The streaming design and its SSE contract are restated across the engine design note, the engine→backend handoff, the backend decision note, the backend→frontend handoff, and the frontend UI note — five notes carry overlapping chunk/endpoint details that could drift. — [[nimbus-ai-engine/2026-07-09-streaming-design]], [[nimbus-backend/2026-07-09-handoff-nimbus-ai-engine]], [[nimbus-backend/2026-07-09-streaming-api]], [[nimbus-frontend/2026-07-09-handoff-nimbus-backend]], [[nimbus-frontend/2026-07-09-streaming-ui]]
- The agent-config v2 fields (tone + escalation_rules) are described in the frontend request, the engine's canonical contract note, the engine→backend handoff, the backend API note, and the backend→frontend handoff — the field definitions appear in at least five places. — [[nimbus-frontend/2026-07-09-schema-v2-request]], [[nimbus-ai-engine/2026-07-09-agent-config-v2]], [[nimbus-backend/2026-07-09-handoff-nimbus-ai-engine-2]], [[nimbus-backend/2026-07-09-agents-api-v2]], [[nimbus-frontend/2026-07-09-handoff-nimbus-backend-2]]
- WhatsApp channel mechanics (webhook flow, conversation mapping, escalation events) appear in backend's decision note, the backend→mobile handoff, and mobile's channel notes. — [[nimbus-backend/2026-07-09-whatsapp-channel]], [[nimbus-mobile/2026-07-09-handoff-nimbus-backend]], [[nimbus-mobile/2026-07-09-mobile-channel-notes]]

## Product next actions

- Backend closes the open nimbus-mobile handoff: publish the FCM payload contract, device-token registration endpoint, feed transport decision, and per-channel setup checklist as openapi.yaml updates.
- Frontend consumes the open backend handoff and builds the agent builder UI for tone + escalation_rules — the last unshipped leg of the schema-v2 chain.
- Resolve the contract-ownership ambiguity: record explicitly that the engine owns the agent-config schema while backend's openapi.yaml/Postman owns the public API surface, and cross-link the two canonical notes.
- Write a Start Here brief for each of the four projects before the ~12-engineer rollout described in nimbus-mobile's dogfooding findings.
- Define escalation event semantics end-to-end in one note (engine check_escalation → backend WhatsApp escalation events → mobile push) so mobile isn't building against assumptions.
- Decide the mobile feed transport (reuse SSE vs. push/poll) and record it as a decision note rather than leaving it inside the open handoff.

---

## Projects

| Project | Notes | Last activity | Active topics | Stale | Brief |
|---|---|---|---|---|---|
| [[nimbus-ai-engine]] | 4 | 2026-07-09 | agent-config, dogfooding, handoffs, streaming | 0 | none |
| [[nimbus-backend]] | 7 | 2026-07-09 | agent-config, channels, handoffs, streaming | 0 | none |
| [[nimbus-frontend]] | 4 | 2026-07-09 | agent-config, handoffs, streaming | 0 | none |
| [[nimbus-mobile]] | 3 | 2026-07-09 | channels, handoffs, loredex-dogfooding-findings | 0 | none |

## Flow — handoffs between teams

| Open | From → To | Objective | Age |
|---|---|---|---|
| [[2026-07-09-handoff-nimbus-mobile]] | nimbus-mobile → nimbus-backend | Answer mobile's open questions on the WhatsApp escalation push: FCM payload contract, device-token registration endpoint, feed transport decision, and the per-channel setup checklist — expected to land as openapi.yaml updates | 0d |
| [[2026-07-09-handoff-nimbus-backend-2]] | nimbus-backend → nimbus-frontend | agent-config v2 fields live in the API — build the builder UI | 0d |

Recently consumed:
- [[2026-07-09-handoff-nimbus-frontend]] (nimbus-frontend → nimbus-ai-engine, 2026-07-09)
- [[2026-07-09-handoff-nimbus-ai-engine-2]] (nimbus-ai-engine → nimbus-backend, 2026-07-09)
- [[2026-07-09-handoff-nimbus-ai-engine]] (nimbus-ai-engine → nimbus-backend, 2026-07-09)
- [[2026-07-09-handoff-nimbus-backend]] (nimbus-backend → nimbus-frontend, 2026-07-09)
- [[2026-07-09-handoff-nimbus-backend]] (nimbus-backend → nimbus-mobile, 2026-07-09)

## Cross-project references

- nimbus-frontend → nimbus-backend: 7 link(s)
- nimbus-ai-engine → nimbus-frontend: 2 link(s)
- nimbus-backend → nimbus-ai-engine: 2 link(s)
- nimbus-ai-engine → nimbus-mobile: 1 link(s)
- nimbus-backend → nimbus-mobile: 1 link(s)
- nimbus-frontend → nimbus-mobile: 1 link(s)
- nimbus-mobile → nimbus-backend: 1 link(s)

_Dashboard generated 2026-07-09 by `loredex curate --product`._
