---
project: nimbus-backend
topic: handoffs
type: handoff
date: '2026-07-09'
from_project: nimbus-ai-engine
to_project: nimbus-backend
objective: >-
  Expose agent-config v2 fields (tone, escalation_rules) through the agents API
  + contract
status: consumed
source: loredex
loredex: routed
---
# Handoff — nimbus-ai-engine → nimbus-backend

**Objective:** Expose agent-config v2 fields (tone, escalation_rules) through the agents API + contract

The engine-side work for agent-config schema v2 is **done and published**: `2026-07-09-agent-config-v2` is the canonical v2 contract, implemented in `src/engine.py` (`normalize_config`, `AgentEngine.check_escalation`). V2 is a strict superset of v1 adding two fields: `tone` (string, **closed** enum `[formal, friendly, playful]`, default `friendly`) and `escalation_rules` (**ordered** array, default `[]`, empty = never escalate). Each rule is a flat `{condition, action}` object with `additionalProperties: false` — extra keys or nesting must be a validation error. `action` is a closed enum `[handoff_to_human, tag_conversation, notify_owner]`; `condition` is an **opaque string in v2** (no grammar yet — a condition vocabulary is planned as a v2.1 note, so do not validate its content).

The blocking dependency is squarely on nimbus-backend: `PUT /agents/{id}/config` and `GET` must accept, return, and validate the two new fields per the schema, and `openapi.yaml` plus the Postman collection (backend's source of truth for the API contract) must be updated — the engine note explicitly does not make that edit, backend owns it. Until this ships, nimbus-frontend's builder UI remains blocked even though the schema work is complete.

Semantics backend must preserve: rules evaluate in **array order, first match wins** — so the API must round-trip `escalation_rules` order exactly. V1 configs validate unchanged; defaults (`tone: friendly`, `escalation_rules: []`) are applied at load time by `normalize_config`, so **no migration writes** are needed and stored configs don't change. Backend should mirror this: return defaults on GET rather than requiring clients to send the new fields. The originating requirements come from `2026-07-09-schema-v2-request` (nimbus-frontend); the contract note confirms every item frontend asked for, so treat the contract note as authoritative.

Note: only these two notes are in the digest scope, so reading order and clusters are necessarily short.

## Reading order

1. [[2026-07-09-agent-config-v2]]

## Next actions

- Update openapi.yaml and the Postman collection to add tone and escalation_rules to the agent-config payload of PUT/GET /agents/{id}/config, with the exact enums and defaults from the v2 contract note
- Implement request validation in the agents API: closed enums for tone and action, flat rule objects (reject extra keys/nesting), condition as free string — do not validate its content in v2
- Preserve escalation_rules array order on write and read (evaluation is array order, first match wins)
- Apply v1 compatibility server-side: accept v1 payloads unchanged and return tone: friendly + escalation_rules: [] as defaults on GET — no migration writes to stored configs
- Add contract tests: v1 config round-trip, empty escalation_rules, nested/extra-key rule rejected, enum violations rejected
- Watch for the planned schema v2.1 condition-vocabulary note before adding any condition parsing or dropdown support

---
_Consume with:_ `npx -y loredex@latest handoffs --consume <this note's name>`
