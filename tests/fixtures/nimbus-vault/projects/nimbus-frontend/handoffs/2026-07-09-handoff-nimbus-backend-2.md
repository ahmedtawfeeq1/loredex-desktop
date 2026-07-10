---
project: nimbus-frontend
topic: handoffs
type: handoff
date: '2026-07-09'
from_project: nimbus-backend
to_project: nimbus-frontend
objective: agent-config v2 fields live in the API — build the builder UI
status: consumed
source: loredex
loredex: routed
consumed_by: Dana Reyes <dana@nimbus.dev>
consumed_at: '2026-07-10T00:57:37.475Z'
loredex_schema: 1
---
# Handoff — nimbus-backend → nimbus-frontend

**Objective:** agent-config v2 fields live in the API — build the builder UI

This body of work traces agent-config schema v2 — the `tone` and `escalation_rules` fields — from the ai-engine's canonical contract through to the public API. The chain is complete on the backend side: the engine published v2 as a strict superset of v1 (implemented in `normalize_config` and `AgentEngine.check_escalation`), handed off to nimbus-backend via `2026-07-09-handoff-nimbus-ai-engine-2`, and backend exposed the fields on `/agents/{id}/config` in commit `97d4b73`. The contract source of truth is nimbus-backend's `openapi.yaml` and Postman collection — read those at that commit, not the engine repo, when generating client types.

For the builder UI, the key note is `2026-07-09-agents-api-v2`: it states exactly what the API accepts and returns for the two new fields and includes a section written specifically as guidance for the frontend builder UI, plus ownership boundaries. The consumed handoff note is still worth skimming for semantics the API note assumes — in particular that v2 is a strict superset of v1, so existing agents will round-trip without the new fields and the UI must treat them as optional with sensible defaults rather than required inputs.

Two adjacent surfaces intersect with the builder. First, the SSE streaming endpoint (`GET /conversations/{id}/stream`, note `2026-07-09-streaming-api`) is how a builder "test your agent" pane would render live replies — its event format and error semantics are documented there, though contract ownership is flagged as an open question. Second, `escalation_rules` are what fire human-takeover escalation events on the WhatsApp channel (`2026-07-09-whatsapp-channel`), and mobile has an open handoff (`2026-07-09-handoff-nimbus-mobile`) with unresolved questions about the escalation push contract — so the rules the builder UI lets users author have downstream consumers whose contract is not yet settled. Don't invent rule semantics in the UI beyond what the API note specifies.

Current state: backend work done and contracted; both engine→backend handoffs consumed and superseded by their outcome notes; the mobile→backend handoff remains open. The frontend builder UI is the next unstarted link in the chain.

## Reading order

1. [[2026-07-09-agents-api-v2]]
2. [[2026-07-09-handoff-nimbus-ai-engine-2]]
3. [[2026-07-09-streaming-api]]
4. [[2026-07-09-whatsapp-channel]]
5. [[2026-07-09-handoff-nimbus-mobile]]
6. [[2026-07-09-findings]]

## Next actions

- Pull openapi.yaml and the Postman collection at backend commit 97d4b73 and regenerate frontend API client types for tone and escalation_rules on /agents/{id}/config
- Build the builder UI form per the frontend-guidance section of 2026-07-09-agents-api-v2: tone control plus escalation_rules editor, treating both as optional since v2 is a strict superset of v1
- Round-trip test the builder against the live API (GET then PUT /agents/{id}/config) with a v1-era agent config to confirm defaults and omitted-field handling
- Wire a 'test your agent' preview pane to GET /conversations/{id}/stream using the SSE event format and error semantics in 2026-07-09-streaming-api
- Check the open mobile handoff (2026-07-09-handoff-nimbus-mobile) before finalizing escalation_rules UX — the escalation push contract downstream of these rules is still unsettled
- File a frontend outcome note (and mark the consumption) once the builder ships, flagging any contract ambiguities back to backend

---
_Consume with:_ `npx -y loredex@latest handoffs --consume <this note's name>`
