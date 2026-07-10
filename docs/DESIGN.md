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
