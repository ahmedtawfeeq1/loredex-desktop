# Atlas reframe — "read a project" (page) + "trace connections" (graph)

## Why
User feedback (with screenshots): the Atlas Overview AND Learn are unreadable — "I don't know how to read it or why it's useful." Root cause: a node-graph is the wrong metaphor for *understanding a project* (a reading task), and it doesn't self-explain. A graph only earns itself when the spatial relationship IS the question — i.e. tracing lineage. Decision (user-approved): **full reframe** — Learn becomes a readable project PAGE (no graph), the graph is reserved for Deep Dive + Path lineage, and Overview becomes a compact project launcher.

Grounded in the edge-model research (`docs/plan/atlas-graph-research.md`): progressive disclosure, layered/readable over abstract graphs, relations-as-list (Linear/GitHub). Keep DESIGN v2 dark aesthetic.

## The three levels after the reframe
- **Overview → Project launcher** (HTML, not SVG): a card grid of the vault's projects (name, `N notes · M open`, brief-freshness chip, last activity). Click a card → that project's Learn page. Keep the flow topology as an OPTIONAL secondary ("Flow view" toggle that shows the existing Overview graph) so the map isn't lost — but the default is the readable launcher.
- **Learn → Project page** (HTML, not SVG): a readable, scrollable page for one project. This replaces the Learn graph entirely.
- **Deep Dive → the graph** (keep AtlasCanvas SVG): lineage tracing across projects — notes/handoffs/source/commits/contracts and how they connect. This is where the spatial graph earns itself. Path + Blocked are its primary actions. Add a self-explaining purpose header + inline key.

## Learn "Project page" layout (the core deliverable)
Full-width readable page, DESIGN v2 cards (reuse Home/Reader patterns):
1. **Header**: project name (serif), `N notes · M open handoffs`, brief-freshness chip (fresh/stale/none → link to brief in Reader), last-activity relative date.
2. **Attention line** (only if open>0 or blocked): `M open handoffs · K blocked` → links to the Handoffs board (filtered to this project) / Blocked.
3. **Flows-with strip** (reuse `relationship-strip.ts` data): `Receives from: backend (4), ai-engine (1)` · `Sends to: backend (4), ai-engine (1)` as clickable chips → open that project's Learn page. Gold when the link has open handoffs.
4. **Topics** as sections: one section per topic (AGENT-CONFIG, STREAMING, …), heading = topic + count + newest date; body = that topic's notes as a compact card list/grid (humanized title, type/topic chips, excerpt, date) — click → Reader. The `handoffs` topic renders its handoff cards (reuse `HandoffCardView`: stamp + route + objective) — click → board card.
5. **"Trace connections →"** affordance → jumps to Deep Dive scoped to this project (the graph, for lineage) with Path armed.
Data source: the existing `atlas.graph` learn payload already carries this project's topics + note/handoff nodes; render them as HTML instead of SVG. (Or reuse dashboard.build project state + handoffs.list + vault.tree if cleaner — decide at build time; prefer the atlas data that's already scoped.)

## Overview "Project launcher" layout
- Card grid (responsive, reuse the Home project-health card style): project name + tint dot, `N notes · M open`, brief chip, last activity, a tiny in/out flow count. Click → Learn page. Keyboard + ⌘K reachable.
- A **"Flow view"** segmented toggle in the header → renders the existing Overview graph (AtlasCanvas) for users who want the topology. Default = launcher.

## Deep Dive framing (keep the graph, make it self-explain)
- Persistent one-line purpose header: "Trace how work and knowledge connect across your projects — click a node to open it, use Path to trace how one thing reaches another."
- A tiny always-visible inline KEY (arrow = handoff · thickness = volume · dot = open · dashed = affinity) instead of only the `?` legend modal.
- Path + Blocked are the primary CTAs.

## Navigation glue
- Overview card / launcher → `navigate('learn', {project})`.
- Learn "Trace connections" → `navigate('deep', {project})` (graph), optionally arm Path.
- Breadcrumbs reflect: vault › <project> (page) vs vault › <project> (graph). The Overview/Learn/Deep segmented control still switches levels.

## Reuse (don't reinvent)
- `relationship-strip.ts` (flows-with data), `HandoffCardView`, the Reader note-card + `humanizeTitle`, Home project-health card CSS, `useReader.open` / board `openBrief` / `setView`, the atlas store `navigate/drillProject/scope`, `atlas.graph` payload.
- Keep `AtlasCanvas` and all its recent fixes for Deep Dive (+ Overview flow-view toggle).

## Build slices (sequential workflow)
1. **WP1 Learn page**: new `views/atlas/ProjectPage.tsx` (+ pure data builder from the atlas.graph learn payload, unit-tested) rendering header/attention/flows/topics/handoffs; AtlasView routes `level==='learn'` → ProjectPage (not AtlasCanvas). Links out to Reader/board/Deep.
2. **WP2 Overview launcher**: new `ProjectLauncher.tsx` card grid; AtlasView routes `level==='overview'` → launcher by default; add a "Flow view" toggle that falls back to the AtlasCanvas Overview graph.
3. **WP3 Deep Dive framing**: purpose header + inline key on the graph; Path/Blocked primary.
4. **WP4 Nav glue + breadcrumbs + empty states** (fresh project, no handoffs).
5. **QA**: readable page verified on nimbus projects, launcher grid, deep graph intact, all atlas invariants (the graph tests) still green, real-vault eyeball.

## Verification
- Pure data-builder tests for the project page (topics/notes/handoffs/flows for nimbus-frontend + nimbus-backend from the fixture vault), launcher card data.
- Learn no longer renders the SVG canvas (assert ProjectPage mounts at learn); Deep Dive still renders AtlasCanvas; all existing atlas graph invariants green (they now guard Deep/flow-view only).
- Sequential gate (`--no-file-parallelism`), dev-launch eyeball, DMG rebuild + smoke.
