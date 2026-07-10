# Story 15.5: Home dashboard — directional insight, not a document

## Status

Done

## Story

**As a** PM opening the app in the morning,
**I want** Home to be a full-width insight dashboard — what needs attention, who blocks whom, where contracts churn, how fresh each project's knowledge is — every tile a one-click jump into the view that acts on it,
**so that** the first screen answers "where do I look next" instead of rendering the Start-Here brief as a narrow page of prose.

Binding spec: `docs/plan/wireframe-home-dashboard.html` (layout, UI→channel table, states, build plan, resolved defaults).

## Acceptance Criteria

1. **Full-width dashboard shell.** Home drops the reading measure entirely; the grid fills the pane (DESIGN.md v2 cards on the pane surface, one gold primary max, mono data, dense rows). Header: view title, `<vault> · <weekday date>` sub, a "live" chip (watcher + poller) — **no Refresh button on Home**.
2. **KPI row (6 tiles), each mapped to an existing channel** (spec §4): open inbound + across-N-projects (`handoffs.list`), requests waiting (`kind==='request' && status==='open'`), oldest open with its route (max `ageDays` over open/expired), contract changes in the last 7 days (`contracts.timeline`, client-side window), stale briefs of N projects (`dashboard.build` ProjectStates), sync (`sync.status`, degraded local-only text when no remote).
3. **Attention / blocked band.** Needs-attention list: open + expired-snooze handoffs ranked expired-first then `ageDays` desc; stamps reuse the board's chip component; age chips amber ≥2d, rust ≥5d (resolved Q1); row click opens the handoff's brief exactly like the board card; inline Consume / Snooze on hover ride the board's own store actions (`handoffs.consume` / `handoffs.setStatus` — no duplicated logic, receipt toast + instant recompute). Blocked card renders `src/shared/blocked.ts` `blockedRows()` sentences verbatim, row click resolves via `relPath`, footer jumps to Atlas → Blocked.
4. **Second band.** Project pulse: one row per `ProjectState` (notes · last date, open in/out counts, brief chip: stale = `notesNewerThanBrief > 0`, "no brief" = `briefPath === null`, topics), row click → Atlas Learn for that project. Contract churn: `contracts.timeline` grouped by file, 7-day window (resolved Q3), linked-handoff count from the existing chip linker, click → Contracts scoped to the file's project + focus ring on its newest change; **section hides entirely when no project roots are registered**. Today's activity: `activity.feed` since local midnight, counts by kind + a 24-rect per-hour SVG density strip (no chart lib), click → Activity feed. Product brief demotes to a link-out card (resolved Q4): title + freshness via the existing `brief-title.ts`/`freshness.ts`, "Open in Reader".
5. **Pure insights module with fixture tests.** `views/home/insights.ts` folds the channel payloads into tile models (`openInbound`, `requestsWaiting`, `oldestOpen`, `staleBriefs`, `churnByFile(7d)`, `activityCounts(since midnight)`, `attentionRows` ranking, age tones, sync tile) — vitest against fixtures from the real nimbus simulation vault (`tests/fixtures/nimbus-vault` through the lib's own `buildDashboard`/`listHandoffs`, plus checked-in activity/contract JSON captured from the live simulation repos).
6. **Live + key states.** Recompute on existing watcher/poller renderer events, debounced 500 ms. Empty vault: one serif sentence + Route a note… / Join a vault… (spec §3). Degraded: sync tile local-only with a "Wire a remote" link to Sync; churn section hidden without roots — never an empty error. Company-wide scope (resolved Q2). Typecheck + vitest + build green.

## Tasks / Subtasks

- [x] Story + insights module (AC: 5) — commit 1
  - [x] `views/home/insights.ts` pure aggregation + `insights.test.ts` against nimbus fixtures
  - [x] `views/home/fixtures/nimbus-activity.json` + `nimbus-contract-changes.json` captured from the real simulation vault/repo
- [x] Dashboard layout (AC: 1, 2) — commit 2
  - [x] Rebuild `HomeView.tsx`: KPI row, attention/blocked band, project pulse, churn/activity band, brief card; `home.css` (view-scoped, like atlas.css)
- [x] Row actions + deep links (AC: 3, 4) — commit 3
  - [x] Board-card open (`openBrief`), Atlas blocked / Learn, Contracts scoped+focused, Reader brief; inline consume/snooze via `useHandoffs`
- [x] Live recompute (AC: 6) — commit 4
  - [x] `dashboard-data.ts` store: one debounced (500 ms) recompute over existing renderer events; Refresh button gone
- [x] QA + docs (AC: 6) — commit 5
  - [x] USER-GUIDE.md Home section rewrite; sprint-status row; story Done

## Dev Notes

- **Zero new backend asks.** Every number maps to an existing `src/shared/ipc-contract.ts` channel; the dashboard is a pure consumer plus one client-side aggregation module (spec §4 table, verbatim).
- Blocked rows derive from `handoffs.list` cards through the shared `blockedRows()` — the same one blocking rule the Atlas model uses, so the two surfaces cannot disagree (the spec's `atlas.graph` row names the shared module as the mapping).
- Attention actions reuse the handoffs store verbatim: optimistic flip, receipt toast, authoritative refetch — Home renders the same cards object, so recompute is instant.
- Resolved defaults honored: age chips amber ≥2d / rust ≥5d; company-wide scope; churn window fixed 7d; brief is a link-out card only.
- Scope discipline (concurrent workflow in this repo): all new code lives in `views/home/**`; shared modules are imported read-only.

### Testing

- `src/renderer/src/views/home/insights.test.ts` — fixture-driven: dashboard/handoff payloads built by the lib against `tests/fixtures/nimbus-vault` (today pinned 2026-07-10), activity/contract JSON captured from the live simulation; synthetic cards cover expired-snooze ranking and age tones the fixture doesn't contain.
- Existing `brief-title.test.ts` / `freshness.test.ts` keep covering the brief card.

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-10 | 0.1 | Drafted from wireframe-home-dashboard.html | Dev Agent |
| 2026-07-10 | 1.0 | Implemented per the spec's 5-commit plan; Done | Dev Agent |

## Dev Agent Record

### Agent Model Used

Claude Fable 5 (claude-fable-5)

### Debug Log References

- Insights suite solo: 21/21 (fixture ground truth: 10 due-now across 3 projects, 4 requests waiting, oldest 1d backend→mobile, 4/4 briefs missing, churn 4+4 rows latest 97d4b73, activity 33 since the simulation's midnight, busiest hour 06)
- Full gate before every commit: vitest 549/549 → 552/552 (69 files) after the recompute test; typecheck (node+web) + electron-vite build clean each time

### Completion Notes List

- **Pure consumer, one aggregation module.** `insights.ts` has no IPC and no `Date.now()` — every "now"/midnight anchor rides in as an argument, so the fixture tests are deterministic (hour buckets are offsets from the midnight anchor, timezone-independent).
- **Fixtures from the real simulation.** Dashboard/handoff payloads are produced by the lib itself (`buildDashboard`/`listHandoffs`) over `tests/fixtures/nimbus-vault`; `views/home/fixtures/nimbus-activity.json` was captured from the live simulation vault's git log through the lib's own `parseActivity`, and `nimbus-contract-changes.json` from a real numstat scan of the simulation's nimbus-backend repo (shas incl. 97d4b73 match the M2 QA drive). The fixture vault contains no expired snooze, so ranking's expired-first tier is covered by synthetic cards.
- **Blocked card = shared rule.** Rows come from `src/shared/blocked.ts` `blockedRows()` over the same `handoffs.list` cards the board holds — the spec's §4 mapping names that module; no separate `atlas.graph` pull is needed and the two surfaces cannot disagree.
- **Inline actions are the board's actions.** `useHandoffs.consume/setStatus/openSnooze` (the snooze picker modal is app-mounted already); Home renders the same cards object, so the optimistic flip recomputes every tile instantly and the receipt toast is identical.
- **Live, not Refresh.** `dashboard-data.ts` re-pulls its four channels on one 500 ms-debounced timer over the existing renderer events; `sync.changed` pushes health directly; a vault switch resets the view-local store via `onVaultChanged` (the store deliberately isn't in App.tsx's reset list — scope discipline, see below).
- **Degraded honesty per spec §3:** churn section AND its KPI tile render only when project roots are registered (never an empty error); local-only vaults get the quiet wire-a-remote line; empty vault is one serif sentence + Route/Join.
- **Gold budget:** no gold primary on this view — gold appears only as state (OPEN stamps, amber age chips, linked-handoff chips, focus ring). Stamps reuse `StatusChip`/`chip-request` verbatim.
- **Deviations from the spec text, with reasons:**
  - "Re-curate…" button omitted: no async curation seam exists in the app yet (v0.1 scope cut stands; the CLI hint renders instead) — a fake button would violate the honesty rule.
  - The spec's e2e stage (build plan step 5) is delivered as the fixture-driven insights suite instead of a `tests/e2e` addition: a concurrent workflow owns paths outside `views/home/**` this sprint, and `tests/e2e/` was out of the sanctioned file set. The ground-truth assertion (dashboard numbers match the vault) is the same, executed at module level.
  - `views/home/**` styles live in `home.css` (the atlas.css precedent) rather than `styles.css` — same scope-discipline reason; tokens/Don't-list respected (design-fidelity suite untouched and green).

### File List

- src/renderer/src/views/home/insights.ts — NEW: pure tile aggregation (KPIs, ranking, churn, activity, sync tile, pulse)
- src/renderer/src/views/home/insights.test.ts — NEW: 21 fixture-driven cases (nimbus ground truth + synthetic edge tiers)
- src/renderer/src/views/home/fixtures/nimbus-activity.json — NEW: real vault git log via lib parseActivity
- src/renderer/src/views/home/fixtures/nimbus-contract-changes.json — NEW: real nimbus-backend contract numstat rows
- src/renderer/src/views/home/dashboard-data.ts — NEW: channel fetch store + debounced live recompute (+ vault-switch reset)
- src/renderer/src/views/home/dashboard-data.test.ts — NEW: recompute-event predicate coverage
- src/renderer/src/views/home/HomeView.tsx — REBUILT: full-width dashboard (KPI row, attention/blocked, pulse, churn/activity, brief card)
- src/renderer/src/views/home/home.css — NEW: view-scoped dashboard styles (v2 tokens only)
- docs/USER-GUIDE.md — Home section rewritten for the dashboard
- docs/stories/sprint-status.yaml — board row 15-5
- docs/stories/epic15.story5-home-dashboard.md — this story

## QA Results

(pending)
