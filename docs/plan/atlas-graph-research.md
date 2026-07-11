# Atlas graph — better concept for project-flow visualization (web research)

## The problem
Overview/Learn put a verbose `N open / M total` pill on **every** directed edge. In a small dense bidirectional graph (4 projects, both-direction handoffs) these pills collide with each other and overlap the node cards. Nudging (WP1) didn't solve it because the approach itself — a permanent label on every edge — is the wrong pattern for a dense graph.

## What the industry does (sourced)

**1. Progressive disclosure — no permanent edge labels; detail on hover.** This is the dominant pattern.
- Grafana's node-graph (the de-facto service-dependency viz): edges have **no permanent labels**; "Edges can also show statistics when you hover over the edge." Magnitude is encoded by **stroke thickness** + **color**; clicking opens details. Default layout is **Layered** ("predictable and orderly … useful for service graphs"). Source: https://grafana.com/docs/grafana/latest/panels-visualizations/visualizations/node-graph/
- Tom Sawyer (graph-viz vendor): permanent labels are "only advisable on very simple graphs"; use progressive disclosure (hover/click), and "selective label display that only reveals labels for edges connected to a node the user is hovering." Source: https://blog.tomsawyer.com/3-quick-ways-to-perfect-graph-edge-labels

**2. Encode magnitude on the edge, not in text.** Thickness ∝ flow, color for state. (Grafana, above.)

**3. Chord vs Sankey for bidirectional flow — chord looks good but reads worse.** CHI 2023 "Showing Flow": chord accepts bidirectional flow but participants were **slower, made more errors, and preferred Sankey/layered** directional layouts. Source: https://dl.acm.org/doi/10.1145/3544548.3581119. → A chord ring is *not* the right call for a work surface people scan quickly; keep the layered card layout.

**4. Layered auto-layout + floating/port edges.** React Flow/xyflow standard: dagre/ELK layered layout; **floating edges** connect at the nearest node handle so lines don't cross cards; labels rendered at the path midpoint only when needed. Sources: https://reactflow.dev/examples/layout/dagre , https://reactflow.dev/examples/edges/floating-edges , https://reactflow.dev/learn/customization/edge-labels

## Recommendation for loredex Atlas (hand-rolled SVG, no chart lib, no React Flow)

Keep the layered card layout (it's the right, readable choice per the research) but replace the edge-label model with the Grafana/service-graph pattern:

### Overview
- **Drop the per-edge `N open / M total` pills entirely** (remove `atlas-edge-badge`). This alone kills the collisions.
- **Encode flow on the edge:** stroke width ∝ `totalCount` (clamp ~1.5–5px); keep gold for blocking/open-heavy.
- **Tiny open-count badge only when it matters:** a small gold dot (~16px) with the open number near the **target** end, shown only when `open > 0`. Few of these → trivially collision-free. Total/consumed live in the tooltip.
- **Detail on hover:** hovering an edge (or a project) reveals a small floating callout `from → to · N open / M total` (upgrade the existing `<title>` hit-path to a styled callout), plus the existing neighborhood emphasis.
- **Port-based routing:** edges exit the source's right/near side and enter the target's near side through the wide gutter, never crossing a card. Widen Overview column spacing.
- **Bidirectional pairs:** two thin fanned directional edges (arrowheads show direction, width shows magnitude) — no labels, so no collision.

### Learn (focused project + neighbors)
- The crossing neighbor-edges into the detail panel are the mess. Replace them with a **relationship strip** in the panel header — compact chips: `← 3 from mobile · ← 2 from ai-engine · → 4 to frontend` (this is how Linear/GitHub show relations: a list, not crossing lines). Make any remaining neighbor connector thin, label-less, hover-only.
- Keep the topic sub-cards as-is (fixed in the last pass).

### Why this is right
- Matches the proven service-graph pattern (Grafana), which is exactly our shape (services/projects with directed flow).
- Removes the entire class of label-collision + label-on-card bugs by removing permanent labels.
- Keeps counts discoverable (badge for the urgent one = open; tooltip for the rest).
- Buildable in the existing SVG canvas: it's *less* geometry (no chip placement/de-collision), plus one hover callout and a width scale.

## Build slices (for a follow-up plan)
1. Remove aggregated-edge badges; add stroke-width scale + gold open-dot badge (target-side, open>0 only).
2. Hover callout for edges/projects (`from → to · N open / M total`), reusing the hover-neighborhood state.
3. Port-based edge anchoring + wider Overview spacing so lines never cross cards.
4. Learn relationship-strip chips in the panel header; thin/hover-only neighbor connectors.
5. Tests: no badge pills rendered; open-dot only when open>0; width monotonic in total; callout content; ports keep edges outside card rects. Keep all atlas invariants green.
