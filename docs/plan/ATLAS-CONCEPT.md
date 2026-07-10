# Vault Atlas — Concept Analysis & Translation

**Source analyzed:** [Egonex-AI/Understand-Anything](https://github.com/Egonex-AI/Understand-Anything) (MIT, ~2026), a Claude Code plugin that turns a codebase into an interactive knowledge graph dashboard.
**Purpose of this doc:** extract the *concepts* that made that tool work and map them onto loredex desktop as a "Vault Atlas" view. We port **zero code** — their stack is React Flow + ELK + Zustand + an LLM analysis pipeline; ours is Electron + vanilla SVG per `docs/DESIGN.md`, with an edge model computed in the core host. All claims below are verified against their source; file paths cited are repo-relative under `understand-anything-plugin/`.

---

## 1. What Understand-Anything actually does (verified from source)

### 1.1 Graph model — one JSON artifact

The entire product is a single `knowledge-graph.json` (written to `.understand-anything/` in the analyzed repo) consumed by a static dashboard. Schema in `packages/core/src/types.ts`:

- **`GraphNode`** — `{ id, type, name, filePath?, lineRange?, summary, tags[], complexity: "simple"|"moderate"|"complex", languageNotes?, domainMeta?, knowledgeMeta? }`. **21 node types**: 5 code (`file`, `function`, `class`, `module`, `concept`), 8 non-code (`config`, `document`, `service`, `table`, `endpoint`, `pipeline`, `schema`, `resource`), 3 domain (`domain`, `flow`, `step`), 5 knowledge-base (`article`, `entity`, `topic`, `claim`, `source`).
- **`GraphEdge`** — `{ source, target, type, direction, description?, weight: 0–1 }`. **35 edge types in 8 categories** (the category map lives in `packages/dashboard/src/store.ts` `EDGE_CATEGORY_MAP`): structural (`imports`, `exports`, `contains`, `inherits`, `implements`), behavioral (`calls`, `subscribes`, `publishes`, `middleware`), data-flow (`reads_from`, `writes_to`, ...), dependencies (`depends_on`, `tested_by`, `configures`), semantic (`related`, `similar_to`), infrastructure (`deploys`, `serves`, `documents`, `routes`, ...), domain, knowledge (`cites`, `contradicts`, `builds_on`, ...). Filtering happens at the *category* level, not per-type.
- **`Layer`** — `{ id, name, description, nodeIds[] }` — a named logical grouping (e.g. "API Layer") that also drives navigation.
- **`TourStep`** — `{ order, title, description, nodeIds[], languageLesson? }`.
- Root **`KnowledgeGraph`** — `{ version, kind, project meta, nodes, edges, layers, tour }`.

Takeaway: **nodes, edges, layers, and tour are one self-contained document**; the dashboard is a pure function of it. IDs are typed-prefixed strings (`file:src/main.tsx`, `document:README.md`, `layer:api-layer`).

### 1.2 How summaries are produced — LLM pipeline over a deterministic skeleton

`skills/understand/SKILL.md` defines a 7-phase multi-agent pipeline:

1. **SCAN (deterministic):** `scan-project.mjs` + per-language extractors (`packages/core/src/plugins/extractors/*`, tree-sitter based, 40+ language configs) produce a file list and a **pre-resolved import map** — no LLM.
2. **BATCH (deterministic):** `compute-batches.mjs` groups files into semantic batches using the import graph (Louvain-ish cliques; fixtures in `tests/skill/understand/`).
3. **ANALYZE (LLM):** up to 5 concurrent `file-analyzer` subagents (`agents/file-analyzer.md`) read the actual files in each batch and emit nodes (with `summary`, `tags`, `complexity`) and edges. Crucially, import edges are *injected* pre-resolved — the LLM writes prose, not parse results.
4. **MERGE (deterministic):** `merge-batch-graphs.py` normalizes IDs, dedupes, drops dangling edges, canonicalizes `tested_by` direction.
5. **ARCHITECTURE (LLM, heuristic fallback):** `architecture-analyzer` names layers; fallback `packages/core/src/analyzer/layer-detector.ts` maps directory segments to canonical layers (`routes|controller|api → "API Layer"`, etc.).
6. **TOUR (LLM, heuristic fallback):** see 1.5.
7. **REVIEW + SAVE**, with incremental updates keyed on `git diff <lastCommit>..HEAD` and content fingerprints (`fingerprint.ts`, `staleness.ts`).

Takeaway: **deterministic structure extraction + LLM prose on top, merged and validated deterministically.** The dashboard itself never calls an LLM.

### 1.3 Cluster layout — two-stage, containers derived at render time

- **Containers** (`packages/dashboard/src/utils/containers.ts`): within a layer, nodes are grouped by **first folder segment after stripping the longest common directory prefix**; if that yields fewer than 2 buckets or one bucket holds >70% of nodes, fall back to **Louvain community detection** (`louvain.ts`) over the edge graph. Single-child containers are dissolved.
- **Layout** (`utils/layout.ts`, `elk-layout.ts`, `layout.worker.ts`): ELK "layered" algorithm, direction DOWN, orthogonal edge routing, run in a Web Worker. **Two-stage:** Stage 1 lays out containers as collapsed atoms; Stage 2 lays out a container's children *lazily on expand*, caching child positions per container (`containerLayoutCache` in `store.ts` — invalidated aggressively whenever filters/level/persona change). Knowledge-mode graphs use d3-force with per-community radial attraction instead (`applyForceLayout`).
- Edges between collapsed containers are **aggregated with counts** (`utils/edgeAggregation.ts`).

Takeaway: never lay out the whole graph at once. Collapsed cluster atoms + lazy per-cluster expansion + aggregated inter-cluster edges is the scaling trick.

### 1.4 "Zoom levels" — discrete navigation states, not camera zoom

`store.ts`: `navigationLevel: "overview" | "layer-detail"` (overview shows layer cluster cards; `drillIntoLayer` opens one layer's nodes), plus orthogonal dials: `detailLevel: "file" | "class"` (optionally show functions), `persona: "non-technical" | "junior" | "experienced"` (filters node types), `viewMode: "structural" | "domain" | "knowledge"`, and **focus mode** (`focusNodeId` isolates a node's 1-hop neighborhood). Breadcrumbs + a bounded node-history stack (`MAX_HISTORY = 50`) make it feel like browsing, not panning.

### 1.5 Tour mechanics

- Tour steps live *in the graph document*. Generation: the `tour-builder` LLM agent (`agents/tour-builder.md`) is required to first run a **graph topology script** (fan-in ranking = importance, fan-out, entry points, dependency chains) and then write 5–15 pedagogical steps referencing only real node IDs, starting from README/entry point ("the tour should tell the same story the README tells, but through the lens of actual code structure" — SKILL.md Phase 5). Deterministic fallback `analyzer/tour-generator.ts` `generateHeuristicTour`: Kahn topological sort from zero-in-degree entry points, grouped by layer (or batches of 3), concepts appended as a final "Key Concepts" step.
- Playback (`store.ts` `startTour`/`setTourStep`/`nextTourStep`): each step sets `tourHighlightedNodeIds`, **auto-navigates to the layer containing the step's first node** (`navigateTourToLayer`), resets stale layout caches when the layer changes, pulses highlighted node cards (`CustomNode.tsx` `isTourHighlighted` ring), and fits the viewport to the highlighted set (with a "Computing layout…" overlay while lazy Stage-2 layout materializes — `tourFitPending`). `LearnPanel.tsx` shows title/description/prev/next.

Takeaway: a tour is **an ordered list of (title, prose, nodeId[]) that drives the same navigation primitives a user has** — nothing more.

### 1.6 Search, filters, path tracing, node cards

- **Search** (`packages/core/src/search.ts`): Fuse.js fuzzy over weighted fields (`name` 0.4, `tags` 0.3, `summary` 0.2, `languageNotes` 0.1), space-separated tokens OR-joined. Results tier the highlight ring by score (`CustomNode.tsx`). **Semantic search is scaffolded but not wired**: `embedding-search.ts` implements cosine similarity over pre-computed embeddings, but `store.ts` says "Currently both modes use the same fuzzy engine".
- **Filters** (`utils/filters.ts`, `FilterPanel.tsx`): node types, complexities, layer membership (any-layer-wins via a precomputed `nodeId → Set<layerId>` index), edge *categories*; plus coarse node-category toggles.
- **Path tracing** (`components/PathFinderModal.tsx`): plain **BFS shortest path over a bidirectional adjacency list** between two picked nodes; the resulting path is rendered as a clickable node chain.
- **Node card** (`CustomNode.tsx`): left color bar by type, uppercase type label, `complexity` chip, "tested" dot when tagged, truncated name, 2-line summary, ring states for selected/tour/search-tier/diff-changed/diff-affected, fade for non-neighbors when something is selected.
- Extras: diff overlay (changed vs affected node sets from `/understand-diff`), export menu, keyboard shortcuts, i18n, themes.

---

## 2. Concept translation: Understand-Anything → loredex Vault Atlas

The deep structural difference: UA must *infer* structure from source code (hence tree-sitter + LLM pipeline). **Loredex already has explicit structure** — `projects/<name>/<topic>/<note>.md` folders, typed frontmatter, handoff routes, provenance fields, wikilinks, git history. Our "analysis pipeline" is mostly *reading indexes we already build*. That deletes ~70% of their system while keeping 100% of the UX ideas.

| Understand-Anything concept | Verified source | Vault Atlas equivalent |
|---|---|---|
| `knowledge-graph.json` single document | `types.ts` `KnowledgeGraph` | `AtlasGraph` built in the **core host** as a recomputed cache (architecture.md State Placement: link graph = derived, never authoritative). One IPC call returns nodes+edges+clusters+tours. |
| 21 node types | `types.ts` `NodeType` | **6**: `project` (cluster), `note` (title/type/topic/date/status chips), `handoff` (stamp + `from ⟶ to` route), `contract` (openapi/postman/graphql file in a registered repo), `source` (real repo file reached via `source_path`/`source_project`/`source_rel` provenance), `commit` (commit/PR, from activity + contract scan). |
| 35 edge types / 8 categories, filtered by category | `types.ts` `EdgeType`, `store.ts` `EDGE_CATEGORY_MAP` | **6 categories**: `route` (handoff `from_project → to_project`), `thread` (`replies_to`, `fulfills` — schema v2, architecture-m2.md §1), `wikilink` (body links incl. reading orders, resolved via core `links.ts` shortest-path), `provenance` (note → source file), `contract-link` (contract change ↔ handoff, carrying the m2 §5 `confidence: 'mentioned' | 'heuristic'` tier — heuristic edges render dashed/`--text-2`, exactly like m2 mandates labeling them), `affinity` (same-topic, same project or cross-project — the only *computed* edge type, weight = shared topic). |
| Layers (LLM-named, heuristic fallback) | `layer-detector.ts`, Phase 4 | **Projects.** No inference needed — the vault's `projects/*` folders *are* the layers. Zero-LLM, zero-heuristic. |
| Containers (folder LCP grouping, Louvain fallback) | `containers.ts` | **Topic folders** within a project (`streaming/`, `channels/`, `handoffs/`...). Again explicit. Keep their *single-child suppression* and *collapsed-atom* ideas; drop Louvain (our buckets always exist). |
| Two-stage lazy layout + per-container cache + aggregated inter-cluster edges | `store.ts` caches, `edgeAggregation.ts` | Same concept, drastically simpler: Overview never renders note-level nodes, so Stage-2 cost is one project's notes at a time. Aggregate route edges between collapsed projects as `N open / M total` gold-badged arrows. |
| Zoom = discrete nav states (`overview`/`layer-detail` + detail dial + persona) | `store.ts` | **Overview** = project cluster cards + aggregated handoff-flow edges (who owes whom). **Learn** = one project (or topic) opened: topic groups, key notes, tour affordances. **Deep Dive** = every note/contract/source/commit node and every edge for the current scope. Keep breadcrumbs + node-history stack verbatim as concepts. |
| Focus mode (1-hop isolate) | `store.ts` `focusNodeId` | Identical — click "focus" on any card to fade everything but its neighbors. |
| Complexity chip / tested dot | `CustomNode.tsx` | **Status chips we already have**: handoff stamp (OPEN gold / ACCEPTED navy / DECLINED-STALE rust / CONSUMED `--text-2` — DESIGN.md routing-slip spec), note `type` chip, freshness (stale = rust per DESIGN token rules). |
| LLM per-file summaries | Phase 2 file-analyzer agents | **Not needed.** Notes are already prose with an objective/title/first-paragraph; card summary = objective (handoffs) or first body sentence (notes). No generation step at all. |
| Guided tour (LLM builds 5–15 steps; heuristic topo-sort fallback; playback highlights + auto-navigates + fits) | Phase 5, `tour-generator.ts`, `store.ts` tour actions | **Tours = interactive form of curate reading orders.** Every handoff already carries a `## Reading order` list of wikilinks (verified in nimbus-vault handoffs) — that IS a tour: step k = note k, description = why it's next (from the handoff body). Also derivable: per-topic tour (date-ordered notes + closing handoffs) and thread tour (walk `replies_to`/`fulfills` chain). Playback mechanics ported conceptually 1:1: highlight step nodes, auto-open the owning project cluster, fit viewport, prev/next. |
| Fuzzy search (Fuse over name/tags/summary) driving graph highlights | `search.ts`, store | Reuse existing `vault.search` (already in the IPC contract); Atlas subscribes to the same Cmd+K palette and tiers node highlight rings by hit score. |
| Path finder (BFS bidirectional) | `PathFinderModal.tsx` | Same BFS, better question: "how did this decision reach that repo?" — a path from a note through handoff → consume → contract change → commit is a *provenance story*, rendered as a routing-slip chain. |
| Diff overlay (changed/affected) | store diff state | **Changed-since overlay** from `activity.feed` + poller events: notes touched since a date/sha glow, their 1-hop neighbors ring. |
| Personas, themes, i18n, mobile | various | Skip. DESIGN.md tokens already cover theming. |

---

## 3. The HYPERLINK-EVERYTHING rule

UA's dashboard is largely terminal — clicking a node shows an info panel; only `CodeViewer` reaches the real file. Vault Atlas inverts this into a hard rule:

> **Every node in the Atlas resolves somewhere real in one click. If a node type has no resolution target, it doesn't get to be a node.**

The Atlas is a *map of things that exist*, never a dead-end visualization. Resolution table (binding):

| Node type | Click resolves to | Mechanism |
|---|---|---|
| `note` | **Reader view** on that note | existing `vault.readNote` + reader route; marks read via `readState.mark` |
| `handoff` | **Handoff board card** (thread rail expanded) | handoffs view + `handoffs.thread`; stamp chip on the Atlas card mirrors board state live via `handoff.stateChanged` events |
| `source` (provenance) | **Editor deep link** into the real repo file | loredex editor config scheme (`editor: system\|vscode\|cursor\|windsurf\|custom` → `<scheme>://file/<abs>[:line]`). Resolve `source_project` + `source_rel` against this machine's project-roots map (m2 §5) *first*, falling back to the recorded absolute `source_path`; if neither exists locally → disabled state with "repo not on this machine" + copy-path affordance. Never a silent dead click. |
| `contract` | **Contract timeline** filtered to that file; a specific change opens the **unified diff** | `contracts.timeline` / `contracts.diff` (m2 §8) |
| `commit` / PR chip | **GitHub** commit or PR page in the default browser | `src/core/github.ts` remote normalization → `<base>/commit/<sha>`; PR via `github.prForCommit` (gh CLI, degrade to plain commit link) — non-GitHub remotes render mono text + copy-sha, per m2 §6 |
| `project` (cluster) | **Drill into the cluster** (Learn level); secondary action → registry/company overview entry | Atlas navigation itself + registry view |
| `route`/`thread` edge | the **handoff** that created it (board card) | edge click = click its handoff node |
| `contract-link` edge | the **diff** on one end, the **handoff** on the other | direction of click |
| tour step | performs the note/handoff resolution of its first node | same table, recursively |

Corollaries: every resolution is also keyboard-reachable and listed in ⌘K (DESIGN quality floor); external jumps (editor, GitHub) get the standard outbound affordance; nothing in the Atlas ever opens a modal that merely *describes* a thing reachable elsewhere in the app.

---

## 4. What we deliberately do NOT adopt

1. **Code-level import parsing of source repos** (their tree-sitter WASM extractors, 40+ language configs, scan/batch/merge pipeline — the majority of their codebase). Our graph's atoms are vault notes with explicit frontmatter edges; source files enter *only* via provenance pointers. Parsing team repos would violate the product boundary (loredex maps the *knowledge about* repos, not the repos), double our maintenance surface, and reproduce what UA already does well — a team that wants code-level graphs can run UA on the repo itself. Same reasoning excludes the LLM summarization pipeline: our summaries are already written by the humans/agents who authored the notes.
2. **Semantic embeddings in v1.** Instructive precedent: UA built `embedding-search.ts` and never wired it — their store still routes "semantic" mode to Fuse (verified comment in `store.ts`). Our corpus (hundreds of notes, not 200k LOC) is well inside fuzzy-search territory, and `vault.search` already exists. Revisit only if search feels blind at real vault scale.
3. **React Flow / ELK / dagre / d3-force.** DESIGN.md is binding: SVG, no chart lib, nodes are mini routing-slip cards, left→right by dependency depth. Their layout machinery exists to handle 10k-node graphs with unknown topology; ours has known topology (project → topic → note) and 2–3 orders fewer nodes. A deterministic column layout (projects by route-dependency depth, topics stacked, notes date-sorted) beats a physics engine for legibility and is diffable in tests. We *do* keep the ideas ELK was serving: collapsed cluster atoms, lazy expand, aggregated edges, layout off the UI thread if it ever measurably matters (core host can precompute positions — the renderer stays logic-light).
4. **Personas, view-mode trinity, i18n/theming systems, mobile layouts** — solved differently or out of scope for a macOS desktop app with a binding design system.

---

## 5. Implementation notes for our stack

**Placement (per architecture.md rules):**
- **Edge model lives in the core host** as a derived, recomputed cache — same tier as the existing link graph and drift computations. Read-only view logic, so app-side code is legal under the anti-second-engine rule; no lib PR is strictly required to ship v1.
- New CoreApi channels (shape sketch, final types in `ipc-contract.ts`):
  - `atlas.graph: { in: { scope?: { project?: string; topic?: string }, level: 'overview'|'learn'|'deep' }, out: AtlasGraph }` — nodes, edges (typed + category + confidence tier + weight), clusters, plus precomputed positions per DESIGN layout rules.
  - `atlas.tours: { in: { scope? }, out: TourDef[] }` — extracted from handoff `## Reading order` sections, threads, and topic date-order.
  - `atlas.path: { in: { from: string; to: string }, out: { nodeIds: string[]; edgeIds: string[] } | null }` — BFS in the core host (graph already there).
- Invalidation: rebuild on `vault.changed` / post-pull reconcile (F4 rule already mandates full rebuild after integrate) — the Atlas is just another consumer of `rebuildIndexes`-fresh truth. Renderer store is a thin zustand slice: selection, focus, expanded clusters, tour cursor, filters — mirroring UA's store shape minus its cache-invalidation gymnastics (our layout is precomputed and deterministic).

**Data available today vs. needs support:**

| Edge/field | Today | Notes |
|---|---|---|
| Route (`from_project`/`to_project`), status, kind, `replies_to`/`fulfills` | ✅ frontmatter (schema v2, lib PR-11) via `handoffs.list`/`handoffs.thread` | |
| Wikilinks + reading orders | ✅ body parse + core `links.ts` resolution | reading-order extraction (parse `## Reading order` ordered list) is new but read-only app-side code |
| Provenance (`source_path`/`source_project`/`source_rel`) | ✅ frontmatter | local re-resolution needs the m2 §5 project-roots map (already planned) |
| Contract changes + handoff links (tiered) | ✅ `contracts.timeline` (m2) | |
| Commits/PRs | ✅ `activity.feed` + `github.prForCommit` (m2) | |
| Same-topic affinity | computed in core host | trivial: group by `topic` |
| "List every note with full meta" | ⚠️ partially (search/dashboard paths) | may want a small lib export (`listNotes(project?)` returning `Meta[]`) rather than N× `vault.readNote`; decide at story time — if added it rides an existing lib-PR train |

**Rendering (DESIGN.md v2 is binding):** nodes are mini routing-slip cards (white card, hairline, 12px radius, navy 600 name, gold open-count badge); edges 1.5px `--hairline` with navy arrowheads; the critical path (path-trace result, blocked chains) gold; heuristic-tier contract links dashed `--text-2`; hover = gold ring, click = detail/resolution; layout left→right by dependency depth. One gold primary per view still applies — the tour "Start" button is the gold spend on this view. Stamp-press animation stays exclusive to the handoff card. Reduced-motion honored on tour pulse.

### Story slices (realistic, sequential where marked)

1. **ATLAS-1 — Atlas data model + `atlas.graph` channel.** Core-host builder over existing indexes: 6 node types, 6 edge categories, clusters, confidence tiers; invalidation on `vault.changed`/post-pull; contract-tested against the fixture vault. No UI. *(Blocks all below.)*
2. **ATLAS-2 — Cluster layout + SVG canvas (Overview).** Deterministic left→right depth layout computed core-side; project cluster cards with open-count badges; aggregated route edges with counts; pan/zoom; empty/loading states per DESIGN.
3. **ATLAS-3 — Zoom levels + drill navigation.** Overview ↔ Learn ↔ Deep Dive as discrete states; topic groups with collapsed-atom expand; breadcrumbs + bounded node-history; keyboard reachable.
4. **ATLAS-4 — Node cards + hyperlink resolution.** All node types rendered to spec (stamps, type/topic/date chips); the full §3 resolution table wired: Reader, board card, editor deep link (with local re-resolution + disabled fallback), timeline/diff, GitHub; ⌘K entries.
5. **ATLAS-5 — Tours from curate reading orders.** `atlas.tours` extraction (reading orders, threads, topic date-order); tour panel with prev/next; step highlight + auto-open cluster + viewport fit; heuristic ordering fallback when a handoff lacks a reading order (BFS from the handoff over thread/wikilink edges, date-tiebroken — the UA `generateHeuristicTour` idea minus topo-sort ceremony).
6. **ATLAS-6 — Path tracing + filters + search integration.** `atlas.path` BFS + gold path rendering as a routing-slip chain; filter panel (node type, handoff status, topic, edge category, confidence tier); `vault.search` hits tier node highlight rings; focus mode (1-hop isolate).
7. **ATLAS-7 (stretch) — Changed-since overlay + export.** Activity-feed-driven glow on recently touched nodes with affected-neighbor rings (UA diff-overlay concept); SVG/PNG export of the current viewport.

Stories 5–7 are independent of each other once 1–4 land; 6 can start after 2.
