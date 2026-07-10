---
project: nimbus-ai-engine
topic: agent-config
type: note
date: '2026-07-09'
tags:
  - agent-config
  - schema-v2
  - tone
  - escalation
  - contract
source: claude-code
loredex: routed
source_path: >-
  /Users/dana/dev/nimbus/nimbus-ai-engine/docs/agent-config-v2.md
source_project: nimbus-ai-engine
source_rel: docs/agent-config-v2.md
---

# Decision: agent-config schema v2 (tone + escalation_rules)

Implemented in `src/engine.py` (`normalize_config`, `AgentEngine.check_escalation`)
in response to nimbus-frontend's schema-v2 request (`2026-07-09-schema-v2-request`).
The engine is the schema owner; this note is the published v2 contract.

## Full v2 schema

Schema v2 is a strict superset of v1. Canonical form (JSON Schema semantics):

```yaml
agent_config:
  type: object
  required: [name]
  properties:
    # --- v1 fields, unchanged ---
    name:          { type: string }
    system_prompt: { type: string }
    tools:         { type: array, items: { type: string } }
    model:         { type: string }

    # --- v2 additions ---
    tone:
      type: string
      enum: [formal, friendly, playful]   # CLOSED enum — no free text
      default: friendly
    escalation_rules:
      type: array                          # ORDERED; empty array valid = never escalate
      default: []
      items:
        type: object
        required: [condition, action]
        additionalProperties: false        # flat {condition, action}, no nesting
        properties:
          condition: { type: string }      # opaque string in v2 (see condition story)
          action:
            type: string
            enum: [handoff_to_human, tag_conversation, notify_owner]
```

## Confirmations frontend asked for

- **Enum values / defaults**: exactly as requested. `tone` enum
  `[formal, friendly, playful]`, default `friendly`. `action` enum
  `[handoff_to_human, tag_conversation, notify_owner]`.
- **Evaluation order**: the engine evaluates `escalation_rules` in **array
  order, first match wins** (`AgentEngine.check_escalation`). Confirmed.
- **Empty array**: validates, means never escalate. Confirmed.
- **Flat rule objects**: enforced — `additionalProperties: false`; any extra
  keys or nesting is a validation error, so the builder UI row component maps
  1:1 with no mapping layer.
- **Condition story**: `condition` is an **opaque string in v2**. No condition
  grammar exists yet in the engine. When one lands (planned: comparison
  expressions over `sentiment`, `topic`, `user_asks_for_human`), we will
  publish the vocabulary as a schema v2.1 note so the UI can switch its
  condition input to a known-conditions dropdown. Ship v2 with a raw text
  input.

## Migration note (v1 compatibility)

v1 configs (`{name, system_prompt, tools, model}`) validate unchanged against
v2. `normalize_config` applies defaults at load time — `tone: friendly`,
`escalation_rules: []` — so **no migration writes** are needed and no stored
config has to change. Legacy agents behave exactly as before (friendly tone,
never escalate).

## Blocking dependency: backend API exposure

**nimbus-backend must expose these fields through the agents API before
frontend can use any of this.** Concretely:

- `PUT /agents/{id}/config` (and `GET`) must accept/return `tone` and
  `escalation_rules` and validate them per the schema above.
- `openapi.yaml` and the Postman collection (backend's source of truth for
  the API contract) must be updated to include the two fields — this note
  does not change them; backend owns that edit.

Until backend ships that, frontend's builder UI is still blocked even though
the engine-side schema work is done. Handoff to nimbus-backend filed
alongside this note.
