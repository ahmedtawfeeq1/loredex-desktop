# Story 26.8: DESIGN v3 P7 — agent-ops desktop surfaces (v3 gap-fill)

## Status

Done

## Story

**As an** agency running an agent-ops dex,
**I want** the client fleet visible from the tree (tags, inbox pressure) and each client's workspace panel to say — with the green heartbeat — whether agents can actually connect,
**so that** the desktop is the fleet console the agent-ops doc promised, in the v3 system.

Spec: handoff/DESIGN-AGENT-OPS-VAULT-TYPES.md §Desktop (built per its v3 UI note) + DESIGN v3 §2/§4. Prior agent-ops stories already shipped the fleet read model (`clients.fleet/lints/workspace`, `vault.dexInfo`), ClientsView, ClientPage (pipelines · agents · knowledge tables · workflows · inbox · randoms), and the CodeMirror YAML/JSON + CSV table viewers — this story closes the v3 gaps.

## Acceptance Criteria

1. **Tree**: on agent-ops dexes, client section rows carry their fleet facts read-only — up to 3 mono tag chips + the amber inbox-pending badge (count, §1 attention); the projects group already reads "clients". Zero new IPC — the loaded fleet model drives it.
2. **Workspace panel heartbeat**: the client page's workspace row leads with the §4 green live dot — lit + glowing when the in-app MCP host is listening (`connected · :PORT`), muted with an honest "not connected" otherwise; title says what agents can/can't do.
3. Existing surfaces (client cards + tag chips, client page sections, data-file viewers, generate/check workspace) verified against the v3 quality floor — already riding §2 tokens since P0.
4. Gates green.

## Dev Notes

- Files: `views/reader/VaultTree.tsx`, `views/clients/ClientPage.tsx`, `styles.css`.
- The doc's core phases 1–3 (scaffolds/doctor, workspace.yml generation, non-md indexing) shipped earlier via the agent-ops epic — this was phase 4 minus what that epic already built.

## Dev Agent Record

- **"Connected" = the in-app MCP host is listening** — the strongest honest signal the app has: the generated `.mcp.json` points agents at exactly that host. Per-client connection telemetry (which client an agent has open) needs per-session attribution — same lib dependency P4 recorded.
- Tag chips cap at 3 in the tree (rows stay 28px); the full set lives on the client card/page.
- Known-flaky git-timing suites pass isolated (pre-existing).

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-17 | 1.0 | Tree fleet chips + inbox badges; workspace green-heartbeat connected state | Claude (dev agent) |
