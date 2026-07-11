# Atlas edge-model redesign (WP A–D) — QA status

Fresh-eyes QA against `docs/plan/atlas-graph-research.md`. Test vault: `loredex-simulation/_machine2/nimbus-vault`.

**Verdict: SHIP.** All four work packages landed real code, the sequential gate is green, every research requirement is implemented and test-guarded, all regression invariants hold, and a live launch boots clean.

## 1. Commit landing

| WP | Commit | Landed |
|----|--------|--------|
| A — encode magnitude on the edge, remove aggregated pills | `5273042` | ✅ code present |
| B — hover detail callout for aggregated edges + projects | `ba6d988` | ✅ code present |
| C — port-based edge routing + wider Overview spacing | `a63dd95` | ✅ code present |
| D — Learn relationship strip + thin hover-only neighbor connectors | `32fec13` | ✅ code present |

Research doc committed at `f8e1e28`. Working tree clean.

## 2. Sequential gate

| Step | Result |
|------|--------|
| `npm run typecheck` | ✅ green (tsc node + web configs, no errors) |
| `npx vitest run --no-file-parallelism` | ✅ **1004 passed / 1004** (103 files, 82s) |
| `npm run build` | ✅ built (main/preload/renderer). Only pre-existing dynamic-import chunk warnings; no errors |

## 3. Research-spec verification

| Requirement (research) | Status | Evidence |
|---|---|---|
| NO permanent `N open / M total` pill renders anywhere | ✅ | `atlas-edge-badge` fully removed; `routeBadge` string appears only inside the hover callout. Guarded by `atlas-fidelity.test.ts` "renders no aggregated pill" (asserts canvas + all stylesheets free of `atlas-edge-badge` / `routeBadge`) |
| Edge stroke-width encodes total | ✅ | `edgeWidth(total)` = clamp(1.5–5, 1.5 + total·0.4); applied inline as `strokeWidth` on aggregated edges (`AtlasCanvas.tsx:168`). Test: `edgeWidth (WP-A)` monotonic non-decreasing + clamped |
| Gold open-dot ONLY when open>0, target-side | ✅ | `dot = aggregated && !quiet && openCount > 0 ? openDotAt(points) : null` (`AtlasCanvas.tsx:169`); `openDotAt` backs off the routed end toward the target. Test: `atlas-fidelity` "draws the gold open-count dot ONLY when open > 0" |
| Hover callout `from → to · N open / M total` | ✅ | `edgeCallout()` → `${from} ⟶ ${to} · N open / M total`; wired to edge hit-path onMouseEnter/Move/Leave; project cards get `projectFlowCallout` (`N in / M out`). Rendered as floating `.atlas-callout` overlay; `<title>` kept as a11y fallback |
| Edges never cross card interiors (port routing) | ✅ | `edgePorts()` anchors both ends on the near side facing the target; `orthoRoute` routes elbows only through card-free gutter/corridor channels. Test: `port routing keeps every edge outside all cards (WP-C DoD)` — nimbus fixture, no routed segment intersects any card interior |
| Wider Overview spacing | ✅ | `OVERVIEW_GUTTER=216`, `OVERVIEW_V_GAP=72` (grid-aligned, ≤ GUTTER×1.5) |
| Learn relationship strip present + correct | ✅ | `relationshipStrip()` derives inbound `← N from <proj>` / outbound `→ N to <proj>` from aggregated route edges; self-routes ignored; sorted biggest-flow-first; open lanes gold, blocking flagged; chip click drills the neighbor. Rendered only at Learn with a focused project. Test suite `atlas-relationships.test.ts` (152 lines) |
| Neighbor connectors thin / hover-only at drilled level | ✅ | `quiet={level !== 'overview' && edge.category === 'route'}` → drops width/open-dot/callout, keeps hover emphasis only |
| Dead pill / de-collision code + tests removed | ✅ | No `atlas-edge-badge`, no de-collision/nudge/badge-placement code remains (grep clean). `atlas.test.ts` and `atlas-geometry.test.ts` shed the old badge-placement tests (net −281/−170 lines in WP-A). Only negative-assertion references to `atlas-edge-badge` remain, in fidelity tests |

## 4. Regression matrix

Full suite 1004/1004 green; atlas subset re-run in isolation: **15 files / 211 tests passed**.

| Invariant | Suite | Result |
|---|---|---|
| Card no-overlap | `atlas.test.ts`, `atlas-geometry.test.ts` (`rectsOverlap`) | ✅ |
| Sub-card containment + reserved footer band | `atlas-subcards.test.ts` | ✅ |
| Order-chip recency (chip order = recency order) | `atlas.test.ts` / `orderChips` | ✅ |
| Fill-ratio / panel wrap | `atlas-subcards.test.ts` (`panelWrapRows`) | ✅ |
| Design-fidelity (no pills, gold dot, callout recipe, zoom stack) | `atlas-fidelity.test.ts` | ✅ |
| Fit (zoom-to-fill, readable floor) | `atlas-geometry.test.ts` | ✅ |
| Gestures (wheel pan / pinch zoom / clamp) | `atlas-zoom.test.ts` | ✅ |
| WP2 affinity-off by default | `atlas-filters.test.ts` | ✅ |

## 5. Launch smoke (live boot)

`npm run dev` against the nimbus-vault: main process built, preload built, renderer dev server up on `:5173`, Electron app started, core host started, vault watcher armed. No crash, no exceptions.

- Benign noise: repeated `error: No such remote 'origin'` — the git poller against the test vault, which has no `origin` remote. Unrelated to Atlas.

## Defects

None found. No fixes applied.

## Deferred / notes

- Build emits pre-existing dynamic-import chunk warnings (`api.ts`, `stores/app.ts`, `stores/toasts.ts` dynamically imported by `atlas/export.ts` while also statically imported elsewhere) and the 2.4 MB renderer bundle is over Vite's 500 kB chunk hint. Both pre-date this redesign and are non-blocking.
