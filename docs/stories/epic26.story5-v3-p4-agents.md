# Story 26.5: DESIGN v3 P4 — Agents view + session telemetry

## Status

Done

## Story

**As a** loredex user,
**I want** an Agents view — who's working this dex, what they last wrote, and a live read-only feed of their MCP tool calls,
**so that** agent activity is visible without ever writing anything new to the dex.

Spec: docs/DESIGN.md v3 amendment §5 ("Agents (new)"), §6.5, §8 (session telemetry). Anti-second-engine: read-only surfaces over existing sources.

## Acceptance Criteria

1. Core: the in-app MCP host records every authorized request in an in-memory ring (200 entries) — `initialize` (with clientInfo name) + `tools/call` (tool name); exposed read-only over the typed IPC seam as `agents.sessions` (`{log, mcp}`); zero engine writes.
2. `views/agents/AgentsView.tsx` on a new `agents` view: **roster** = one row per git-attributed identity (AgentChip w/ the sacred green live dot inside the 10-min write window, last summary, last path, History → Activity); **session feed** = mono `❯` lines (HH:MM:SS + tool/session-start) newest-first, polled 5 s while mounted, with the MCP host state line (running port / conflict / stopped).
3. §6.5 presence chips on cards: the Inbox detail pane shows the last identity that touched the handoff (feed `subject.handoffId` match), live-dotted inside the window.
4. Nav gains Agents (Collaborate); registry/nav tests updated (research dexes now see 10 views, first nine ⌘1-9). Gates green.

## Dev Notes

- Files: `core/mcp-server.ts` (+ring/record/clear), `core/mcp-log.test.ts`, `core/handlers.ts`, `shared/types.ts` (`McpLogEntry`), `shared/ipc-contract.ts` (`agents.sessions`), `views/agents/{AgentsView.tsx,agents-logic.test.tsx}`, `views/handoffs/InboxView.tsx` (presence), `stores/app.ts`, `NavIcon.tsx`, `actions/registry(.test)/nav-groups.test`, `home.css`.

## Dev Agent Record

- **MCP requests aren't attributed per-agent** (one per-install bearer token): the session feed shows the dex's MCP traffic as a whole (tool + time + client on initialize), while per-agent rows ride git attribution. Honest split; per-agent session attribution needs a lib/token change (out of scope, §8).
- **"machine" roster column** from the prototype has no data source yet — omitted rather than faked; lands with per-agent tokens.
- **Live window = 10 min** on git writes (a write is the only per-agent signal we have); the pulse dies under the global reduced-motion rule.
- Poll (5 s, mounted-only) instead of a new event channel — one less IPC surface; can upgrade to a push event if the ring gains volume.
- Known-flaky git-timing suites pass isolated (pre-existing).

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-16 | 1.0 | MCP request ring + agents.sessions channel; Agents view (roster + session feed); Inbox presence chips | Claude (dev agent) |
