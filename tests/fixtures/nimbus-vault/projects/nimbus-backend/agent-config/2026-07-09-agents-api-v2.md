---
project: nimbus-backend
topic: agent-config
type: note
date: '2026-07-09'
tags:
  - agent-config
  - api-contract
  - openapi
  - postman
  - schema-v2
source: claude-code
loredex: routed
source_path: >-
  /Users/dana/dev/nimbus/nimbus-backend/docs/agents-api-v2.md
source_project: nimbus-backend
source_rel: docs/agents-api-v2.md
---

# Agents API v2 — tone + escalation_rules are live in the contract

**Decision:** the agent-config schema v2 fields from ai-engine's canonical
contract note (`2026-07-09-agent-config-v2`) are now exposed through the
public API. `openapi.yaml` and the Postman collection (backend's source of
truth for the contract) were updated in backend commit `97d4b73`. This closes
the chain that started with nimbus-frontend's original request
(`2026-07-09-schema-v2-request`) and travelled via ai-engine's schema work
and the handoff `2026-07-09-handoff-nimbus-ai-engine-2`. **Frontend's builder
UI is unblocked.**

## What the API now accepts and returns

- `GET /agents/{id}/config` and `PUT /agents/{id}/config` carry the full v2
  config, defined as `components/schemas/AgentConfig` in `openapi.yaml`.
- `tone`: string, closed enum `[formal, friendly, playful]`, default
  `friendly`.
- `escalation_rules`: ordered array of flat `{condition, action}` objects
  (`components/schemas/EscalationRule`), default `[]` (empty = never
  escalate). `action` is a closed enum `[handoff_to_human, tag_conversation,
  notify_owner]`; `condition` is an opaque string in v2 — the API does NOT
  validate its content (a v2.1 condition-vocabulary note is planned; no
  dropdowns or parsing until it lands).
- **Order is contract:** rules evaluate in array order, first match wins.
  The API round-trips `escalation_rules` order exactly.
- Validation on PUT/POST: enum violations and extra or nested keys inside a
  rule object are rejected with 422 (`additionalProperties: false`).
- **v1 compatibility:** v1 payloads (both fields absent) validate unchanged.
  GET always returns `tone` and `escalation_rules` with defaults applied at
  read time — clients never need to handle missing fields, and no migration
  writes touch stored configs.
- `POST /agents` (Create agent) accepts the same `AgentConfig` body; the
  Postman collection has example bodies for Create agent, Get agent config,
  and Update agent config.

## Guidance for the frontend builder UI

- Render `tone` as a three-option select defaulting to `friendly`.
- Render `escalation_rules` as an orderable list (drag-to-reorder matters —
  order is semantic, first match wins); `condition` is a free-text input in
  v2, `action` a three-option select.
- Trust GET to always include both fields; send only what the user set —
  omitting them is valid.

## Ownership

`openapi.yaml` + `postman_collection.json` live in nimbus-backend and only
backend edits them; other teams request changes via handoff (this is the
third contract mutation today, after SSE streaming and the WhatsApp channel).
