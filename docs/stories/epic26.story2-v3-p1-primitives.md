# Story 26.2: DESIGN v3 P1 — §4 primitives + view migration

## Status

Done

## Story

**As a** loredex user,
**I want** the §4 component set (Button, StatusChip, Segmented, Kbd, AgentChip, RowItem) built once and the existing views riding it,
**so that** every control renders the "Obsidian Glass" recipes — cobalt-gradient primary, pressed-glass segments, glyph status language — from one source of truth.

Spec: docs/DESIGN.md v3 amendment §4 (component rules), §6.2 (this phase).

## Acceptance Criteria

1. `components/Button.tsx` (primary/secondary/emphasis/danger/quiet + `kbd` hint slot), `Kbd.tsx`, `Segmented.tsx`, `StatusChip.tsx` (glyph anatomy), `AgentChip.tsx`, `RowItem.tsx` exist and render the §4 recipes from `styles.css`.
2. §4 CSS verbatim: primary = cobalt gradient `linear-gradient(180deg, var(--accent-hi), var(--accent-lo))` radius 8 + inner bevel + hover-lightens-one-step + flat `--accent-press` active; secondary = `--bg-overlay` + `--hairline-2` + top-light; ghost transparent/hover `--bg-hover`; danger = rust text + `rgba(229,72,77,.35)` border; button focus = `0 0 0 2px var(--bg-card), 0 0 0 4px var(--focus)`; segmented = inset track radius 10 pad 3, active segment on `--bg-overlay` with `inset 0 1px 0 rgba(255,255,255,.12)` + drop shadow.
3. Status chips are glyph + label: ✓ ready/consumable (ok tint), ✕ declined (rust tint), ! stale/drift (amber tint), – consumed/done/snoozed (muted `--bg-hover`/`--text-3`), OPEN = amber ring-dot chip (`●` mono 10, border rgba(.4), bg rgba(.07)), REQUEST = info-bordered mono chip; stamp-press 120ms survives; snoozed keeps the dashed border.
4. Triage actions show their §4 kbd hints: Accept **A** / Decline **D** / Snooze **S** on board cards, **⌘⏎** on modal confirms, **⌘N** on New handoff (the real binding today — the bare **C** compose key ships with P2's global-keys work).
5. Views migrated to the primitives where the surface survives v3 (board actions, handoff card actions, modal footers, cheatsheet, suggest toast, reader edit/save/comments, vault tree, theme section → `Segmented`); gates green.

## Dev Notes

- Button emits the stylesheet's `button-*` classes — component call sites and remaining class-based call sites are the SAME rendering path. `RowItem`/`AgentChip` have no consumers yet by design: P2 (Inbox rows, Today agents) and P4 (roster) consume them.
- Files: `components/{Button,Kbd,Segmented,StatusChip,AgentChip,RowItem}.tsx`, `components/primitives.test.tsx`, `styles.css` (§4 blocks), `design-fidelity.test.ts`, migrations in `views/handoffs/Board.tsx`, `components/{HandoffCardView,Modal,ShortcutCheatsheet,SuggestToast}.tsx`, `views/reader/{NoteEditor,NoteView,InlineComments,VaultTree}.tsx`, `views/settings/ThemeSection.tsx`.

## Dev Agent Record

- **Partial TSX migration is deliberate**: HomeView/Settings/Atlas/Sync call sites stay on the (identical) `button-*` classes because P2/P5 rebuild those views wholesale — migrating them now is churn deleted next phase. Every surviving surface (cards, modals, reader, tree) uses `<Button>`.
- **`✓ ready/consumable` chips tinted `--ok` green**: §4 gives the glyph set without a hue table; §1's green row explicitly owns "consumed ✓" receipts, and accepted-ready-to-consume is that same affirmative vocabulary. Green here is state semantics, not decoration.
- **`button-emphasis` (filled-ink) kept**: not in §4, but D1 amendment 4 (Comment leads without spending the cobalt budget) still stands; restyled with v3 tokens only.
- **Primary height 30px** within §4's 28–32 range.
- **New handoff hint reads ⌘N not C**: a kbd hint must not lie; the bare-C compose binding is P2's global-keys story (A/D/S/E land there too — hints on the buttons are wired now).
- **`consume-button` bespoke pill kept** (v2 signature treatment, already v3-recolored); folding it into Button would drop its inline ⌘⏎ affordance mid-phase.
- Known-flaky git-timing suites (`route-safety`, `perf`, `poller`) failed in the full parallel run and pass isolated — pre-existing, untouched by this story.

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-16 | 1.0 | P1 primitives + §4 CSS + glyph chips + kbd hints + migration of surviving surfaces; fidelity + unit tests | Claude (dev agent) |
