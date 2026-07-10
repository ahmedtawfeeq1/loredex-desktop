---
project: nimbus-frontend
topic: agent-config
type: note
date: '2026-07-09'
tags:
  - request
  - agent-config
  - schema-v2
  - builder-ui
  - tone
  - escalation
source: claude-code
loredex: routed
source_path: >-
  /Users/dana/dev/nimbus/nimbus-frontend/docs/schema-v2-request.md
source_project: nimbus-frontend
source_rel: docs/schema-v2-request.md
---

# REQUEST: agent-config schema v2 — tone + escalation_rules

**This is a request to nimbus-ai-engine (schema owner), not delivered work.**
The agent builder UI in the web console needs two new customer-facing fields
in the agent-config schema. Frontend cannot ship the builder screens until the
schema (and validation) exists on the engine side.

## Requested fields

### 1. `tone` — enum

```yaml
tone:
  type: string
  enum: [formal, friendly, playful]
  default: friendly
```

- Must be a **closed enum**, not free text. The builder UI renders it as a
  three-option segmented control with a live preview bubble per option; free
  text would force us into a textarea and kill the preview.
- A `default` is required so existing v1 configs stay valid without migration
  writes — the UI shows the default pre-selected for legacy agents.

### 2. `escalation_rules` — ordered array of {condition, action}

```yaml
escalation_rules:
  type: array
  items:
    type: object
    required: [condition, action]
    properties:
      condition:
        type: string   # e.g. "sentiment < -0.5", "user_asks_for_human", "topic == refunds"
      action:
        type: string
        enum: [handoff_to_human, tag_conversation, notify_owner]
```

- **Ordered** array: the builder UI is a drag-to-reorder rule list; first
  matching rule wins. Please confirm the engine evaluates in array order.
- `condition`: we can live with an opaque string in v2, but if the engine has
  (or plans) a condition grammar, tell us the vocabulary so the UI can offer
  a dropdown-of-known-conditions instead of a raw text input.
- `action` as a closed enum for the same segmented-control reason as tone.
- Empty array must be valid (= never escalate).

## UI mockup reasoning

The builder page adds a "Personality & Safety" card:

- Tone: segmented control (Formal | Friendly | Playful) with a sample agent
  reply re-rendered under each selection.
- Escalation: repeating row component `[condition input] -> [action select]`
  with add/remove/reorder. Row shape maps 1:1 to `{condition, action}` — any
  extra nesting in the schema means a mapping layer on our side, so please
  keep the objects flat.

## What we need back

1. Schema v2 published (JSON Schema or the engine's canonical format) with
   the two fields above.
2. Confirmation of enum values, defaults, and rule-evaluation order.
3. Note for nimbus-backend: `PUT /agents/{id}/config` validation must accept
   the new fields (openapi.yaml is backend's source of truth; this request
   does not change it directly).

Blocking: builder UI work is scheduled next sprint; anything by 2026-07-16
keeps us on track.
