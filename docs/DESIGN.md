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

Rules: gold is THE accent — one gold primary button per view maximum; secondary actions are navy outline pills. Chrome links: navy, underline on hover (dark: paper). Note-body external links: see Addendum D2. If everything is gold, nothing is.

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
# D1 amendment 8 — form validation feedback (user, 2026-07-11)

Pressing a submit button that does nothing (silently disabled, or no-op on empty required fields) is a dead end — the user must always know WHY and WHAT is required. Apply consistently across EVERY modal/form in the app.

- **Required fields are marked**: an asterisk or "required" affordance on the label of every required field.
- **On submit attempt with missing/invalid required fields**: do NOT silently no-op. Show inline field-level error text (rust, below/beside the field) + a rust border on the invalid control, focus the FIRST invalid field, and (if a summary helps) a one-line "Fill the required fields" note near the submit button.
- **Disabled submit must explain itself**: if the submit button is disabled because of missing input, it carries a tooltip ("Add an objective to publish") AND the required fields show their hint — the user never faces a disabled button with no reason. Preferred pattern: keep submit ENABLED and validate on click (showing errors) rather than a silent-disabled button, so there is always feedback.
- **Live clearing**: an error clears as soon as the field becomes valid (on input/blur).
- Scope — audit and fix every form: compose/Hand back (Objective required for a delivery/request), decline-reason (reason required), snooze (date required), create/join wizards (folder + URL required per step), settings identity (name/email), add-property (key required), route filing-scope, and any others found. A shared `useFormValidation`/`FieldError` helper + consistent CSS so all forms behave identically.
- DESIGN v2: rust `--rust` for errors, 12px, respects reduced-motion (no shake unless subtle), keyboard-accessible (aria-invalid, aria-describedby on the field → error).

Concrete example from the user: the "Hand back" modal Publish with an empty Objective currently gives no feedback — after this, clicking Publish highlights Objective as required, focuses it, and shows "Add an objective the other team can act on."

# Addendum D2 — external links are visibly hyperlinks (user, 2026-07-16)

Note-body external links (https, mailto, …) rendered navy — indistinguishable from body text. The user asked for classic clickable blue hyperlinks.

- New token `--link`: `#0B57D0` light / `#8AB4F8` dark. Not system blue (#007AFF stays banned); both pass WCAG AA on their card surfaces.
- `.note-body a`: `color: var(--link)`, underlined at rest (`text-underline-offset: 2px`) — a link must read as a link before hover.
- Wikilinks are unchanged: gold `--wikilink` rules (Addendum D1) have higher specificity and stay underline-on-hover-only. Broken stays rust dotted.
- App chrome links stay navy — the blue is reserved for note content, where "this leaves the app" is the signal.


---

## v3 amendment — Obsidian Glass / Cobalt

*(handoff/DESIGN-V3-HANDOFF.md committed verbatim per its §7.1 — the binding spec for all v3 phases. v2 history above stands; v3 supersedes v2 visual-direction sections only; the v2 quality floor is unchanged.)*

Status: **approved direction** (2026-07-13). Supersedes DESIGN.md v2's *visual direction* sections ("Card catalog, daylight edition", token table, gold budget). The v2 **quality floor is unchanged and still binding**: both themes wired, `:focus-visible` rings, every action keyboard-reachable, ⌘K lists all, sentence case, empty states = one line + one action, reduced-motion respected, live data over Refresh buttons.

Sources of truth (in the design workspace):
- `Mission Control Home v2.dc.html` — Today screen, dark + light, full fidelity (pre-cobalt; repaint per §2)
- `Loredex UX Redesign.dc.html` — Turn 3 (component system), Turn 4 (accent audit), Turn 5 (final palette), Turn 1 (UX/IA wireframes incl. Atlas lens rules, lifecycle, first-run, settings)
- `Loredex v2 Prototype.dc.html` — cross-linked interactive prototype of the seven views in the final cobalt system
- This file — the implementable spec. **Hex values come from here, never eyeballed from screenshots.**

---

### 0. What changed and why

v2's warm-paper light theme is replaced by a **dev-native, dark-first** system ("Obsidian Glass"): three layered charcoal surfaces, soft-pill controls with inner-bevel light, a glyph-based status language, and **cobalt** as the single action color. Rationale: amber-as-primary collided with warning semantics and the OPEN state; the audience lives in Linear/IDE-class tools. Identity now comes from the brass brand mark, the component craft, and the green agent heartbeat — not from a novelty hue.

### 1. Color law (fixed roles — never reassign)

| Role | Dark | Light | Rules |
|---|---|---|---|
| **Action / primary** | `#5584E8` (ramp 300 `#8FB1F5` · 400 `#6E96EE` · 500 `#5584E8` · 600 `#3F69CC` · 700 `#2F52A8`) | `#2E5FC7` | ONE cobalt primary per view. Links = 300 (dark) / 700 (light). |
| **Attention / open / warning** | `#E3A73C` | `#96700F` | OPEN stamps, stale, snoozed-expiring. Never on buttons. |
| **Agents live / success / diff-add** | `#3BCB8B` | `#1E8F5F` | Live dots, receipts, consumed ✓, adds. Sacred to agents — never decorative. |
| **Danger / decline / drift** | `#EF5D55` (text `#F0655C`) | `#B44439` | Destructive outline buttons, declined, drift. |
| **Info / request / neutral meta** | `#93A6C9` | `#5C6B85` | REQUEST chips, informational. |
| **Brand (brass)** | `#D9A63C` grad `#E3B04B→#C89328` | same | **Logo mark + marketing only.** Never a control, never a state. |

Status is always **glyph + label**, never color alone (CVD-safe).

### 2. Tokens — `src/renderer/src/styles.css`

v3 is dark-first: `:root` holds dark; `[data-theme="light"]` overrides. Keep legacy var NAMES where roles map (less churn); add the new ones.

```css
:root {              /* DARK (default) */
  --bg-app:      #0B0D12;  /* was #F6F5F1 light-first */
  --bg-card:     #12151C;
  --bg-hover:    #171B23;
  --bg-inset:    #0F1218;
  --bg-overlay:  #1D222C;
  --hairline:    #232936;
  --hairline-2:  #2F3646;
  --text-1:      #E8EAF0;
  --text-2:      #9AA3B2;
  --text-3:      #6B7280;
  --accent:      #5584E8;  /* NEW — cobalt 500 */
  --accent-hi:   #6E96EE;  /* 400: gradients top, hover */
  --accent-lo:   #4A75D6;  /* gradients bottom */
  --accent-press:#3F69CC;
  --accent-ink:  #F5F8FF;  /* text on cobalt */
  --link:        #8FB1F5;  /* cobalt 300 */
  --warn:        #E3A73C;  /* replaces --gold's state duties */
  --ok:          #3BCB8B;  /* live + success (was #2E6E5E) */
  --rust:        #EF5D55;
  --info:        #93A6C9;
  --brand:       #D9A63C;  /* brass — BrandMark.tsx ONLY */
  --focus:       rgba(85,132,232,.55);
}
[data-theme="light"] {
  --bg-app:#F3F2EE; --bg-card:#FFFFFF; --bg-hover:#FAF9F5; --bg-inset:#EAE8E1;
  --bg-overlay:#FFFFFF; --hairline:#E1DED4; --hairline-2:#D6D3C8;
  --text-1:#16181D; --text-2:#565D68; --text-3:#8A8F99;
  --accent:#2E5FC7; --accent-hi:#3D6FD6; --accent-lo:#2854B2; --accent-press:#234A9E;
  --accent-ink:#FFFFFF; --link:#2E5FC7;
  --warn:#96700F; --ok:#1E8F5F; --rust:#B44439; --info:#5C6B85; --brand:#BE8C22;
  --focus: rgba(46,95,199,.45);
}
```

`--gold` / `--navy`: deprecate — grep usages; gold state-usages → `--warn` or `--accent` (buttons), navy text → `--text-1`. Update `design-fidelity.test.ts` assertions in the same PR (it asserts token values).

### 3. Typography

- UI: **Geist** (400/500/600/700) · code/meta: **Geist Mono** (400/500/600). Self-host woff2 in `src/renderer/src/assets/fonts/` + `@font-face` in `assets/fonts.css` (pattern already exists). Fallback `system-ui` / `ui-monospace`.
- Roles: chrome 13/12.5px · titles 20/650 (`letter-spacing:-.015em`) · card titles 15/550 · **mono = machine fact**: routes (`a ⟶ b`), dates, ids (GEN-142), paths, hashes, receipts, section labels (9.5px caps, ls .1em).
- Retro note-font defaults (Press Start 2P / Space Mono / Workbench) are **removed as defaults**; note-font user setting stays but defaults to Geist / Geist Mono.

### 4. Component rules

- **Buttons**: primary = cobalt gradient `linear-gradient(180deg,var(--accent-hi),var(--accent-lo))`, ink `--accent-ink`, radius 8, h 28–32, weight 600, `inset 0 1px 0 rgba(255,255,255,.25)` + `0 1px 2px rgba(0,0,0,.5)`; hover lightens one step; active flat `--accent-press` + inset shadow. Secondary = `--bg-overlay` + `--hairline-2` border + inner top-light. Ghost = transparent, hover `--bg-hover`. Danger = rust text + `rgba(229,72,77,.35)` border. Disabled explains itself (tooltip + field hints — D1a8 stands). Focus: `0 0 0 2px var(--bg-card), 0 0 0 4px var(--focus)`.
- **Kbd hints** inside buttons: 9px Geist Mono, 1px border, radius 3. Every triage action shows one (A/D/S/E, C, ⌘K).
- **Segmented control**: track `--bg-inset` + hairline, radius 10, pad 3; active segment `--bg-overlay`, radius 8, `inset 0 1px 0 rgba(255,255,255,.12)` + drop shadow ("pressed glass").
- **Status glyph chips** replace text-only stamps: 15px rounded-square (r4) tinted bg (`rgba(hue,.14)`) + glyph — ✓ ready/consumable, ✕ declined, ! stale/drift, – consumed (muted `--bg-hover`/`--text-3`); OPEN = brass-free **amber ring-dot** `● OPEN` chip (mono 10, amber border rgba(.4), bg rgba(.07)); REQUEST = info-bordered mono chip. Stamp-press animation (scale .97→1, 120ms) survives from v2.
- **List rows**: 40px, two-line anatomy (title 12.5/550 + mono sub 10px `--text-3`), glyph left, avatar/time right, hover `--bg-hover`, selected = 2px cobalt left bar. Never color-only.
- **Agent chip**: pill, live dot `--ok` with `0 0 7px rgba(59,203,139,.8)` glow + pulse (reduced-motion: static), name 600, mono meta. Session feed lines: mono 11, `❯` prefix.
- **Code/diff surface**: `--bg-inset` ground, file-header row (mono path + `+N −N`), del rows `rgba(229,72,77,.10)` + `inset 2px 0 0` rust bar; add rows `rgba(59,203,139,.08)` + green bar.
- **Floating action bar** (reader/diff review): `rgba(24,28,36,.92)` + blur(12px), radius 14, big shadow, ghost/secondary/one-cobalt-primary. Reserve depth for: segmented tabs, floating decision bars, live session sheets (Turn-3c rule).
- **Toast receipt**: bottom-right card, ✓ green glyph, mono commit line, Undo action, auto-dismiss ~4s.

### 5. IA & views (old → new)

| v2 view | v3 | Notes |
|---|---|---|
| Home | **Today** | Needs-you queue (ranked, one-key A/D/S/E) + In-flight agents + New knowledge + rail (sprint/pulse/velocity) |
| Handoffs | **Inbox** (triage) + **Plan** (board) | Inbox = For me/Created lanes, detail pane w/ reading order. Comment vs Hand back split stands (D1a4) |
| — | **Plan** (new) | Board · Backlog · Sprints over unified work items (task ∪ handoff). Needs lib schema — see §8 |
| Reader + Search | **Reader** | Search absorbed (file-pane modes + ⌘K); properties panel per D1a7-C |
| Atlas | **Atlas** | Strict zoom ladder, one question per lens — **Map** (absorbs Overview; keeps its Launcher card-list / Flow as a sub-toggle) → **Project** (renames Learn: Start-Here brief pinned first, then Receives · Topics-newest-first · Sends, numbered reading order kept) → **Thread** (NEW lens: absorbs the Path tool — one handoff chain rendered as a story) → **Deep Dive** (kept, disciplined: lanes = projects, gutter-bundled edges, focus-fade 35%, card budget ≈12, minimap). Toolbar utilities persist across lenses: Tours, Filters, Blocked overlay, Changed-since overlay, Export SVG/PNG, ? legend (auto-opens on first visit). Breadcrumb `dex ▸ project ▸ thread` IS the esc ladder |
| — | **Agents** (new) | Roster (state/machine/doing/last-wrote) + read-only live session feed (MCP log + git attribution — zero new engine writes) |
| Activity | Activity | Card anatomy per D1a1, recolored |
| Sync | Settings §System + titlebar sync pill | Sync page dissolves |
| Settings | **Settings** | Grouped: Workspace / Personal / System; status dot in nav; status+fix together |

#### 5.1 Feature parity is mandatory — v3 restyles, it never removes

Every v2 capability keeps a home. Checklist the agents must verify per phase (source: current `src/renderer` views + DESIGN v2 amendments): vault tree with **Name | Content** search modes, collapsible/resizable panes (⌘\, ⌘⇧\), section tinting + project dots, note dates in tree rows; Reader **Read ⇄ Edit (⌘E, CodeMirror)**, full **Properties panel** (typed rows, tags as chips, `+ Add property`, loredex-managed fields locked), wikilinks + broken-link diagnostics, humanized titles, ⌘F find bar, inline comments + hover popovers, thread rail; route-a-note drop zone + receipts/undo/dedup; contracts timeline + pinned diffs; saved/recent searches + query operators; activity card anatomy + churn collapsing; sync health details (reachable/branch/ahead-behind/merge driver) inside Settings; create/join wizards, `loredex://` deep links, vault menu + multi-window, notifications + dock badge, `?` shortcut cheatsheet. The prototype abbreviates some of these for speed; **the spec + this checklist, not the prototype's omissions, define scope.**

### 6. Migration plan (each phase = one PR, gate green, DESIGN.md appended)

1. **P0 — fonts + tokens**: woff2s, `fonts.css`, `styles.css` §2 swap, `design-fidelity.test.ts` update, theme default → system-dark. App recolors wholesale; no layout changes.
2. **P1 — primitives**: `Button`, `StatusChip`(glyph), `Segmented`, `Kbd`, `AgentChip`, `RowItem` in `src/renderer/src/components/`; migrate existing views' buttons/stamps to them.
3. **P2 — Today + Inbox**: rebuild HomeView → TodayView per prototype; Handoffs board → Inbox two-pane; global keys A/D/S/E; toast receipts w/ Undo.
4. **P3 — Plan**: work-item board/backlog/sprints. Blocked on lib schema (§8) — build behind a flag reading `type: handoff` only until then.
5. **P4 — Agents**: core-host channel exposing MCP request log + last git writes per identity; renderer view + presence chips on cards.
6. **P5 — Atlas lenses + Settings regroup + first-run** (demo vault + checklist per wireframe 1j).

### 7. Handover protocol (how to run this with your dev agents)

1. Commit this file as `docs/DESIGN.md` → append as `## v3 amendment — Obsidian Glass / Cobalt` (their binding-spec convention; keep v2 history above).
2. Per phase, write one story file (existing epic/story pattern) that references: this spec's section numbers + the prototype file + the relevant Turn in `Loredex UX Redesign.dc.html`.
3. Agents implement tokens **only from §2**, components **only from §4**; any deviation goes in the Dev Agent Record with a reason (existing rule).
4. Verification: screenshot each rebuilt view side-by-side with the prototype; `npm test` + `test:e2e` gates; fidelity test asserts the §2 hexes.
5. **Pixel reference**: `handoff/loredex-v2-prototype.html` (standalone — open in any browser, fully interactive) plus `handoff/screens/01–10` are the canonical eye. When spec text and pixels disagree, flag it in the story — never guess.
6. **Keep-everything rule** (§5.1): any capability in the current code that the prototype doesn't show is KEPT and re-homed per the §5 mapping. Removal requires an explicit approved story — silence means keep.

### 8. Product flags surfaced by this design (not UI work — route to loredex lib)

- Work-item schema: `kind: task|handoff|request`, `status: backlog|todo|doing|review|done|consumed`, `priority`, `sprint`, `owner`, `delegate` in frontmatter + MCP verbs `work_list/claim/update/done`.
- Session telemetry: per-agent MCP request log retention (already in-process) + opt-in surfacing.
- **Brand identity workstream (next):** the brass mark is a provisional placeholder from the old logo. A full identity (mark, brand color, type, voice) follows the prototype sign-off; §1's `--brand` token and BrandMark.tsx will be updated then. Nothing else in this spec depends on the brass hue.
- **Terminology — LOCKED, enforce in every string, doc, and identifier the UI shows:** the workspace is a **dex**, never "vault" — *vault is Obsidian's word and we are not Obsidian*. One **dex per product**; projects live inside a dex. UI copy: "Create a dex", "Join a dex", "dex tree", `loredex dex list/join/create`. Legacy `vault*` identifiers in code may survive internally until renamed, but zero user-facing "vault" strings ship in v3. Other locks: Atlas / Curate / Consume / Handoff / Reader keep their names; Route→File.

### 9. Identity & multi-product direction (decision, 2026-07-13)

No login server — **GitHub IS the account**. "Sign in with GitHub" = OAuth device flow (or reuse existing `gh` auth): the app lists the account/org's dex repos (identified by a `loredex-dex` repo topic), **one dex per product**. Join = clone; create = new private repo + topic; the sidebar's product shelves map 1:1 to these dexes, and switching product = switching dex (multi-window already supports N windows × N dexes). This keeps the open-source promise intact: no server, no accounts DB, vaults remain plain git repos the user owns. Out of UI scope, route to lib: `loredex dex list/join/create` commands + device-flow auth in the app shell.

### v3 amendments log

- **2026-07-17 — deferred trio shipped (story 26.9)**: per-agent MCP tokens (mint-once UI on Agents, live host check, `[agent]` attribution in the session feed); GIT_ASKPASS shim (HTTPS dex remotes ride the stored GitHub token, env-only, SSH untouched); Win/Linux encrypted-file token store (AES-256-GCM, machine key, honest Settings warning). Lib companions (work-item schema §8, auth/dex CLI, init --demo) live in loredex#25.
- **2026-07-17 — P7 (agent-ops surfaces) shipped**: client tree rows gain read-only fleet facts (mono tag chips ×3 + amber inbox-pending badge); the client workspace panel leads with the §4 green heartbeat — lit when the in-app MCP host is listening (`connected · :PORT`), honest "not connected" otherwise. Earlier agent-ops epic already carried the fleet model, ClientsView/ClientPage and the YAML/JSON/CSV viewers; per-client connection telemetry waits on per-agent tokens (lib). Story: docs/stories/epic26.story8-v3-p7-agent-ops-surfaces.md. **v3 handover complete: P0–P7 all shipped.**
- **2026-07-17 — P6 (GitHub auth) shipped**: core auth layer per AUTH-GITHUB.md — live gh-session reuse, PAT sign-in stored in the macOS Keychain (`loredex`/`github.com`, CLI-shared), §5-honest device flow gated on the not-yet-registered OAuth client id; typed `auth.*`/`dex.*` channels (token never crosses the seam, masked display only); Settings › System › GitHub rebuilt with the dex registry (`loredex-dex` topic list · Join via wizard · Create private repo + topic). Deferred: Windows/Linux token stores, GIT_ASKPASS transport shim (lib hook), CLI verbs (lib repo). Story: docs/stories/epic26.story7-v3-p6-github-auth.md.
- **2026-07-17 — P5 (Atlas lenses + Settings regroup + first-run) shipped**: lens switcher = Map · Project · Thread · Deep Dive (Thread = the Path tool re-homed; story-layout rendering is a follow-up); breadcrumb reads dex ▸ project ▸ topic; Settings regrouped Workspace/Personal/System with the Sync view dissolved into System (old `sync` id stays a deep link; nav back to 9 views); first-run gains the 3-step checklist + dex copy. Demo-dex generation deferred to the lib (`loredex init --demo` — anti-second-engine). Story: docs/stories/epic26.story6-v3-p5-atlas-settings-firstrun.md.
- **2026-07-16 — P4 (Agents) shipped**: in-app MCP host gains a read-only request ring (initialize/tools-call, 200 entries) exposed as `agents.sessions`; new Agents view — roster from git attribution (green live dot inside the 10-min write window) + mono `❯` session feed (5 s poll, MCP host state line); Inbox detail gains §6.5 presence chips. Zero engine writes. Per-agent MCP attribution needs per-agent tokens (lib, §8) — feed is dex-wide until then. Story: docs/stories/epic26.story5-v3-p4-agents.md.
- **2026-07-16 — P3 (Plan preview) shipped behind the §6.4 flag**: `plan` view (Board · Backlog · Sprints) — columns derive purely from the 8.1 handoff machine (Triage/Parked/In progress/Done), transitions ride the existing store writers, Sprints is an honest §8-blocked empty state. Enable via ⌘K "Enable the Plan preview"; flag + view retire into the real work-item schema when §8 lands in the lib. Story: docs/stories/epic26.story4-v3-p3-plan.md.
- **2026-07-16 — P2 (Today + Inbox) shipped**: Home → Today (needs-you triage queue ranked oldest-first w/ A/D/S/E, in-flight agents from git attribution until P4's live feed, new knowledge, epic25 rail re-homed); Handoffs board → two-pane Inbox (For me/Created/All lanes, RowItem list, detail pane w/ numbered reading order + thread rail + §4 floating action bar); global bare keys A/D/S/E + C; receipt toasts gain Undo where the reverse transition is legal. Nav: Home→Today, Handoffs→Inbox (ids internal). Story: docs/stories/epic26.story3-v3-p2-today-inbox.md.
- **2026-07-16 — P1 (§4 primitives) shipped**: Button (cobalt-gradient primary w/ bevel + pressed state, overlay secondary, ghost, rust-border danger, §4 focus ring, `kbd` hint slot), Kbd, Segmented (pressed glass), StatusChip (glyph + label: ✓/✕/!/– tinted squares, OPEN amber ring-dot, REQUEST info chip), AgentChip (sacred green live dot), RowItem (40px two-line, 2px cobalt selected bar). Surviving surfaces migrated (board triage w/ A/D/S hints, modals w/ ⌘⏎, reader, tree, theme segmented); rebuilt-next-phase views stay on the identical `button-*` classes. Story: docs/stories/epic26.story2-v3-p1-primitives.md.

- **2026-07-16 — P0 (fonts + tokens + brand mark) shipped**: §2 tokens swapped verbatim (dark-first `:root`, `[data-theme='light']` override); Geist / Geist Mono self-hosted and made the UI + note-role defaults (§3 — serif/retro defaults retired, the note-font setting stays); all `--gold`/`--gold-ink`/`--navy` usages remapped (buttons/selection → `--accent`, OPEN/stale/pending states → `--warn`, REQUEST/meta chips → `--info`, ink text → `--text-1`, links → `--link`); focus ring is cobalt; R1 brand mark wired into BrandMark.tsx + build icons (brass placeholder retired per §8); design-fidelity + atlas-fidelity tests assert the §2 hexes. Story: docs/stories/epic26.story1-v3-p0-fonts-tokens-brand.md.
