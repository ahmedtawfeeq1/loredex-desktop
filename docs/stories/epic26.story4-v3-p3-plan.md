# Story 26.4: DESIGN v3 P3 — Plan (preview flag)

## Status

Done

## Story

**As a** loredex user,
**I want** a Plan view — Board · Backlog · Sprints — over the dex's work,
**so that** flow state is visible as a kanban even before the unified work-item schema exists.

Spec: docs/DESIGN.md v3 amendment §5 ("Plan (new)"), §6.4 (behind a flag reading `type: handoff` only), §8 (work-item schema — lib flag). Pixel ref: handoff/screens/03.

## Acceptance Criteria

1. `views/plan/PlanView.tsx` on a new `plan` view: Board tab = four columns derived purely from the 8.1 handoff state machine (Triage = open/expired oldest-first · Parked = snoozed · In progress = accepted · Done = consumed/declined); cards carry glyph + kind + mono id + title + project dot + age + state-legal one-tap actions (A/D/S/E vocabulary) riding the SAME store writers (anti-second-engine).
2. Backlog tab = triage + parked flat list; Sprints tab = an honest §8-blocked empty state (one line + one action), never fake data.
3. The view ships **behind the Plan preview flag** (§6.4): hidden from nav/⌘n until enabled from the ⌘K palette ("Enable the Plan preview"); the flag persists in localStorage and is listed in the palette both ways.
4. Gates green; registry/nav tests cover the flag (off by default, on adds `view:plan`).

## Dev Notes

- Files: `views/plan/PlanView.tsx`, `views/plan/plan-logic.test.tsx`, `stores/{planFlag,planFlagTab}.ts`, `actions/registry.ts` (+`action:toggle-plan`, VIEW_ORDER entry, flag-aware `visibleViews`), `App.tsx`, `stores/app.ts` (AppView += 'plan'), `NavIcon.tsx` (kanban glyph), `home.css` (plan classes).
- When the lib work-item schema (§8: `kind: task|handoff|request`, `status: backlog|todo|doing|review|done|consumed`, `priority`, `sprint`, `owner` + `work_list/claim/update/done` MCP verbs) lands, columns re-derive from `status` directly, the Sprint dropdown + Sprints tab light up, and the flag retires.

## Dev Agent Record

- **Column mapping is a preview-mode derivation, not the §8 taxonomy**: the prototype's TRIAGE/TODO/IN PROGRESS/REVIEW columns need `status` values handoffs don't have; the preview maps the 8.1 machine (open→Triage, snoozed→Parked, accepted→In progress, consumed·declined→Done) and says so in the view subtitle.
- **No drag-and-drop**: transitions stay button/keyboard writes through the existing store (decline requires a reason, snooze a date — a drop can't collect either). DnD is a §8-era story if wanted.
- **Prototype's Sprint-12 dropdown + GEN-nnn ids** need the schema; ids render the note-name id until then.
- Known-flaky git-timing suites pass isolated (pre-existing).

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-16 | 1.0 | Plan preview behind the §6.4 flag: board/backlog over handoff states, honest sprints empty state | Claude (dev agent) |
