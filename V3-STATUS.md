# Loredex Desktop v0.2 (M3 hardening cycle) — Status

QA pass: 2026-07-10 (fresh-eyes QA agent). Per-story verdicts live in each story file's
QA Results section (`docs/stories/`); the board is `docs/stories/sprint-status.yaml`.
Scope of this pass: the M3 hardening cycle — epic 15 (15.1–15.4) plus the re-scoped 6.3
e2e release gate — and regression over the M1/M2 surface.

**Verdict: PASS. The app is feature-complete per BUILD-PLAN Amendment A1** (M0–M3 scope:
walking skeleton, reader/home, handoff lifecycle v2 + writing, live poller/watcher/app.db,
Vault Atlas, contract intelligence, GitHub layer, wizards, DESIGN v2, natives hardening,
perf, keyboard coverage, public docs). What remains before a public release is
distribution mechanics only (checklist below).

## Test matrix (all re-run solo by this QA pass)

| Gate | Result | Evidence |
|---|---|---|
| App vitest (`npm test`) | **528/528**, 67 files, ~30 s | unit + seam integration + native-smoke + perf + m2-e2e-drive |
| App vitest, final re-run post-QA-fixes | **549/549**, 68 files | +21 from a concurrent agent's story 15.5 commit (`7f484c7`, home insights — outside this QA's scope, see note below) |
| Lib vitest (`loredex` repo) | **144/144**, 22 files | includes the 6.3 activity-grammar addition |
| Typecheck (node + web) | **clean** | `npm run build` first stage |
| Production build (electron-vite) | **clean** | 389 modules, chunk warnings only (dynamic-import notices, non-blocking) |
| E2E release gate (`npm run test:e2e`) | **18/18**, ~25 s | 14-stage nimbus walk over the real IPC seam, sandboxed clones + real bare remotes |
| Perf (`tests/perf.test.ts`, 1,200-note vault) | **6/6 budgets green** | table below |
| Dev-launch smoke (40 s, time-boxed) | **PASS** | predev staging no-op → `app.db open` + `core host started` + `vault watcher armed`, 0 respawns, no manual electron-rebuild |
| Packaged smoke (`dist/mac-arm64/Loredex.app`, 31 s) | **PASS** | alive at 30 s, both native canaries on stdout, 0 respawns; asar.unpacked ships better-sqlite3 + @parcel/watcher |
| Plain-node ABI after dev launch | **intact** | `tests/native-smoke` 2/2 immediately after the Electron dev run |

Perf numbers (solo run; identical within noise to the story's recorded pass, and green
inside the full parallel suite too):

| Metric | Measured | Budget |
|---|---|---|
| cold vault open (handlers + notifier + tree + board) | 38.1 ms | 2,000 ms |
| tree build (walkVault, 1,200+ files) | 9.5 ms | 250 ms |
| search latency (vault.search, facet-narrowed) | 74.6 ms | 300 ms |
| atlas graph build (cold overview) | 665.4 ms | 2,000 ms |
| atlas projection (warm deep drill) | 20.2 ms | 300 ms |
| poller tick (no changes, min of 3) | 409.8 ms | 3,000 ms |

## M3 claims, independently verified

- **15.1 natives:** the dual-ABI staging works as documented — `npm run dev` needs no
  manual step, vitest keeps the plain-node ABI, and the packaged artifact boots its core
  host (app.db + watcher) for 30 s without a respawn loop.
- **15.2 perf:** budgets are asserted on the renderer-facing seam; the numbers reproduce.
  The YAML-Date `snoozed_until` crash fix is pinned by a regression test and the perf
  fixture deliberately keeps the hostile form.
- **15.3 keyboard:** the palette-coverage test is a real net (id + hint per action, combo
  uniqueness, all nine views, exactly one sanctioned palette hole). Five actions traced
  from registry to live store wiring; App shell, nav, palette and cheatsheet all consume
  the one registry.
- **15.4 docs:** every README/USER-GUIDE claim spot-checked against code (MCP port/
  discovery file/six tools, poller cadence, ⌘O menu, keyboard table, honest not-shipped
  list); all relative links resolve.
- **6.3 (re-scoped):** the module-level e2e suite is deterministic, fast, CI-wired, and
  now the named release gate. The windowed Playwright harness + update-check smoke remain
  future hardening (deliberate, board-visible).

## Regression

- **v0.1 five defects:** all still fixed and pinned — `brief-title.test.ts`,
  `feed-logic.test.ts`, `design-fidelity.test.ts` (reader measure + Sync/Settings
  density), `diagnostics.test.ts`. Green in this pass.
- **M2 QA fix (atlas contract-node resolution):** still holds — contract nodes resolve to
  the Contracts view pre-scoped to the file's project (`resolve.ts`; regression cases in
  `resolve.test.ts` green). Residual minor stands: timeline filters per-project, not
  per-file (documented honestly in the USER-GUIDE).

## Defects found in this QA pass (all small, all fixed in place)

1. `tests/perf.test.ts` — poller test title still said "< 1.5 s" from before the
   min-of-3 / 3 s re-spec; retitled (test behavior unchanged, re-run 6/6).
2. README + USER-GUIDE — Search facet list omitted `to` (the view and the `Facets` type
   ship six facets); added.
3. README — the `test:e2e` line no longer named the suite the release gate (6.3 AC3);
   phrase restored.

No structural defects found.

## Ops notes for future QA

- Running the app suite and the lib suite **concurrently** on one machine starves the
  git-subprocess-heavy tests into their 30 s timeouts (observed: 5 + 2 spurious failures;
  both suites fully green re-run sequentially). Run gates sequentially.
- A concurrent agent landed **story 15.5 (home insights, commit `7f484c7`)** during this
  pass, with further WIP untracked (`dashboard-data.ts`, a dashboard wireframe). Its 21
  tests pass, but 15.5 is NOT covered by this QA verdict and is not yet on the board —
  it needs its own story file entry + QA before release.

## Remaining release checklist (the ONLY items between here and a public v0.2)

1. **Lib 2.2.0 publish + repin (blocker):** push loredex main (3 local commits:
   `d92146d` write APIs, `7d7b9a6` previewRoute, `915cd86` activity grammar), release as
   **2.2.0**, `npm publish`, then repin `loredex-desktop/package.json` from
   `file:../loredex/loredex-2.1.0.tgz` to the published version
   (`tests/pinned-release.test.ts` guards the seam) and drop the CI sibling-checkout
   bootstrap in `.github/workflows/ci.yml`.
2. **Signing + notarization (story 1-8, blocker for distribution):** Developer ID cert
   secrets into `release.yml`, hardened runtime + notarize + staple. Human-gated on Apple
   Developer enrollment (BUILD-PLAN A1's only human gate).
3. **Auto-update (story 1-9):** electron-updater channels + translocation handling;
   unblocks the deferred update-check smoke.
4. **Release upload:** cut v0.2.0 — changelog from V2/V3 status, upload the signed DMG/ZIP
   to GitHub Releases (until 1-8 lands, builds stay unsigned with the `xattr` caveat the
   README documents).

Everything else on the board (1-5 async git, 1-7 proxy/doctor, 2-6 changed-since brief,
epic 4 routing safety/undo, 5-3/5-4/5-7 registry, windowed e2e harness) is post-release
hardening, not release-gating.

## UI polish (epic16)

QA pass: 2026-07-10 (fresh-eyes QA agent, M4 UI-polish cycle). Scope: epic16 stories
16.1–16.6 per DESIGN.md Addendum D1, plus regression over the pinned-defect surface.
Per-story verdicts live in each story file's QA Results section.

**Verdict: PASS — all six stories. No defects found; zero QA fixes needed.**

### Test matrix (all re-run solo by this QA pass, sequentially)

| Gate | Result | Evidence |
|---|---|---|
| Typecheck (node + web) | **clean** | `npm run typecheck` |
| App vitest (`npm test`) | **725/725**, 82 files, ~36 s | incl. the live nimbus drives (not skipped) |
| E2E release gate (`npm run test:e2e`) | **18/18**, ~26 s | 14-stage nimbus walk over the real IPC seam |
| Production build (electron-vite) | **clean** | chunk-size/dynamic-import notices only (pre-existing) |
| Dev-launch smoke (35 s, time-boxed) | **PASS** | `app.db open` + `core host started` + `vault watcher armed`, alive at 35 s, clean teardown |

### Per-story verdicts

- **16.1 reader full-bleed + wikilinks — PASS.** `.note` has no measure cap (`padding: 32px 32px 64px`, no max-width); `--wikilink` = `#8a6116` light / `#e0a83e` dark read straight from the stylesheet; duplicate-H1 strip and rust empty-reading-order states pinned. Lib root cause confirmed at loredex local commit `b5c3ffc` (empty `## Reading order` never written) — reaches the app at the already-tracked 2.2.0 repin.
- **16.2 collapsible rails — PASS.** ⌘\ 56px icon rail / ⌘⇧\ list→0 with chevrons both pane headers; per-vault app.db persistence proven isolated across vault ids (malformed degrades to expanded); both actions in the registry → palette + cheatsheet via the 15.3 coverage net; 160ms ease-out, reduced-motion off.
- **16.3 vault tree sections — PASS.** The exact 8 D1 tint hexes, FNV-1a-deterministic with pinned nimbus assignments (backend=slate, frontend=teal, mobile=sage, ai-engine=sand); 12% light / 20% dark `color-mix` verified in the sheet; 2px project rail with selection staying gold (border sanction list extended by exactly that rail); per-vault collapsed persistence green.
- **16.4 edit mode + inline comments — PASS.** Live nimbus drive re-run verbose by QA, 3/3 NOT skipped: edit+save round-trip with the frontmatter block **byte-identical**; comment note read via plain `cat` shows `type: comment` / `replies_to` / `anchor` / `author` — agents need zero tooling; anchor orphans on a second edit. Vault verified restored (HEAD `4f77cce`, porcelain clean).
- **16.5 atlas Learn/Deep density — PASS.** Drilled invariants proven on the REAL vault: nimbus-backend at learn fills > 0.5 with 18 members (the reported strip case), fitted cards ≥ 140px readable, chips ≥ 8px clear of pills; hidden atom members never inflate the panel; determinism and ALL pre-existing layout-v2 invariants intact at every level.
- **16.6 activity cards — PASS.** Card recipe + kind chips + relative time + middle-truncated paths + sha chips per D1; the real git-log fixture's 5-flip churn on `…-frontend-4` collapses to ×5 (ai-engine-2 → ×2, lone flips single, every event kept once); per-kind outline-pill actions max 2 with the consume gate correct (open inbound only); 14.2-2 `dedupeBySha` pins kept.

### Regression (all green in this pass)

- v0.1 five defects: `brief-title.test.ts`, `feed-logic.test.ts` (dedupeBySha), `design-fidelity.test.ts`, `diagnostics.test.ts` — the reader-measure pin is now the D1 full-bleed assertion (deliberate supersession, story 16.1).
- Atlas contract-node resolution (M2 QA fix): `resolve.test.ts` green — contract nodes still open the pre-scoped Contracts timeline.
- Atlas layout-v2 invariants: green at every zoom level on fixture AND real nimbus.
- Home dashboard (15.5): its insights suite green inside the 725.

### Notes

- **16.7 (editor v2 / CodeMirror) is done on the board but OUTSIDE this pass's scope** (task scoped to stories 1–6); it needs its own QA before release.
- The M3 ops note stands: run app + lib suites sequentially on one machine. This pass saw zero flakes at default worker count.
- The release checklist above (lib 2.2.0 publish + repin, signing, auto-update, upload) is unchanged by this cycle; `b5c3ffc` joins the lib commits awaiting the 2.2.0 push.
