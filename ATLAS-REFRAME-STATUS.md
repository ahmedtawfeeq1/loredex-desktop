# Atlas Reframe — QA Status (WP1–WP4)

Fresh-eyes QA of the Atlas reframe against `docs/plan/atlas-reframe.md`.
Test vault: `loredex-simulation/_machine2/nimbus-vault`.

**Verdict: PASS — all four work packages landed, all gates green, spec conformant, no defects.**

## 1. Commit landing (git log)

| WP | Scope | Commit | Landed |
|----|-------|--------|--------|
| WP1 | Learn → readable project PAGE (not SVG) | `3bfd097` | ✅ |
| WP2 | Overview → project LAUNCHER (Flow-view toggle) | `0ea9a39` | ✅ |
| WP3 | Deep Dive self-explains (purpose header + inline key, Path/Blocked primary) | `c8de456` | ✅ |
| WP4 | Nav glue (pure level→renderer) + empty states | `a85cff3` | ✅ |

No WP's code is absent. New source: `ProjectPage.tsx` + `project-page.ts`, `ProjectLauncher.tsx` + `launcher-cards.ts`, `DeepDiveIntro.tsx` + `deep-dive-intro.ts`, `atlas-renderer.ts`. Working tree clean.

## 2. Sequential gate

| Gate | Command | Result |
|------|---------|--------|
| Typecheck | `npm run typecheck` | ✅ exit 0 (node + web projects) |
| Tests | `npx vitest run --no-file-parallelism` | ✅ 111 files / 1049 tests passed (129.6s) |
| Build | `npm run build` | ✅ exit 0 (main + preload + renderer) |

Build emits 3 pre-existing `vite:reporter` dynamic-vs-static import advisories (api.ts / stores/app.ts / stores/toasts.ts via export.ts) — warnings, not errors, unrelated to the reframe.

## 3. Spec conformance (source verified)

- **Learn = readable page, not SVG** — `AtlasView` routes `level==='learn'` → `<ProjectPage>` via pure `atlasRenderer()` (`'page'`); AtlasCanvas is never mounted at Learn. Page renders serif header + `N notes · M open handoffs` + brief-freshness chip + last-activity, attention line, flows-with strip (`Receives from` / `Sends to` chips from `relationshipStrip`), one section per topic (newest-first, `handoffs` folder excluded), and a handoffs section via `HandoffCardView`. ✅
- **Learn navigation** — note card → `openNote` (Reader); handoff card → `openBoard` (board filtered to project); flow chip → `drillProject` (that project's Learn); "Trace connections →" → `navigate('deep', {project})` **with Path armed** (`setPanel('path')`). ✅
- **Overview = launcher grid by default** — routes `'overview'` → `<ProjectLauncher>` (`atlasRenderer` → `'launcher'`); reuses Home `ops-health` card style, tint dot, `N notes · M open`, in/out flow badges, brief chip, last date; card click/Enter/Space → `navigate('learn', {project})`. Flow-view segmented toggle (`atlas-flow-toggle`, Overview only) flips to `'graph'` → AtlasCanvas. ✅
- **Deep Dive keeps the graph, self-explains** — `<DeepDiveIntro>` (persistent purpose header + always-visible inline key: arrow/thickness/dot/dashed) renders above `<AtlasCanvas>` only at `level==='deep'`; Path + Blocked pills get `atlas-tool-primary` (gold) only at deep. ✅
- **Empty states clean** — whole-vault empty → "Nothing to map yet"; fresh project → "Nothing filed for <project> yet"; launcher empty → "No projects yet"; flows strip + handoffs section hide when empty. ✅

## 4. Regression — graph invariants (all green)

Confirmed passing test files (19 atlas files / 190 tests):
- No-overlap: `atlas-geometry` — "no routed segment intersects any card interior".
- Port routing edges-off-cards: `atlas-geometry` — "anchors each end on the near side", "insets every route end ARROW_STANDOFF px short of the target border".
- Open-dot clears arrow: `atlas-fidelity` — "draws the gold open-count dot ONLY when open > 0" (+ prior fix `d3327b1`).
- Affinity-off: preserved in AtlasView deep decor; `atlas-filters` green.
- Fit: `atlas-zoom` — fits/clamps/scale-up-to-fill/degrade cases.
- Gestures: `atlas-zoom` — pan/wheel/pointer-clamp band cases.
- Design fidelity: `atlas-fidelity` — hairline borders, gold hot edges, no drop-shadow filter, floating panel.
- Routing DoD: `atlas-view-learn` / `atlas-view-overview` / `atlas-view-deep` / `atlas-renderer` / `atlas-nav` pin every level→surface cell.

## 5. Launch smoke (30s)

`npm run dev` — Electron main + preload + renderer built successfully; core host started against the nimbus vault, vault watcher armed, no renderer crash / uncaught exception in logs. The repeated `error: No such remote 'origin'` lines are the test vault's git-sync poller (the fixture repo has no remote), unrelated to the reframe.

## Defects

None. No fixes applied.

## Deferred / notes

- Pre-existing build-time dynamic-import advisories (3) — cosmetic, predate this work.
- Renderer UI was smoke-verified at the source + boot level (headless subagent); no pixel eyeball of the live launcher/page/graph performed.
