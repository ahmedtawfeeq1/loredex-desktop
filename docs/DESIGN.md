# Loredex Desktop — Design System v2

Binding spec for all renderer UI. Dev agents implement tokens and component rules exactly; deviations go in the story's Dev Agent Record with a reason. v2 supersedes v1: **light-first**, brand palette from the loredex logo (navy / gold / paper), and the airy card-based layout language of modern team tools (reference: clean white cards on warm grey, pill buttons, modals with segmented controls and toggle rows).

## Direction

**"Card catalog, daylight edition."** Surfaces are warm paper-grey with white cards; ink is the logo's deep navy; the one loud color is the logo's gold, spent only on primary actions and open-handoff state. Dark theme remains fully supported (the logo's navy ground) — same tokens, flipped. This is an APP: dense where data lives (lists, feeds), generous where decisions happen (modals, wizards).

## Tokens

CSS custom properties on `:root` (light default) + `[data-theme="dark"]` override (app setting; follow system by default).

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg-app` | `#F6F5F1` | `#131826` | window ground (warm paper-grey / logo navy) |
| `--bg-card` | `#FFFFFF` | `#1C2536` | cards, panels, modals, list containers |
| `--bg-inset` | `#EFEEE9` | `#182032` | inputs, segmented controls, code blocks |
| `--hairline` | `#E4E2DB` | `#2A3347` | 1px borders; card borders always this + shadow-sm |
| `--text-1` | `#131826` | `#F2EFE8` | primary text (logo navy / paper) |
| `--text-2` | `#6E6E73` | `#98A0B0` | secondary, consumed state |
| `--gold` | `#C08A2D` | `#E0A83E` | PRIMARY actions (buttons, active nav rail), open-handoff stamp, badges |
| `--gold-ink` | `#131826` | `#131826` | text on gold |
| `--navy` | `#131826` | `#F2EFE8` | headers, icons, secondary buttons (outline) |
| `--rust` | `#A63D2F` | `#D4715F` | stale, drift, declined, sync errors |
| `--ok` | `#2E6E5E` | `#63B3A1` | success receipts, in-sync dot (demoted from v1 accent to status-only) |

Rules: gold is THE accent — one gold primary button per view maximum; secondary actions are navy outline pills. Links/wikilinks: navy, underline on hover (dark: paper). If everything is gold, nothing is.

## Type

Unchanged roles from v1: system sans (SF Pro) for chrome at 13px/11px; `ui-serif` (New York) for note titles, rendered markdown headings, empty-state lines; `ui-monospace` (SF Mono) for paths, hashes, dates, route lines, frontmatter. Rendered markdown body: sans 14px/1.6, measure 68–76ch, **centered in the pane — no dead left gutter** (v0.1 defect).

## Layout

Three-pane skeleton stays (sidebar 220px / contextual list 300px / detail), with v2 surface treatment:

- Window ground is `--bg-app`; every content region sits in a **card**: `--bg-card`, 1px `--hairline`, radius 12px, shadow `0 1px 3px rgba(19,24,38,0.06)`. Cards breathe: 16px padding, 12px gaps.
- Sidebar: flat on `--bg-app` (no vibrancy dependency in light), active item = gold left rail (4px) + `--bg-inset` fill + navy 600 text. Traffic-light inset + 52px drag region unchanged. Inbox badge: gold pill, `--gold-ink` text.
- Vault identity chip (bottom of sidebar): white card w/ sync dot, vault name 13px/600, engine version mono 11px. Permanent, unchanged mandate (F6).
- List rows 38px, dense; day headers in feeds 11px caps `--text-2`.
- **Buttons**: primary = gold pill (radius 10px, 32px height, 600); secondary = navy outline pill; destructive = rust outline. Same verb through a flow ("Publish" → "Published").
- **Modals** (compose, wizards, decline-reason): centered card 480–560px, radius 16px, title 17px/600, segmented control (`--bg-inset` track, white active segment) for mode choices, **toggle rows** (label left, switch right — gold when on) for options, footer = Cancel (outline) left, primary gold right. Exactly the reference pattern.
- **Toasts**: bottom-right card, receipt-style, mono details line, auto-dismiss 5s.

## Signature: routing-slip handoff card (kept, re-skinned)

White card, hairline, radius 12px. Stamp chip: 10px mono uppercase, letterspaced, 1px border + transparent fill — OPEN gold, ACCEPTED navy, DECLINED/STALE rust, CONSUMED/DONE `--text-2`, SNOOZED `--text-2` dashed border. Mono route line `from ⟶ to`, date right-aligned. Objective in serif 15px. Stamp-press animation on state change (scale 0.97→1, 120ms, disabled under reduced-motion) — still the app's one bespoke animation.

New in v2: **thread rail** — replies/fulfills render as a left-indented rail of connected cards (2px `--hairline` connector line), request cards get a `REQUEST` navy chip beside the stamp.

## Data visualizations (dependency graph, contract timeline)

- Graph: SVG, no chart lib. Nodes = mini routing-slip cards (project name navy 600 + open-count gold badge); edges = 1.5px `--hairline`, arrowheads navy; blocked-critical-path edges gold. Layout left→right by dependency depth. Hover = gold ring; click = detail panel.
- Timeline: vertical rail, mono dates, one card per contract change (file, +/- counts, linked handoff chip, commit hash mono). Diff view: unified, `--bg-inset` ground, additions `--ok` tint, deletions rust tint, mono 12px.

## Quality floor (non-negotiable, carried from v1)

Both themes wired and switchable (system/light/dark in Settings). `:focus-visible` 2px gold ring offset 2px everywhere. Every action keyboard-reachable; ⌘K palette lists all. Sentence case, active verbs, errors say what happened + what to do. Empty states: one serif sentence + one action. Live data (watcher/poller) means Refresh buttons become fallbacks, not primary UX. Reduced-motion respected.

## Don't

- No purple, no system blue. No gradients on surfaces (flat cards + shadow only).
- No serif in nav/buttons. No border > 1px. No emoji in chrome.
- Max one gold primary per view. No web-app 24px+ padding in dense lists.
- No dead whitespace: reader content centered; wide views use the space (graph, board columns).

---

## Addendum D1 (2026-07-10): density, color, and writing surfaces

User-driven corrections from live usage. Binding, supersedes conflicting lines above.

### Reader is full-bleed
The note content column uses the FULL detail pane width (32px side padding, no ch-measure cap). Serif headings and 14px/1.6 body stand; width is the user's, not ours. Same for MOC/index pages — and index pages must not render their H1 twice (strip the duplicate title line when it equals the filename).

### Wikilinks are always visibly links
Inline note references: `--gold` in dark theme, `--ink`-derived accent in light (#8A6116), 500 weight, no underline at rest, underline on hover. Broken: rust dotted. A "Reading order" section must never render an empty list — if wikilink filtering empties it, show the unresolved names as plain rust text with diagnostics, not silence.

### Collapsible rails
Both the nav sidebar and the file-list pane collapse: chevron affordance in each pane header + ⌘\ (sidebar) and ⌘⇧\ (list). Collapsed sidebar = 56px icon rail (badges survive as dots); collapsed list = 0 (reader full-bleed). State persists per vault. Animation 160ms ease-out, none under reduced-motion.

### Vault tree sections (Notability-style)
Each top-level group (_index, projects) and each project gets a **rounded section row**: full-width pill (radius 8), tinted background, 11px caps label, solid 8px color dot, chevron to collapse. Project colors are deterministic (hash of name) from this 8-tint set — light theme bg at 12% alpha, dark at 20%; dot solid:
sage `#7C9A6D` · clay `#C07856` · slate `#6B7FA3` · moss `#8A8F55` · rose `#B07285` · sand `#B99B5F` · teal `#5F9490` · plum `#8D6E97`.
Notes under a project inherit a 2px left rail in the project color. Selection keeps the gold left rail (gold budget: selection only).

### Activity cards
Feed rows become cards: `--bg-card`, hairline, radius 10, shadow-sm, 12px padding, grouped under day headers.
Card anatomy: kind icon chip (ROUTE/HANDOFF/CONSUME/STATUS/SYNC — mono 9px, kind-tinted border), actor + relative time (absolute on hover), one-line summary (serif only if it quotes an objective), mono path (middle-truncated, full on hover), commit sha chip.
**Consecutive status flips on the same handoff by the same actor within 10min collapse into one card** ("status churn ×5" expandable).
Per-kind action buttons (right-aligned, outline pills, max 2): route→Open note · handoff→View card / Consume (if open+inbound) · consume/status→View card · sync→Open Sync · contract-linked→View diff.

### Edit mode + inline comments (the writing surface)
Reader gains a per-note mode toggle Read ⇄ Edit (⌘E). Edit = monospace 13px textarea-grade editor with a minimal formatter bar (bold/italic/code/link/list/heading — inserts markdown, no WYSIWYG), unsaved dot, ⌘S saves through the core host (vault-contained paths only, git auto-commit "edit <note> (Name)"). Frontmatter renders as a locked panel in edit mode — body only is editable (agents own frontmatter).
**Inline comments:** selecting text in Read mode shows a floating "Comment" chip → side-margin composer → creates an anchored comment note (`type: comment`, `replies_to: <note>`, `anchor: "<exact quoted text>"`) — plain vault markdown, so AI agents see comments natively via MCP/CLI. Rendered: anchored text gets a soft gold underline-highlight; comments stack in a right margin rail (cards, author + time), orphaned anchors (quote no longer found) list at note end with rust chip. No comment deletion in-app v1 (files are the API).

### D1 amendment — comment hover popover (user requirement, 2026-07-10)
Anchored (commented) text MUST show a hover popover: comment body, author name, absolute time (mono 11px), rendered as a floating `--bg-card` card (hairline, radius 10, shadow-sm, max-width 360px) above the anchor; multiple comments on one anchor stack inside the popover. Popover is keyboard-reachable (focus the anchor → same popover). The margin rail remains; the popover is the fast path.

### D1 amendment 2 — editor v2 (user requirement, 2026-07-10)
The edit surface upgrades from plain textarea to **CodeMirror 6** (the standard; Obsidian's editor core; MIT, sanctioned new dependency: @codemirror/* + @lezer/highlight):
- Markdown syntax highlighting (headings/bold/code/links tinted via theme tokens, both themes), active-line highlight, bracket match, markdown-aware list continuation on Enter, history (undo/redo), search panel (⌘F), multiple selections.
- Toolbar (icon buttons, 28px, hairline group borders, tooltips with shortcuts): headings dropdown H1–H4 · bold ⌘B · italic ⌘I · strikethrough · inline code · code block · wikilink [[ ]] · md link ⌘K-in-editor · quote · bullet list · numbered list · task list · table snippet · horizontal rule · undo/redo. All insert/wrap markdown; selection-aware (wrap selection, toggle off when already applied).
- Frontmatter stays locked (not part of the editable doc). Save semantics unchanged (⌘S → note.save, receipt, activity). Dirty-guard on view/note switch (save/discard prompt).
- Editor fills the pane full-bleed like Read mode; 13px mono; gutter line numbers OFF by default (notes, not code).

### D1 amendment 3 — comprehension pass (user feedback on real vault, 2026-07-10)

**Atlas must explain itself and read in a direction.** Learn/Deep panels stop being scattered islands:
- Topic groups arrange in a **recency-ordered reading flow**: newest-activity topic top-left, flowing left→right then row-down; each topic group is a bordered sub-card (radius 10, topic label + note count + newest date), notes inside ordered newest-first with a small `01 02 03…` order chip. The eye always knows where to start.
- Relationships render INSIDE the panel: wikilink/thread/provenance edges between visible notes draw as thin curved connectors (hairline; gold when part of an open thread); a note with no visible edges gets none — but the topic sub-card borders carry the grouping so nothing floats naked.
- **"How to read this map" affordance**: a `?` button in the atlas header opens a compact legend popover — node types, edge types, zoom levels, what Tours/Path/Blocked do, one suggested first action ("Start with the Tours button — it walks you through a real handoff chain"). First-ever visit to Atlas auto-opens it once (app.db flag).
- **Header redesign**: proper toolbar row (44px, hairline bottom): left = VAULT ATLAS eyebrow + zoom as a real segmented control (`--bg-inset` track, white/dark active segment); center = breadcrumb (unchanged); right = actions grouped with 8px gaps as icon+label pill buttons with tooltips — [Tours] [Filters·n] [Path] | [Blocked] [Changed] | [Export ▾ (SVG/PNG submenu — one button, not two)] [?]. No naked text buttons.

**Read-mode find bar (⌘F).** VS Code/Obsidian pattern: floating bar top-right of the note pane — query input, match counter `3/17`, prev/next (↑↓ buttons + Enter/⇧Enter), case-sensitive toggle (Aa), close (Esc). All matches highlighted (`--bg-inset` + hairline ring), current match gold. Debounced 150ms, works on the rendered note. Edit mode keeps CodeMirror's own ⌘F.

**Humanized note titles.** Everywhere a note NAME renders as a title (reader header, tree rows, search results, atlas cards, handoff reading orders): strip the leading `YYYY-MM-DD-` date, replace dashes with spaces, Title Case words (small words lowercased: a, an, the, of, to, for, and, or, in, on — first word always capitalized); the stripped date renders as mono `--text-2` metadata (reader: line under the serif title; tree rows: right-aligned small; atlas cards: existing date line). The real filename stays visible in the frontmatter panel + tooltips. Pure `humanizeTitle(name)` util, unit-tested, used by ALL surfaces — no per-view drift.

**Resizable list pane.** Drag handle on the file-list/reader divider: 200–480px, cursor col-resize, double-click resets to 300, persisted per vault next to the rails state. Collapse behavior (⌘⇧\) unchanged.

**File-pane search modes.** The "Search files…" box gains a segmented mode toggle: **Name** (current filter) | **Content** (vault.search full-text) — content mode shows a flat result list (humanized title, project tint dot, snippet with highlighted term, date) replacing the tree while active; Enter opens the top hit; Esc clears back to the tree.

### D1 amendment 4 — handoff reply model (user feedback on real vault, 2026-07-10)

**The core rule: a new note = "a distinct thing someone must separately consume." Everything else is a state change or a thread comment.** Git already versions every note, so updating in place never loses history — note-minting is reserved for consumable units, not edits.

Three distinct actions on a handoff card, clearly separated:
- **Comment** (PRIMARY, lightweight — the default reply path): `type: comment` note, `replies_to` parent, author identity. Threads under the parent in the thread rail + Atlas. **NEVER a board card.** This is for "done", "got it", questions, acknowledgements, discussion. Rename the current prominent "Reply" affordance so Comment is the obvious first action.
- **Hand back** (SECONDARY, deliberate — the real return deliverable): what today's "Reply" does — mints a new `type: handoff` note, inverted route, `replies_to` set, appears on the board as a consumable unit. Label it "Hand back" (or "Reply with deliverable"), visually secondary to Comment, with a one-line helper on the compose modal: "Creates a new handoff the other team must consume. For a quick note, use Comment."
- **Status transitions** (accept/decline/snooze/consume/fulfill): update the SAME note's frontmatter. Unchanged — already correct.

Board filtering: the Handoffs board and its counts list ONLY `type: handoff` notes. `type: comment` notes never appear as board cards or in open/consumed counts — they live in the thread rail (reader), the Atlas thread edges, and the Activity feed. This is the de-clutter fix for the user's "board full of tiny consumed notes" complaint.

In-place edit (nice-to-have this cycle if cheap): a handoff YOU authored that no one has consumed yet is editable in place (fix objective/typo) via the editor — no new note, no reply. Skip if it needs new plumbing.

Migration: existing `type: handoff` notes that were really conversational replies stay as-is (never rewrite the vault); the model applies going forward. Thread rail already renders `replies_to` chains regardless of type, so past replies still thread correctly.

### D1 amendment 5 — atlas navigation + header breathing room (user feedback, 2026-07-10)

**Trackpad-native navigation.** The atlas canvas responds to standard macOS gestures:
- Pinch-to-zoom (trackpad pinch → wheel+ctrlKey events): zoom toward the cursor, clamped 0.4–2.5, smooth.
- Two-finger scroll pans the canvas (wheel dx/dy → translate); shift+scroll pans horizontally. No accidental page scroll.
- Drag-pan (mouse/one-finger drag on empty canvas) unchanged.
- **On-canvas zoom controls** (bottom-right, floating `--bg-card` pill stack, hairline, shadow-sm): `+` / `−` / `⌖` fit-to-content / `1:1` reset, each with tooltip + keyboard (⌘= zoom in, ⌘− zoom out, ⌘0 fit). 28px buttons, mono glyphs.
- Momentum/inertia not required; smoothness via CSS transform transitions ≤120ms, disabled under reduced-motion.

**Header breathing room.** The atlas toolbar content currently touches the container edges. Fix: the atlas view container gets the standard card treatment (inset from the window ground with 16px gap like every other view), and the 44px toolbar row gets 16px horizontal padding + 12px vertical so the VAULT ATLAS eyebrow, segmented zoom control, breadcrumb, and action pills never kiss the border. Toolbar actions keep 8px inter-group gaps; a hairline divider sits below the toolbar, not at the very top edge. Same inset applies to the canvas region below.

### D1 amendment 7 — v1 completion pass (user, 2026-07-11)

Five workstreams that complete v1. Each is a binding spec for its agent.

#### A. Solution-grade Home dashboard (redesign, epic21)
The current KPI-row dashboard is too flat for a team knowledge/handoff product. Rebuild as a real operations dashboard, still full-width, DESIGN v2 cards, live-recompute, zero new backend (dashboard.build / handoffs.list / activity.feed / contracts.timeline / sync.status / atlas blocked model):
- **Hero band**: 3–4 headline stat tiles WITH context — open inbound + WoW trend arrow, oldest-open age with the route, requests-waiting, contract changes (7d) — each tile clickable into the owning view.
- **Attention column** (left, 2/3): the ranked actionable-handoff list (open/accepted/snoozed, oldest-first) with inline Consume/Snooze, and the Blocked/critical-path card beneath.
- **Insight column** (right, 1/3): per-project pulse (note count, last activity, open in/out, brief-stale chip — as compact rows/bars), a 14-day activity sparkline (SVG, 14 bars by day, kind-tinted), contract-churn-by-file mini list, sync health mini.
- **Velocity strip**: handoffs created vs consumed over 7d (tiny paired bars), "N handed off · M consumed · K still open".
- Empty/degraded states per amendment (fresh vault, no remote, no contract roots hides that section). One gold primary max. No dead space — the right column fills the height.

#### B. Powerful search (upgrade, epic22)
Both the Search view and ⌘K palette. Beyond substring:
- **Query operators** parsed client-side: `project:`, `topic:`, `type:`, `status:`, `tag:`, `from:`/`to:` (handoffs), `before:`/`after:`/`on:` (date), bare terms = full-text. Chips render parsed filters; a filter-builder row mirrors them (the existing facet selects stay, now synced to the query).
- **Ranked results** with humanized title, project tint dot, matched-term-highlighted snippet, type/status/date meta, keyboard up/down/enter, result-count. Group-by-project toggle.
- **Recent searches** (localStorage, last 8) + one-click re-run; **saved searches** optional (localStorage) shown as quick chips.
- Search runs over vault.search (bodies) + frontmatter facets; operators narrow deterministically before ranking. ⌘K shows top 5 with "see all in Search →".

#### C. Notion/Obsidian-style properties panel (epic20)
Replace the flat frontmatter key/value table in the reader with a real **Properties** panel:
- Each property is a typed row: icon + name + typed value control. Infer type from key/value — date (date picker display), tags (chip list), select/enum (status/type/kind → colored chip), url/path (link), text (default). loredex-managed fields (`loredex`, `source_path`, `source_project`, `source_rel`) render but are LOCKED (lock glyph, tooltip "managed by loredex") — never user-edited (agents own them, design principle intact).
- **Editable** user fields (tags, custom text/date/select): inline edit → writes back frontmatter via a new core channel `note.setFrontmatter` (body untouched, git auto-commit "set property <key> on <note>", path-guarded, schema-preserving via lib serializeDoc). Add-property affordance ("+ Add property") with a small type picker. Remove property (× on the row) for user fields only.
- Collapsible ("Properties ▸ N"), collapsed by default on long notes, expanded on short. Dense, mono values, DESIGN v2.
- Tags become clickable → run a `tag:` search. This is the metadata upgrade the user asked for.

#### D. Vault switcher + multi-window (epic23)
The bottom-left vault identity chip becomes a **vault menu**: click (or a ▾ affordance above it) opens a popover — list of recently-opened vaults (persisted, app-wide), "Open vault…" (folder picker → switch in place), "Open in new window" (Electron new BrowserWindow on a chosen/last vault), "Create or join…" (existing wizards). Multi-window: main process supports N windows each bound to its own vault (per-window core host + vault path); the chip shows the current window's vault. Recent-vaults list in localStorage/app-db.

#### E. Routing safety (Epic 4 — build the ready-for-dev stories)
Complete the F4 gap using the existing epic4 story files (4-1…4-4) + lib PR-3 (route receipts/undo already partly in lib — verify): route produces a **receipt** (what filed where) with **Undo** (toast + reversible), **dedup** guard (warn/skip when the same source is already routed), **filing-scope control** (preview + untick before routing; "internal, never route" globs), and **drift badges + one-click reroute** when a routed source changed. Wire into the existing Route-a-note flow and the reader.

### D1 amendment 9 — modern Vault Operations Dashboard

# D1 amendment 9 — modern "Vault Operations Dashboard" (user, 2026-07-11)

SUPERSEDES amendment 7 section A. Concept adapted (NOT replicated) from the Haulix "Operations Dashboard" dark reference + Panze project-dashboard: real metrics, real SVG charts, a Quick Actions section, an alert/attention queue, project-status + relations insight. Modern dark hero look (theme-aware, but the dark treatment is the reference). This sets the look-and-feel direction for the whole app.

Full-width Home view rebuild. DESIGN v2 tokens; dark = navy ground #131826, cards #1C2536, hairline, gold primary, full status palette (rust/amber/ok) for severity. Live-recompute on watcher/poller. Zero new backend: dashboard.build, handoffs.list, activity.feed, contracts.timeline, sync.status, atlas blocked/edges, insights.ts (extend). SVG charts only — no chart libs.

## Layout (three zones, mirroring the ops-dashboard structure)

### Zone 0 — command strip (top)
- Row of compact **stat pills** (icon + label + value), real numbers: `Open <openInbound>/<total>` · `Projects N` · `Requests waiting M` · `Contract Δ K (7d)` · `Sync ✓/ahead-behind` · `On-track P%` (P = consumed / (consumed+open) over the window, or active-vs-total). Each pill clickable to its view.
- Title **"Vault Dashboard"** (serif or strong sans, large), subtitle `<vaultName> · <today long date> · live overview`.
- **Range toggle** segmented control: Today | This Week | This Month (drives the trend windows + velocity + activity range). Persist last choice (localStorage).

### Left column (~60%)
1. **Quick Actions** — a titled row of icon CTA cards (rounded, hairline, hover-raise): New handoff (gold primary), Route a note, Curate product brief, Open Atlas, Sync now. Each = icon + label; keyboard-reachable; wired to the real actions (openCompose, route flow, curate, setView atlas, sync.run).
2. **Attention Queue** — the alert-priority-queue analogue, the insight the user asked for. Ranked severity rows (card list): each row = severity chip (Critical rust / Warning amber / Info navy) + icon + title + one-line reason + right-aligned quick action button + "see" affordance. Sources, ranked:
   - Critical: oldest open handoff older than 5d (Consume/Open); contract-ownership conflict from curate/atlas if detectable (Open).
   - Warning: stale briefs (notesNewerThanBrief>0) → Re-curate/Open; drift-detected notes (lib drift) → Reroute; expired snoozes → Open.
   - Info: requests waiting (kind=request, open) → Open; N done hidden (link).
   - "See all" → relevant view. Empty = "All clear — nothing needs you." Order: critical → warning → info, then age desc.
3. **Recent Activity** — condensed activity cards (reuse feed styling), last ~8, day-less compact, "See all" → Activity.

### Right column (~40%)
1. **Handoff Velocity** (bar chart, SVG): per-day paired bars created vs consumed over the selected window (7/14/30). Axis labels, hover tooltip (day: created X / consumed Y), legend. Title + "N created · M consumed · K still open" summary line. Kind-tinted (gold created / ok consumed).
2. **Backlog trend** (area chart, SVG): open-handoff backlog (or routed-notes) per day over the window — smooth area, gradient fill (subtle), current-value dot + tooltip. Title "Open backlog" / "Routing throughput".
3. **Project status & relations**:
   - Per-project **health cards** (compact): project name + tint dot, note count, open in/out chips, brief-freshness chip (fresh/stale/none), last-activity relative date, a tiny utilization bar (open/total). Click → Atlas Learn for that project.
   - **Relations strip**: a compact who-hands-off-to-whom summary (from dashboard edges) — e.g. `backend → frontend (2)`, `mobile → backend (1)` as small directional chips; click → Atlas overview. This is the "relation" ask.

## Charts (SVG, no libs)
- Bars: rounded-top rects, baseline axis, 5-tick y grid (faint), hover band + tooltip card (--bg-card). Deterministic layout, responsive width.
- Area: monotone path + gradient fill under, hairline baseline, x-day labels, hover crosshair + value tooltip.
- Empty/short data: render an honest "not enough history yet" placeholder, never a broken axis.
- All chart geometry PURE + unit-tested (bucketing, scales, path building) — testable without a DOM.

## States & quality
- Fresh vault: command strip zeros + "Your dashboard fills as agents route notes and hand off work" + Route/Join CTAs.
- Degraded: no remote → sync pill local-only; no contract roots → hide Contract Δ pill + any contract row.
- Live recompute (watcher/poller), 500ms debounce, no Refresh button.
- One gold primary (New handoff quick action). Full dark + light both wired. Focus rings, keyboard, reduced-motion. No dead space — right column fills height, charts flex.

## Delivery (epic25, supersedes epic21)
Rebuild HomeView + insights.ts (extend with velocity buckets, backlog series, on-track %, attention-queue assembly, per-project health, relations). New pure chart modules (src/renderer/src/views/home/charts/*.ts) with unit tests against nimbus-vault ground truth. Append this as "### D1 amendment 9" to docs/DESIGN.md. Story epic25.story1. Full gate green (--no-file-parallelism), commit + confirm HEAD, no push.
