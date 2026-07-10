# Story 15.3: Keyboard coverage — shortcuts, palette hints, cheatsheet

## Status

Done

## Story

**As a** keyboard-first user (the app's stated quality floor: "every action keyboard-reachable; ⌘K palette lists all"),
**I want** every global action on a shortcut, the ⌘K palette showing those shortcuts as hints, and a `?` cheatsheet that teaches the whole map,
**so that** the quality floor is enforced by a registry + unit test instead of scattered ad-hoc `keydown` handlers that drift.

## Acceptance Criteria

1. **One action registry** (`src/renderer/src/actions/registry.ts`) declares every global user action with title, `run`, and (where bound) a shortcut combo + display hint. Global shortcuts work from every view: ⌘1–⌘9 switch views in sidebar order (Home…Settings), ⌘N opens Compose handoff, ⇧⌘R starts Route-a-note, ⇧⌘S runs Sync now, ⌘K toggles the palette (existing), `?` opens the cheatsheet. Shortcuts never fire while typing in an input/textarea/select or while a modal is open (Esc/⌘⏎ stay the modal's own keys).
2. **⌘K palette lists all** registry actions with their shortcut hints rendered on the item (existing contextual providers — atlas navigation, reply/comment on the open handoff — keep working and stay listed).
3. **Cheatsheet modal on `?`**: groups Global / Views / Atlas / Lists & cards / Modals; includes the non-registry per-context keys that already exist (⌘[/⌘] atlas history, ↑↓/⏎ palette + search, ⏎ / ⌘⏎ handoff card open/consume, Esc / ⌘⏎ in modals). Esc closes it; it is itself ⌘K-listed ("Keyboard shortcuts…").
4. **Focus order sane per view**: sidebar nav → pane content in DOM order; every interactive element is a real `button`/control (tab-reachable); modals move focus inside on open and Esc returns to the page (existing `Modal`); the cheatsheet follows the same contract. Nav buttons carry their shortcut in `title` + `aria-keyshortcuts`.
5. **Palette-coverage unit test**: every registered action appears in the palette items (by id, with its hint), every combo is unique, every `AppView` has a nav action, and the shortcut matcher honors the typing/modal guards. Suites stay green; typecheck + build clean.

## Tasks / Subtasks

- [x] Registry + matcher (AC: 1)
  - [x] `actions/registry.ts`: `AppAction` type + `appActions()` (view nav ×9, new handoff, route note, sync now, cheatsheet, palette)
  - [x] `actions/shortcuts.ts`: pure `matchShortcut(event, actions, ctx)` + `isTypingTarget` guard; App.tsx global handler consumes it (replaces the ⌘K-only listener, ⌘K kept + exempted from the overlay guard)
- [x] Palette (AC: 2)
  - [x] Palette action items source from `appActions()` via `actions/palette-items.ts` (the whole provider moved out of the component — node-testable); hint rendered as a kbd chip per row; atlas + reply/comment contextual providers preserved verbatim
- [x] Cheatsheet (AC: 3)
  - [x] `components/ShortcutCheatsheet.tsx` + `cheatsheetOpen` app-store flag; Global/Views groups derive FROM the registry; Atlas / Lists & cards / Modals context keys documented
- [x] Focus order (AC: 4)
  - [x] Audited (see Completion Notes); sidebar nav now maps over the registry's `VIEW_ORDER` with `title="<label> (⌘n)"` + `aria-keyshortcuts`
- [x] Tests (AC: 5)
  - [x] `actions/registry.test.ts` (palette coverage + combo uniqueness + view coverage + behavior), `actions/shortcuts.test.ts` (matcher + typing/overlay guards)

## Dev Notes

- Per-card lifecycle actions (accept/decline/snooze/consume) are card-scoped buttons — keyboard-reachable via focus + ⏎ (HandoffCardView already handles ⏎/⌘⏎); they are NOT global shortcuts by design (which card?). The cheatsheet documents the pattern.
- ⌘R is Electron's reload in dev — Route-a-note takes ⇧⌘R; Sync takes ⇧⌘S (plain ⌘S is muscle-memory "save", a no-op here — leaving it unbound avoids teaching a wrong reflex).
- The registry is store-driven (zustand `getState`), no React — unit-testable under the node environment like the existing store tests.
- DESIGN.md quality floor is the binding requirement: "Every action keyboard-reachable; ⌘K palette lists all."

### Testing

- `src/renderer/src/actions/registry.test.ts` — the coverage net: a future action added to the registry without palette listing (or a duplicate combo) fails the suite.
- `src/renderer/src/actions/shortcuts.test.ts` — combos, typing guard, modal guard.

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-10 | 0.1 | Drafted (M3 hardening cycle) | Dev Agent |

## Dev Agent Record

### Agent Model Used

Claude Fable 5 (claude-fable-5)

### Debug Log References

- Action tests solo: 16/16 (registry 9 + shortcuts 7)
- Full app suite after wiring: 528/528 (67 files); typecheck (node+web) + electron-vite build clean

### Completion Notes List

- **One registry, four consumers.** `appActions()` is consumed by (1) the App-shell keydown handler, (2) the ⌘K palette rows, (3) the sidebar nav (`VIEW_ORDER` map — order, labels and ⌘1-9 hints structurally cannot drift), (4) the cheatsheet's Global/Views groups. `registry.test.ts` fails when a registered action goes missing from the palette or two actions claim one combo.
- **Bindings:** ⌘1–⌘9 views (sidebar order), ⌘N new handoff, ⇧⌘R route-a-note (⌘R is Electron reload in dev), ⇧⌘S sync now, ⌘K palette (unchanged, now `always`-flagged so it still toggles from inside overlays), `?` cheatsheet. Ctrl accepted wherever ⌘ is (the old ⌘K rule, kept).
- **Guards:** bare keys (`?`) never fire while typing (input/textarea/select/contenteditable); an open overlay (modal/palette/cheatsheet — detected by `.modal-backdrop`/`.palette-backdrop` presence) blocks everything except ⌘K; ⌥-chords never match (they type characters on macOS); letter/digit chords are shift-exact (⌘R ≠ ⇧⌘R).
- **Palette rows** show the shortcut as a kbd chip (`--bg-inset`, 1px hairline, mono 10px — Don't-list compliant, design-fidelity suite stays green); atlas back/forward rows now show their ⌘[/⌘] hints in the chip instead of inline title text. `action:palette` is the one sanctioned palette hole (it cannot summon itself) — asserted exactly, so a second hidden action fails the test.
- **Focus-order audit (AC4):** sidebar `<aside>` precedes every pane in the DOM, so ⇥ order = visual order (nav → list pane → detail) in all nine views; every interactive element checked is a real `button`/control (tree rows, feed rows, handoff cards `role="button" tabIndex=0` with ⏎/⌘⏎, atlas nodes/topic groups, contract timeline rows); `Modal` focuses its first control on open and Esc closes (existing, unchanged); the cheatsheet focuses itself on open (`tabIndex={-1}`), closes on Esc, and stops propagation like `Modal`. No fixes needed beyond the nav hints — order was already sane; it is now also documented and hinted.
- **Superseded in place:** the palette's four hardcoded global actions (new-handoff / route / atlas / contracts) became registry entries; "Go to Atlas"/"Go to Contracts" replace the old view actions with full ⌘4/⌘5 parity.

### File List

- src/renderer/src/actions/registry.ts — NEW: THE global action registry (+ `VIEW_ORDER`)
- src/renderer/src/actions/shortcuts.ts — NEW: pure matcher + typing-target guard
- src/renderer/src/actions/palette-items.ts — NEW: ⌘K action provider (moved from Palette.tsx, registry-backed)
- src/renderer/src/actions/registry.test.ts — NEW: palette-coverage net (AC5)
- src/renderer/src/actions/shortcuts.test.ts — NEW: matcher/guard tests
- src/renderer/src/components/ShortcutCheatsheet.tsx — NEW: `?` cheatsheet modal
- src/renderer/src/App.tsx — registry keydown handler; nav maps over VIEW_ORDER with hints; cheatsheet mounted
- src/renderer/src/views/search/Palette.tsx — rows from palette-items; kbd hint chips; foot mentions `?`
- src/renderer/src/stores/app.ts — `cheatsheetOpen` flag
- src/renderer/src/styles.css — `.palette-item-hint` + `.cheatsheet-*`
- docs/stories/sprint-status.yaml — board entry
- docs/stories/epic15.story3-keyboard-coverage.md — this story

## QA Results

**PASS** — fresh-eyes M3 QA, 2026-07-10.

- Coverage test is meaningful, not ceremonial: `registry.test.ts` asserts every registered
  action appears in `actionItems('')` by id with its hint, combo uniqueness, all nine views
  covered in sidebar order with ⌘1-9, and `action:palette` as the *only* sanctioned
  palette hole (asserted exactly — a second hidden action fails).
- Five actions spot-checked to real wiring (QA): `view:atlas` → `useApp.setView('atlas')`
  (asserted in test), `action:new-handoff` → `useHandoffs.openCompose()` (`composeOpen`
  asserted), `action:route-note` → `useRoute.start()` → native picker → `startWithFile`,
  `action:sync-now` → `useSync.syncNow()`, `action:shortcuts` → `cheatsheetOpen` asserted.
  Consumers verified in code: App.tsx keydown uses `matchShortcut(e, appActions(), …)`, nav
  maps over `VIEW_ORDER` with `title` + `aria-keyshortcuts`, Palette rows come from
  `actionItems` with kbd hint chips, `ShortcutCheatsheet` mounted in App.
- Context keys verified: ⌘[/⌘] in `AtlasView.tsx`, ⏎/⌘⏎ open/consume in
  `HandoffCardView.tsx` (target-guarded), guards covered by `shortcuts.test.ts`.
- Suites 528/528, typecheck + build clean (QA re-run).
