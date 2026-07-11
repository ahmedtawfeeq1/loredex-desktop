# V4 status — v1-completion cycle QA (D1 amendments 7 + 9)

Fresh-eyes QA of the v1-completion cycle against `docs/DESIGN.md`. Six epics were
named for verification (20 / 4 / 22 / 25 / 23 / 24). **Five landed real commits and
pass; one — epic 24 (form validation) — never existed** (no spec section, no story,
no commit). All automated gates on the shipped code are green.

Date: 2026-07-11 · Branch: `main` · Test vault:
`loredex-simulation/_machine2/nimbus-vault`.

## Headline verdict

| Epic | Commit | Landed? | Verdict |
|---|---|---|---|
| 20 — Properties panel | `2b88d83` | yes | **PASS** |
| 4 — Routing safety | `4a30042` | yes | **PASS** |
| 22 — Powerful search | `6a5fcbf` | yes | **PASS** |
| 21 — Home dashboard (§A) | `83b07d1` | yes | **SUPERSEDED** by epic 25 (still in tree, not the live Home) |
| 25 — Modern Vault Ops Dashboard (§amd-9) | `4155ddb` | yes | **PASS** |
| 23 — Vault switcher + multi-window | `0f6725f` | yes | **PASS** |
| **24 — Form validation** | **none** | **NO** | **ABSENT — NOT DELIVERED** |

The amendment-7 spec commit is `dd391e2`. Commits 20/4/22/21/23/25 are genuinely
present and wired end-to-end (verified against `git log`, not an agent self-report).

### 🔴 Loud finding: epic 24 (form validation) was never built

The task named epic 24 and pointed at "D1 amendment 8" as its spec. **Neither exists:**

- **`docs/DESIGN.md` has no amendment 8.** It jumps amendment 7 → amendment 9. There
  is no form-validation spec section anywhere in the design doc.
- **No `docs/stories/epic24.*` file** exists.
- **No epic 24 commit** in `git log --all` (grep for `epic24|form.?valid|amendment 8`
  returns nothing across all history).
- **The behavior the AC demands is absent from the code.** Every submit surface
  (`ComposeHandoffModal`, Hand back, `DeclineReasonModal`, `CreateVaultWizard`,
  `JoinVaultWizard`, `IdentityConfirm`) still uses the pre-existing **disabled-button**
  pattern — the exact "silent dead button" the AC set out to eliminate:
  - `src/renderer/src/components/Modal.tsx` renders `<button disabled={submitDisabled}
    title={`${submitLabel} (⌘⏎)`}>`. The disabled button's tooltip is **always** the
    submit label + shortcut — **never a reason** for why it is disabled.
  - `ComposeHandoffModal` computes `problem = composeProblem(state)` (a real,
    human-readable reason string) but only feeds it to `submitDisabled={problem !==
    null …}` — the reason is discarded, not shown. No field-level error, no
    focus-on-invalid.
  - `DeclineReasonModal` → `submitDisabled={!trimmed}`; wizards → `disabled={!valid …}`
    / `submitDisabled`. Same pattern, same gap.
  - Grep for `aria-invalid`, `field-error`, `.focus()` on invalid submit across the
    form surfaces: **no matches**. Nothing focuses the first bad field on submit.

**Impact:** the AC — "submit-with-empty-required shows a field error + focuses it
across compose / Hand back / wizards / decline; NO silent dead buttons; disabled
submits carry a reason tooltip" — is met by **none** of the six surfaces. This is a
whole-epic gap (spec + story + code), so it is reported, not fixed inline. It needs:
(1) an amendment-8 spec section, (2) an `epic24.story1` file, (3) a `Modal` /
form-field refactor that on submit shows the first `problem` as a field error, focuses
that field, and surfaces the reason as the disabled-button tooltip instead of the
generic shortcut hint.

## Gate results (sequential, evidence)

| Gate | Command | Result |
|---|---|---|
| Typecheck | `npm run typecheck` | **PASS** — node + web projects, 0 errors (exit 0) |
| Unit | `npx vitest run --no-file-parallelism` | **961 passed / 102 files** (exit 0) |
| E2E | `npm run test:e2e` | **18 passed / 1 file** (exit 0) |
| Build | `npm run build` | **PASS** — `out/renderer` + `out/main`, built in ~1.7s (exit 0; one benign "dynamically + statically imported" chunk-hint warning, no failure) |
| Launch smoke | `electron out/main/index.js` (~18s) | **PASS** — `app.db open` → `core host started` → `vault watcher armed` → preload "pong received from core host — transport alive"; process stayed alive, zero errors |

Note the gates are green because they only exercise the code that exists — there are
no epic-24 tests to fail. Green gates do **not** imply epic 24 shipped.

## Working-tree state (uncommitted from the prior cycle)

`git status` shows uncommitted changes left by the previous agent — **not committed,
not pushed**:
- `src/core/atlas.test.ts` — a de-brittle fix (see below), unstaged.
- `docs/stories/epic{20,21,22,23}.* + epic4.story2` — QA-Results annotations, unstaged.
- `V4-STATUS.md` — this file (was untracked; now rewritten by this cycle).

These should be committed (they are correct) but were not. The cycle's "confirm HEAD"
step did not include them.

## Defect found and fixed (pre-existing, carried in the working tree)

**`src/core/atlas.test.ts` — over-pinned fixture literal.** The `nimbus-backend at
learn` invariant asserted `expect(members).toBe(18)`. The simulation vault is living —
a `nimbus-mobile → nimbus-backend` handoff edge landed, so the cluster now has 19 panel
members. This is fixture drift, **not** an atlas layout regression: the invariant the
test protects (a large cluster fills the panel, ratio > 0.5, spreads across columns,
no column deeper than 6) still holds. The working tree already relaxes it to
`expect(members).toBeGreaterThanOrEqual(18)` — correct; this cycle verifies and keeps
that fix. Atlas suite green within the 961.

## Per-epic AC verification

### Epic 20 — Properties panel (§C) — PASS
- Typed rows: `inferPropertyType` (`src/shared/properties.ts`) → date / tags /
  select (`status`/`type`/`kind`) / url / path / text, key- and value-driven.
- Managed keys **locked**: `MANAGED_FRONTMATTER_KEYS` (canonical four
  `loredex`/`source_path`/`source_project`/`source_rel` + lifecycle/provenance keys);
  panel renders the lock glyph + "managed by loredex" tooltip and the writer
  `applyFrontmatterEdit` **throws** on a managed key — a real server-side guard, not
  UI-only.
- Edit writes frontmatter, body intact: `engine.setFrontmatter` writes back through
  the lib `serializeDoc` with `doc.body` preserved; git auto-commit
  `loredex: set|remove property <key> on <note>`, path-guarded via `resolveInVault`,
  identity rides the commit.
- Add ("+ Add property" + type picker) and Remove (× on user rows only) present;
  managed rows expose no × and no editor.
- Tags are clickable → `useSearch.setQuery('tag:'+tag)` → epic 22 parses the operator.
- Wired into the reader: `NoteView.tsx` mounts `<PropertiesPanel>` with
  `defaultCollapsed` for long notes.
- Tests: `properties.test.ts`, `set-frontmatter.test.ts` green.

### Epic 4 — Routing safety (§E) — PASS
- Receipt + Undo: `route.file` returns `receiptId`; the receipt **toast carries a
  one-click Undo** → `route.undo` → lib restore; a failed undo reports loudly
  (`stores/route.ts` + `ToastStack`).
- Dedup guard: `findDuplicateReceipt(history, source_hash)` warns in
  `RouteConfirmCard` when the same source body was already routed (skips undone
  receipts).
- Filing-scope exclude: `settings.neverRoute.get/set` + `matchNeverRoute`; globs
  persist in team config (honored by the CLI, not app-db-only); preview short-circuits
  on a never-route match.
- Drift badge + reroute: `noteDrift(path)` compares the live source body hash to the
  stamped `source_hash`; `DriftBadge.tsx` is wired in `NoteView` (line 292);
  reroute reuses `route()`.
- Tests: `route-safety.test.ts` (incl. never-route globs story 4.3) green.

### Epic 22 — Powerful search (§B) — PASS
- Operators parsed client-side: `query-parser.ts` — `project:`/`topic:`/`type:`/
  `status:`/`tag:`/`from:`/`to:`/`before:`/`after:`/`on:`, last-wins, unknown
  `foo:bar` falls through as a bare term.
- Narrow deterministically pre-rank: operators → core `Facets` transport (extended
  with tag/date); same `vault.search` seam.
- Ranked results: humanized title, project tint dot, matched-term highlight, meta,
  keyboard up/down/enter, result-count, group-by-project toggle.
- Recents: `search-recents.ts` (localStorage, dedup, cap 8) + saved-search chips.
- ⌘K palette: top-5 + "see all in Search →".
- Tests: `query-parser.test.ts`, `search-recents.test.ts`, `palette-nav.test.ts` green.

### Epic 25 — Modern Vault Operations Dashboard (§amendment 9, supersedes epic 21) — PASS
- Command strip: real **stat pills** (open/total, projects, requests waiting,
  contract Δ, sync, on-track %) each clickable; title "Vault Dashboard" + subtitle;
  **range toggle** persisted to `localStorage` (`loredex.home.range`).
- Left column: **Quick Actions** icon CTAs (New handoff = the single gold primary,
  Route, Curate, Atlas, Sync) wired to real actions; **Attention Queue** —
  severity-ranked rows (Critical/Warning/Info) with reason + quick action, ordered
  critical → warning → info then age; **Recent Activity** condensed cards.
- Right column: **Handoff Velocity** paired bar chart (created vs consumed) +
  summary line; **Backlog** area chart (smooth path + gradient + current dot);
  **Project health** cards (note count, in/out chips, brief-freshness, utilization
  bar) + a **relations strip** (who-hands-off-to-whom from dashboard edges).
- Charts are **pure + unit-tested**: `charts/scales.ts`, `velocity-bars.ts`,
  `backlog-area.ts` with `charts.test.ts` asserting bucketing, scales, path building,
  empty/short-data honesty, and an integration case against the real nimbus 7-day
  velocity. `insights.test.ts` covers velocity buckets, backlog series, on-track %,
  attention-queue assembly, per-project health, relations — against nimbus ground
  truth. Zero new backend; live-recompute retained.
- **Documented deviation (minor, defensible):** the range toggle is
  `This Week (7) / 2 Weeks (14) / This Month (30)` rather than the spec's
  `Today / This Week / This Month` — the code comment notes a 1-day velocity chart is
  dead space, which the same spec forbids, so the smallest window is a real week. Not
  a blocker; noted for the user's call.
- Supersession: epic 21's HomeView code remains in the tree but epic 25 is the live
  Home; §A is retired by §amendment 9 as designed.

### Epic 23 — Vault switcher + multi-window (§D) — PASS
- Vault menu: `VaultMenu.tsx` + `stores/vaultMenu.ts` — recents, "Open vault…"
  (switch in place), "Open in new window", "Create or join…".
- Recents persisted app-wide: `shared/recent-vaults.ts`.
- Multi-window: `main/index.ts` runs a **genuine per-window core host + vault path**
  (`forkCoreHostFor`, `openWindow(vaultPath)`, `bootWindowCore`, per-window port
  brokering); the chip shows the current window's vault.
- Tests: `vaultMenu.test.ts`, `recent-vaults.test.ts` green.

### Epic 24 — Form validation — ABSENT (see loud finding above) — NOT DELIVERED
No spec, no story, no commit, no code. Every form surface still ships the disabled
dead-button pattern with a generic (non-reason) tooltip and no submit-time field error
or focus. Reported for a future cycle.

## Regression — prior pinned invariants all green

Covered by the 961-unit + 18-e2e suites, all passing:
- Atlas layout + corruption: `atlas.test.ts` (fixture literal relaxed to the
  invariant; two-row header, no-SVG-drop-shadow, panel-fill/readable-fit hold).
- Home insights aggregation; handoff reply model (Comment primary / Hand back) +
  board display filter (done hidden by default); editor v2 (CodeMirror 6); comment
  hover popover; read-mode find bar — all green.

## What remains for a public release

### Product scope still owed
1. **Epic 24 — form validation (NOT built).** Author amendment 8 + `epic24.story1`,
   then implement submit-time field errors + focus + reason tooltips across compose /
   Hand back / wizards / decline; refactor `Modal` to carry the disabled reason. This
   is the one named workstream this cycle did not deliver.
2. **Amendment-9 range-toggle labels** — decide whether to accept the documented
   `Week/2 Weeks/Month` deviation or restore `Today/This Week/This Month`.
3. **Commit the working tree** — the prior cycle's atlas de-brittle fix + story QA
   annotations are correct but uncommitted.

### Distribution mechanics (unchanged from V3)
4. **Lib publish + repin (blocker).** `package.json` pins
   `loredex: file:../loredex/loredex-2.3.0.tgz` (a local tarball; the sibling
   `../loredex` is at **2.3.0**, not on npm). Push loredex `main`, `npm publish`,
   then repin the desktop app from the `file:` tgz to the published version
   (§2.2.1 in the task framing — the actual local lib is 2.3.0; repin to whatever ships).
5. **Signing + notarization — story 1-8 (`epic1.story8`, ready-for-dev).** Developer
   ID cert + secrets into `release.yml`, hardened runtime + notarize + staple.
   Human-gated on an Apple Developer account.
6. **Auto-update + channels + translocation — story 1-9 (`epic1.story9`,
   ready-for-dev).** Update feed, release channels, Gatekeeper path-translocation.
   Depends on (5).
