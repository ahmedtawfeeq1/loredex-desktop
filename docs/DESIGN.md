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
