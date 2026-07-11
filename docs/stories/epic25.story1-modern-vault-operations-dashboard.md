# Story 25.1: Modern Vault Operations Dashboard

## Status

Done

## Story

**As a** PM opening the app in the morning,
**I want** Home to be a modern operations dashboard — a command strip of live stat
pills, quick actions, a severity-ranked "what needs me" queue, and hand-built
charts for handoff velocity, open backlog, and per-project health with the
who-hands-off-to-whom relations — the dark treatment as the hero look,
**so that** the first screen answers "where do I look, what's on fire, is the team
on track" at a glance, with real numbers and no dead space.

Binding spec: `docs/DESIGN.md` **D1 amendment 9** (verbatim, appended this cycle).
SUPERSEDES epic21's dashboard (§A). Keeps and extends `insights.ts`; zero new
backend.

## Acceptance Criteria

1. **Command strip.** Real stat pills — `Open <open>/<total>` · `Projects N` ·
   `Requests waiting M` · `Contract Δ K` (hidden without contract roots) ·
   `Sync ✓/state` · `On-track P%` (P = consumed / (consumed + open)) — each
   clickable to its view. Serif "Vault Dashboard" title + `<vault> · <long date> ·
   live overview` subtitle. A **range toggle** (segmented, persisted to
   localStorage) drives every window (velocity / backlog / on-track / contract Δ).
2. **Left column.** Quick Actions (five icon CTA cards, one gold primary = New
   handoff, all keyboard-reachable + wired to the real flows) → Attention Queue
   (severity-ranked rows: critical / warning / info with a chip + reason + a
   right-aligned quick action + hover-revealed inline actions) → Recent Activity
   (condensed feed rows, newest first, See all → Activity).
3. **Right column.** Handoff Velocity (SVG paired created/consumed bars, y-grid,
   legend, hover tooltips, summary line) → Open Backlog (SVG smooth area,
   gradient fill, current-value dot + per-day tooltips) → per-project Health
   cards (tint dot, notes, open in/out, brief-freshness chip, utilization bar) +
   a Relations strip (who-hands-off-to-whom directional chips).
4. **Attention Queue is the project-status insight.** Ranked critical → warning →
   info then age desc: critical = open handoffs ≥5d (Consume); warning =
   expired snoozes (Reopen) + stale briefs (Re-curate); info = waiting requests
   (Open) + a done-hidden summary. Each due-now card contributes at most one row
   at its top severity. "All clear" empty state. Humanized titles with the raw
   filename in the tooltip (D1 amendment 3 contract).
5. **Pure, tested chart geometry + insights.** New `views/home/charts/*.ts`
   (`scales`, `velocity-bars`, `backlog-area`) are DOM-free and unit-tested
   (nice-scale ticks, bar layout, area path building) incl. the real nimbus
   velocity buckets. `insights.ts` gains `velocitySeries`, `backlogSeries`,
   `onTrackPct`, `attentionQueue` + `severityCounts`, `projectHealth`,
   `topRelations`, `recentActivity` — all pinned to `tests/fixtures/nimbus-vault`
   ground truth through the lib's own `buildDashboard` / `listHandoffs`.
6. **States, quality, live.** Fresh vault: zeroed strip + one serif line + Route /
   Join CTAs. Degraded: local-only → sync pill + a "Wire a remote" line; no
   contract roots → the Contract Δ pill hidden. Charts render an honest "not
   enough history yet" placeholder on empty windows, never a broken axis. One
   gold primary max, both themes wired (dark = hero), focus rings, reduced-motion,
   no dead space (right column fills height). Live-recompute on the watcher/poller
   — no Refresh; the range toggle re-slices the already-loaded 30-day feed.
   Typecheck + full vitest (sequential) + build green.

## Tasks / Subtasks

- [x] Pure chart modules (AC: 5)
  - [x] `charts/scales.ts` — `niceNum` / `niceScale` / `linearY` / `px`
  - [x] `charts/velocity-bars.ts` — paired grouped-bar layout with y-grid + hover groups
  - [x] `charts/backlog-area.ts` — Catmull-Rom → bezier line + closed area + dot
  - [x] `charts/charts.test.ts` — scales, bar layout, path building, real-fixture integration
- [x] Insights extension (AC: 4, 5)
  - [x] `velocitySeries` / `backlogSeries` / `onTrackPct`
  - [x] `attentionQueue` + `severityCounts`, `projectHealth`, `topRelations`, `recentActivity`
  - [x] `insights.test.ts` new describe blocks pinned to nimbus ground truth
- [x] Data window (AC: 6)
  - [x] `dashboard-data.ts`: activity `since` widened 14 → 30 days (widest toggle range)
- [x] View rebuild (AC: 1–4, 6)
  - [x] `HomeView.tsx`: command strip + pills + range toggle, Quick Actions, Attention Queue, Recent Activity, Velocity/Backlog SVG charts, Project Health + Relations, fresh/degraded states
  - [x] `home.css`: `ops-*` design system, dark-hero, both themes, focus/reduced-motion
- [x] Docs + gate (AC: 6)
  - [x] `docs/DESIGN.md` += "### D1 amendment 9" (verbatim)
  - [x] typecheck + full vitest (`--no-file-parallelism`) + build green
  - [x] real time-boxed dev launch against live nimbus-vault — eyeballed render
  - [x] sprint-status row; story Done

## Dev Notes

- **Zero new backend.** Every number folds from the same channels epic21/15.5
  used — `dashboard.build` (states + edges), `handoffs.list`, `activity.feed`,
  `contracts.timeline`, `sync.status`. The only data-layer change is widening the
  activity `since` from 14 to 30 days so the range toggle can re-slice one feed
  load rather than re-fetch.
- **All chart geometry is pure.** `charts/*.ts` return plain numbers/strings the
  SVG components map straight to `<rect>`/`<path>`/`<line>`; they never touch the
  DOM, so the layout (nice-scale ticks, bar heights, monotone path) is unit-tested
  without rendering. `niceScale` is the classic Heckbert "nice numbers" algorithm
  (tickCount 5) so 21 → 0/10/20/30, an all-zero series → a 0/1 unit axis (never a
  divide-by-zero flat line).
- **Backlog is reconstructed, not synthesized.** `backlogSeries` walks the current
  open snapshot backward through each day's net (created − consumed), clamped at 0
  — the newest point equals `openInbound.open` by construction, so the area chart
  and the "N open now" summary agree.
- **Attention Queue single-listing.** A due-now card is classified once at its
  highest severity (overdue > expired-snooze > waiting-request), so a card that is
  both overdue and a request lands as one critical row, never duplicated. Stale
  briefs and the done-hidden summary are the non-card sources.

### Deviations

- **Range toggle labels.** The spec's toggle names "Today | This Week | This
  Month" over the literal `7/14/30`-day series it also specifies. A 1-day
  velocity/backlog chart is dead space (which the spec forbids), so the toggle is
  **This Week (7) · 2 Weeks (14) · This Month (30)** — honoring the numeric
  windows and the no-dead-space mandate; the smallest window is a real week.
- **"Curate brief" quick action** opens the product brief in the reader (there is
  no in-app curate IPC channel); the "Re-curate" attention action does the same.

## Dev Agent Record

- **Agent:** dev (Opus 4.8, 1M context), sequential v1-completion cycle, epic25.
- **Files:** `src/renderer/src/views/home/HomeView.tsx` (rebuilt),
  `.../home/home.css` (rewritten), `.../home/insights.ts` (extended),
  `.../home/insights.test.ts` (extended), `.../home/dashboard-data.ts` (window),
  `.../home/charts/{scales,velocity-bars,backlog-area,charts.test}.ts` (new),
  `docs/DESIGN.md` (amendment 9), `docs/stories/sprint-status.yaml` (row).
- **Verification:** `npm run typecheck` clean (node + web); full
  `npx vitest run --no-file-parallelism` green; `npm run build` clean; a real
  time-boxed Electron launch against the live `_machine2/nimbus-vault` rendered
  the dashboard with real numbers (Open 11/21, On-track 52%, live velocity/backlog
  charts, severity queue, project health + relations) in the dark hero theme.
- **No new dependencies.**
