---
project: nimbus-ai-engine
topic: handoffs
type: handoff
date: '2026-07-09'
from_project: nimbus-frontend
to_project: nimbus-ai-engine
objective: >-
  REQUEST: extend agent-config schema with tone + escalation_rules for the
  builder UI
status: consumed
source: loredex
loredex: routed
---
# Handoff — nimbus-frontend → nimbus-ai-engine

**Objective:** REQUEST: extend agent-config schema with tone + escalation_rules for the builder UI

This vault slice is a formal request from nimbus-frontend to nimbus-ai-engine (the agent-config schema owner) for schema v2: two new customer-facing fields needed by the agent builder UI's new "Personality & Safety" card. Nothing is delivered yet — `2026-07-09-schema-v2-request` is the spec of what frontend needs, and builder UI work is blocked on the engine publishing the schema and validation. The requested deadline is 2026-07-16 to keep the builder screens on next sprint's schedule.

Field semantics you must honor: (1) `tone` — a **closed** string enum `[formal, friendly, playful]` with `default: friendly`. The closed enum is load-bearing: the UI renders a three-option segmented control with a live preview per option; free text breaks that. The default is required so existing v1 configs stay valid with no migration writes. (2) `escalation_rules` — an **ordered** array of flat `{condition, action}` objects, `condition` an opaque string for now (e.g. `"sentiment < -0.5"`), `action` a closed enum `[handoff_to_human, tag_conversation, notify_owner]`. First matching rule wins — frontend explicitly asks you to confirm the engine evaluates in array order. Empty array must validate (meaning: never escalate). Gotcha: keep the rule objects flat — any extra nesting forces a mapping layer in the UI, whose row component maps 1:1 to `{condition, action}`. If a condition grammar exists or is planned, share the vocabulary so the UI can offer a dropdown instead of raw text.

What frontend needs back: the published v2 schema (JSON Schema or your canonical format), confirmation of enum values / defaults / evaluation order, and a heads-up to nimbus-backend that `PUT /agents/{id}/config` validation must accept the new fields (openapi.yaml stays backend's source of truth; this request doesn't change it directly). The other two notes in scope (`2026-07-09-handoff-nimbus-backend`, `2026-07-09-streaming-ui`) are a separate, already-completed workstream — SSE streaming consumption in the console chat tester — useful only as context on how the console integrates with engine/backend contracts, not part of this request.

## Reading order

1. [[2026-07-09-schema-v2-request]]
2. [[2026-07-09-streaming-ui]]
3. [[2026-07-09-handoff-nimbus-backend]]

## Next actions

- nimbus-ai-engine: draft and publish agent-config schema v2 with `tone` (closed enum [formal, friendly, playful], default friendly) and `escalation_rules` (ordered array of flat {condition, action})
- Confirm to frontend: enum values, defaults, and that escalation_rules evaluate in array order with first-match-wins; confirm empty array = never escalate
- Decide and communicate the `condition` story: opaque string for v2, or share the condition grammar/vocabulary so the builder UI can render a known-conditions dropdown
- Notify nimbus-backend that PUT /agents/{id}/config validation must accept the two new fields and update openapi.yaml on their side
- Verify v1 configs validate unchanged against v2 (default-based backward compatibility, no migration writes)
- Reply to nimbus-frontend by 2026-07-16 to keep builder UI on next sprint's schedule

---
_Consume with:_ `npx -y loredex@latest handoffs --consume <this note's name>`
