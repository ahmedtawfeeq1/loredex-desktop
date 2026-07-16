# Story 26.3: DESIGN v3 P2 — Today + Inbox

## Status

Done

## Story

**As a** loredex user,
**I want** Home rebuilt as **Today** (needs-you queue, in-flight agents, new knowledge, insight rail) and the Handoffs board rebuilt as the two-pane **Inbox** with one-key triage,
**so that** the day's work is ranked in front of me and every handoff is three keystrokes from triaged.

Spec: docs/DESIGN.md v3 amendment §5 (view mapping), §6.3 (phase scope), §4 (triage kbd hints, floating action bar). Pixel refs: handoff/screens/01 (Today), 02 (Inbox).

## Acceptance Criteria

1. `views/today/TodayView.tsx` replaces HomeView on the `home` view: mono meta line (date · N need you · open · sync), **Needs you** queue = every due-now inbound handoff ranked oldest-first as triage cards (chips + route + age tone + A/D/S buttons + Consume **E** primary) + stale-brief/done-hidden soft rows (re-curate stays a real CLI action), **In flight** (latest write per agent identity from the feed, AgentChip + mono `❯` line), **New knowledge** (latest filed notes → Reader), rail = velocity + backlog charts + project health + relations (epic25 re-homed, §5.1).
2. `views/handoffs/InboxView.tsx` replaces the board on the `handoffs` view: **For me / Created / All** segmented lanes (pure `laneCards` in shared/handoff-lanes) over the same company-wide fetch, project scope select, Active/Done/All display filter (D1a6), RowItem list (StatusGlyph + two-line anatomy + unread dot), detail pane (chips, objective, mono meta, numbered reading order, contract chips, thread rail, fulfilled-by) closed by the §4 floating action bar (Comment · Hand back · Link request · state-legal A/D/S + Consume E primary).
3. Global one-key triage: bare **A/D/S/E** act on the selected card (Today's queue / Inbox list; store-shared `selectedId`, fallback = first row), bare **C** composes (alias of ⌘N); keys are typing/overlay-guarded, palette-listed, cheatsheet-documented.
4. Receipt toasts carry **Undo** where the reverse transition is legal (declined/snoozed → reopen); consume keeps its full ConsumeReceipt panel; route receipts/undo/dedup untouched.
5. Nav labels: Home → **Today**, Handoffs → **Inbox** (view ids stay `home`/`handoffs` internally per §8). Gates green.

## Dev Notes

- Files: `views/today/{TodayView,RailCards}.tsx`, `views/today/today-logic.test.tsx`, `views/handoffs/{InboxView,open-brief}.ts(x)`, `shared/handoff-lanes.ts` (+`laneCards`, `InboxLane`), `shared/inbox-lanes.test.ts`, `stores/{handoffs,boardFilter}.ts`, `actions/registry.ts`, `components/{StatusChip,ShortcutCheatsheet}.tsx`, `App.tsx`, `home.css`, `styles.css`. Deleted: `HomeView.tsx`, `Board.tsx` (every capability re-homed, list below).
- §5.1 parity re-homing: attention queue → Needs you (triage cards + soft rows); KPI pills → meta line + rail; velocity/backlog charts, project health, relations, recent activity → Today rail/sections; range toggle → Segmented (same localStorage key); board lanes/project switcher/display filter/unread dots/receipts/⌘⏎ consume/compose/decline/snooze/annotate/link-request modals/contract chips/thread rail → Inbox; `openBrief` → shared module.

## Dev Agent Record

- **In flight is labeled `recent`, not `LIVE`**: the prototype's live session feed needs P4's MCP-log channel; until then the strip shows the latest write per agent identity from git attribution — honest data, same anatomy. P4 swaps the source.
- **Consume offered from `open`** (prototype shows A/D/S/E on an open card; v2 `actionsFor` gates to A/D/S): the store + lib accept consume from open (the v1 CLI skip-accept path), so Today/Inbox surface it as the E primary. `actionsFor` untouched.
- **Sprint chip deferred**: the prototype meta line says "sprint 12 on track" — work-item schema is P3/§8; the meta line ships date · need-you · open · sync until then.
- **Undo scope**: accept has no legal reverse (accepted→open isn't in the 8.1 machine), so its receipt has no Undo; decline/snooze do.
- **`action:new-handoff-c`** is a palette-hidden alias of ⌘N (bare C per prototype); registry test updated to sanction exactly that alias.
- Today/Inbox copy says **dex** (§8); the app-wide vault→dex string sweep is its own later story.
- Known-flaky git-timing suites (`perf`, `route-safety`) failed in the parallel run, pass isolated — pre-existing.

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-16 | 1.0 | Today + Inbox rebuilt per §5/§6.3; A/D/S/E + C global keys; Undo receipts; nav renames | Claude (dev agent) |
