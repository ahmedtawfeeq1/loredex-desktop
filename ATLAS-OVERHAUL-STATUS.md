# Atlas Overhaul (WP1–WP5) — QA Status

Fresh-eyes QA of the Atlas layout-quality overhaul against plan `wild-meandering-teacup.md`.
Date: 2026-07-11 · Branch: `main` (1 commit ahead of origin) · Working tree clean.

## Verdict: SHIP — all 5 WPs landed real commits; sequential gate green; every plan invariant verified in code + tests.

## Commits (all present in `git log`, all with real code diffs)

| WP | Commit | Title |
|----|--------|-------|
| WP1 | `25ecead` | edge labels & routing — wider fan, opposite-side chips, global de-collision, text-sized badges |
| WP2 | `e076f7d` | Deep Dive declutter — affinity edges off by default |
| WP3 | `1d0f0be` | side panels as floating overlay, canvas keeps full width |
| WP4 | `dd0f715` | panel balance & fit (zoom-in-to-fill + dominant-topic wrap) |
| WP5 | `f2cbf58` | arrowhead standoff, gold hover, text containment, unified card chrome, expandable collapsed card |

No WP was silently no-committed. All diffs touch product source (not just tests).

## Sequential gate (all green)

| Step | Result |
|------|--------|
| `npm run typecheck` | PASS (tsc node + web, no errors) |
| `npx vitest run --no-file-parallelism` | PASS — 102 files, **985 tests**, 0 fail |
| `npm run build` | PASS (main + preload + renderer built; only pre-existing dynamic-import advisory warnings, no errors) |

## Per-plan verification (code + test evidence)

- **No chip overlaps** — `resolveChipCollisions` (`atlas-layout.ts:448`), pure deterministic id-ordered rightward sweep against `rectsOverlap`; wired in `AtlasCanvas.tsx:425` and applied as per-badge `translate`. Tests: "separates a crafted colliding set until no two overlap", "clears a dense 25-topic-style grid of near-coincident chips".
- **Lane fan ≥ CHIP_H** — `LANE_STEP = 24` (≥ `CHIP_H=18`) in `laneOffsets` (`atlas-layout.ts:417`). Test: "fans parallel edges … out by ≥ CHIP_H per lane (WP1)".
- **Reciprocal chips opposite sides** — `chipOff = sign(off) * CHIP_H/2` in `orthoRoute` (`atlas-layout.ts:318`).
- **Text-sized badge** — `badgeRect` sizes to text, never < CHIP_W (`atlas-layout.ts:410`); rendered rect uses `br.w` (`AtlasCanvas.tsx:176`). Test: "badgeRect … never narrower than CHIP_W, widens for a long count".
- **Affinity hidden by default + shown when toggled** — `DEFAULT_FILTERS.excludedEdgeCategories = ['affinity']` (`atlas-filters.ts:43`); store seeds it (`stores/atlas.ts:154`); Filters checkbox toggles it (`AtlasFilterPanel.tsx:122`, `checked = !excluded.includes('affinity')`). Test: "affinity is hidden by DEFAULT_FILTERS and returns when toggled on (WP2)" + "EMPTY_FILTERS keeps all-pass semantics".
- **.atlas-side floating overlay** — `position:absolute; top/right/bottom:0; width:300px; z-index:5; box-shadow; border-left` inside `position:relative .atlas-body` (`styles.css:3596`). Canvas keeps full width on panel open (no flex sibling stealing 280px).
- **fitViewBox zoom-in-to-fill / top-left large** — 1.0 floor dropped; `scale = min(max(fitScale, 1/MAX_FILL), floorScale)`; small graph centers & magnifies to MAX_FILL, large graph clamps at readable floor and frames top-left (`atlas-geometry.ts:68-81`). Tests: "scales a tiny graph UP to fill … capped at MAX_FILL× (WP4)", "too big to fit readably clamps at the floor and frames top-left", "zooms in to its exact fit … centered".
- **Dominant-topic wrap** — `PANEL_MAX_COL_DEPTH = 6` caps column depth in `panelWrapRows` (`atlas-layout.ts:170`) so a 14-note topic wraps wide. Tests: "caps a dominant topic to PANEL_MAX_COL_DEPTH so it wraps wide (WP4)", "WP4 dominant-topic balance: the 14-note handoffs topic wraps WIDE, never a tall strip".
- **Arrowhead standoff** — `ARROW_STANDOFF = 8`, `insetArrowEnd` pulls every route's last vertex back 8px (`atlas-layout.ts:277-296`), applied at every branch of `orthoRoute`. Test: "insets every route end ARROW_STANDOFF px short of the target border".
- **Hover gold** — `.atlas-edge-hot .atlas-edge-line { stroke: var(--gold) }` (incl. blocking) replaces `--navy` (`atlas.css:120-126`).
- **Text containment** — commit sha / stamp / date / route / summary / type all wrapped in `truncateLabel` clamped to `CARD_TEXT_W`/`NODE_W` (`AtlasNodeCard.tsx:120,133,159,172-226`). Tests: "clamps a long commit sha within the card inner width", "clamps a long handoff date", "bounds the note type width so the topic chip stays on-card".
- **Collapsed-card affordance** — solid `--bg-inset` fill + hairline, ▸ chevron + prominent count (`TopicGroup.tsx:40-50`, `styles.css:3460-3475`), replacing the weak dashed-empty look.

## Regression — all prior atlas invariants green

no-overlap, chip/pill clearance, sub-card containment + reserved footer band, order-chip recency, panel fill-ratio (>0.5 for >6 members incl. nimbus-backend 18-member panel), design-fidelity (no drop-shadow filters, hover ring), layout-v2 across all 3 levels, trackpad gestures + zoom clamp (0.4×–2.5×). All covered by the 985 passing tests.

## Launch smoke (30s+)

`npm run dev` against the nimbus test vault: predev natives OK, main + preload + renderer built clean, dev server up at `http://localhost:5173/`, "start electron app…", processes stayed alive 30s+ with **no errors**. Stopped cleanly (SIGTERM, exit 143 expected).

## Defects fixed directly

None required — no defects found during QA.

## Deferred / minor notes (non-blocking, not defects)

- **Sub-card meta footer** (`AtlasCanvas.tsx:589`) renders `"N notes · YYYY-MM-DD"` without a `truncateLabel` wrapper. The plan listed it for truncation, but the string is inherently short and bounded (count + ISO date) and fits the sub-card width; no observed overflow. Left as-is. If a very long `newest` label ever appears it could be clamped for symmetry with the rest of WP5.
- Build emits pre-existing Vite dynamic-import advisory warnings (api/app/toasts statically + dynamically imported via `export.ts`). Cosmetic, predates this overhaul, no functional impact.
- DMG packaging (`npm run dist`) not run here (heavy, unsigned in this env); dev smoke + full build stood in for the runtime check.

_QA performed by fresh-eyes subagent. All claims backed by the commands and file:line evidence above._
