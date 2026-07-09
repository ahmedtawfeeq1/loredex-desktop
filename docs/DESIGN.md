# Loredex Desktop — Design System

Binding spec for all renderer UI. Dev agents implement tokens and component rules exactly; deviations go in the story's Dev Agent Record with a reason.

## Direction

**"Card catalog."** Loredex = lore + dex — an index of a team's engineering lore. The app reads as a modern macOS tool with an archival reading surface: native chrome, paper-quiet content, catalog-card handoffs. One signature element (the routing-slip handoff card); everything else disciplined and dense.

This is an APP, not a web page: no hero sections, no marketing type scale, no scroll-triggered reveals. Keyboard-first, information-dense, native-feeling.

## Tokens

Implement as CSS custom properties on `:root` (light) and `@media (prefers-color-scheme: dark)` + `[data-theme]` override (app setting wins).

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg-sidebar` | `rgba(236,236,238,0.72)` over vibrancy; fallback `#ECECEE` | `rgba(28,28,30,0.72)`; fallback `#1C1C1E` | sidebar (translucent, `vibrancy: 'sidebar'` on BrowserWindow) |
| `--bg-content` | `#FFFFFF` | `#232326` | list pane + reader |
| `--bg-raised` | `#FAFAF8` | `#2A2A2E` | cards, panels, palette |
| `--hairline` | `#E3E3E0` | `#3A3A3E` | 1px borders only — never heavier |
| `--text-1` | `#1D1D1F` | `#EDEDEF` | primary text |
| `--text-2` | `#6E6E73` | `#98989E` | secondary, consumed state |
| `--ink` | `#2E6E5E` | `#63B3A1` | **Archive Ink** — links, wikilinks, selection, focus, primary buttons |
| `--stamp` | `#A16A1B` | `#D9A441` | **Stamp Amber** — open handoffs, badges, attention |
| `--rust` | `#A63D2F` | `#D4715F` | stale, drift, sync errors |

Rules: interactive color is Archive Ink, never system blue. Amber is reserved for open/attention state — if everything is amber, nothing is. Sync dot semantics: ink = clean, amber = ahead/behind, rust = error/offline.

## Type

| Role | Stack | Size/weight |
|---|---|---|
| UI chrome (nav, lists, buttons, chips) | `-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif` | 13px/400 base, 11px captions, 600 for emphasis — never bold whole rows |
| Reading surface (rendered note H1–H3, note titles in reader, empty-state lines) | `ui-serif, "New York", Georgia, serif` | H1 22px/600, H2 17px/600, H3 15px/600 |
| Data (paths, hashes, dates, frontmatter keys, route lines) | `ui-monospace, "SF Mono", Menlo, monospace` | 11px/400 |

The serif is the personality and it lives ONLY on the reading surface and empty states. Nav and lists stay sans. Rendered markdown body: sans 14px/1.6, measure ~68ch.

## Layout

Three-pane, 8px spacing grid:

```
┌─────────┬──────────────┬──────────────────────────────┐
│ ⬤⬤⬤     │              │                              │
│ Home    │  contextual  │   reader / board detail      │
│ Inbox ③ │  list pane   │   (68ch measure, centered)   │
│ Projects│  (300px)     │                              │
│ Activity│              │                              │
│ Search  │              │                              │
│─────────│              │                              │
│ ▣ vault │              │                              │
│  chip   │              │                              │
└─────────┴──────────────┴──────────────────────────────┘
```

- Sidebar 220px, translucent, `titleBarStyle: 'hiddenInset'` — traffic lights sit over it; top 52px is drag region (`-webkit-app-region: drag`).
- Inbox nav item carries the open-count badge (amber pill, 10px mono).
- **Vault identity chip** (bottom of sidebar, permanent — the F6 fix made visible): vault name 13px/600, engine version 11px mono `--text-2`, sync dot; full path + remote in tooltip. Never hidden, never truncated to ambiguity.
- List rows 38px: title 13px, metadata line 11px mono `--text-2`. Selection = 4px Archive Ink left rail + `--bg-raised` fill, not a solid accent block.

## Signature: the routing-slip handoff card

The one memorable element. Card on `--bg-raised`, 1px `--hairline`, 8px radius, 12px padding:

```
┌────────────────────────────────────────────────┐
│ [ OPEN ]  nimbus-ai-engine ⟶ nimbus-backend    │
│                                    2026-07-09  │
│ Expose streaming replies over the public       │  ← serif, 15px
│ API (SSE), update the API contract             │
│ 3 notes · consume ⌘⏎                           │  ← 11px mono, --text-2
└────────────────────────────────────────────────┘
```

- **Stamp chip**: 10px mono uppercase, letterspaced 0.08em, 1px border in state color, state-color text, transparent fill (a rubber stamp, not a pill). OPEN = amber, CONSUMED = slate (`--text-2`), STALE = rust.
- **Route line**: mono, `from ⟶ to` (U+27F6), date right-aligned mono.
- Objective in serif — the only serif outside the reader.
- **Consume = stamp press**: on action, chip scales 0.97 → 1.0 over 120ms ease-out and flips to CONSUMED; disabled under `prefers-reduced-motion`. This is the app's ONE bespoke animation.

## Motion

Hover/selection transitions 80–120ms ease-out on background/border only. The stamp press above. Nothing else — no page transitions, no reveals, no springs. Respect `prefers-reduced-motion: reduce` globally (transitions to 0).

## Quality floor (non-negotiable)

- Full dark mode from day one (both token columns wired).
- `:focus-visible`: 2px Archive Ink ring, 2px offset, on every interactive element — keyboard-first users are the primary persona.
- Every action has a shortcut; Cmd+K palette lists them.
- Copy: sentence case, active verbs, action names stable through the flow ("Consume" → receipt says "Consumed"). Errors say what happened + what to do; no apologies, no "oops".
- Empty states: one serif sentence + one button. Inbox empty: "No open handoffs for this vault." + [Check remote].
- Wikilinks: Archive Ink, no underline at rest, underline on hover; broken links rust dotted-underline with diagnostic tooltip — never create files.

## Don't

- No system-blue accents, no purple gradients, no glassmorphism cards, no shadows heavier than `0 1px 3px rgba(0,0,0,0.08)`.
- No serif in navigation or buttons. No bold table rows. No border heavier than 1px.
- No emoji in chrome. Status is typography + the three state colors, not icon soup.
- No web-app padding (24px+ everywhere) — this is a dense desktop tool.
