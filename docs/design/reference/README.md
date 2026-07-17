# v3 pixel references — the binding eye

Captured programmatically from `handoff/loredex-v2-prototype.html` (headless
Chrome, 2000×1300, dark) — the same pixels as the designer's interactive
prototype. **These images outrank any written description of a view's
layout.** Spec §2 stays the only source for hex values; these are the source
for anatomy, spacing, and placement. Recapture script:
`scripts/capture-design-refs.mjs` (same CDP drive).

Every parity story references its image below, implements, then attaches an
actual screenshot of the running app **next to the reference** in the PR —
no view merges on token-fidelity alone again (the epic26 P0–P8 lesson).

## Global chrome (visible in every capture)

- **Top bar**, full width, 42 px: traffic-light inset · centered `Run any
  action… ⌘K` pill (≈600 px, `--bg-inset`, hairline border) · right cluster
  `● synced 2m` (mono, ok-dot) + avatar circle (initial, 26 px).
- **Sidebar ≈ 232 px**: R1 mark + dex name `genudo` + mono `dex 2.4`
  right-aligned · full-width cobalt-gradient **`+ New [C]`** button ·
  view rows (icon 15 px + label + right-aligned mono ⌘-number or badge):
  Today · Inbox(count pill) · Plan · Reader · Atlas · Agents(live dot) ·
  Activity · **product shelves**: caps product name + `product` outline chip
  + count, then project rows (color dot + mono name + count/attention dot),
  `+ 3 more…` overflow · pinned bottom: Settings row (`8`) + mono keys
  footer `keys 1-8 · ⌘K · C new · E consume`.
- Selected nav row: `--bg-hover` pill + 2 px cobalt left bar. Sidebar has NO
  group labels (Workspace/Collaborate headers are gone in v3 nav).

## Per-view anatomy + delta vs the shipped app

| # | File | View | Must-match anatomy | Biggest current deltas |
|---|---|---|---|---|
| 01 | `01-today.png` | Today | Title 20/650 + mono meta line; `NEEDS YOU · n` caps label + `ranked oldest-first`; triage card = chip row (OPEN ring-dot, REQUEST, mono route, `4d — oldest` rust right) → title 15/550 → mono sub → right-aligned actions `Accept A · Decline D (rust text) · Snooze S (secondary) · Consume E (cobalt primary)`; `IN FLIGHT · LIVE` rows (green dot, bold name, `❯` mono line, Watch ghost); `NEW KNOWLEDGE TODAY` rows (type dot, title, mono `kind · agent · time`); **right rail 300 px**: Sprint card (name + `4d left`, cobalt progress bar, `7 done · 4 doing · 1 blocked` w/ rust, `Open board →` link) · `PROJECT PULSE` (dot + name + fresh/stale mono right) · `VELOCITY · 7D` mini bar chart + legend | rail is generic ops charts (no Sprint/Pulse cards); action row buttons under-styled; meta line lacks sprint segment |
| 02 | `02-inbox.png` | Inbox | Left pane: segmented `For me/Created/All` + `3 open` mono right; `INBOX · n` label; rows = big status glyph (amber ring / green split / rust ✕) + title 13/600 + mono sub `from ⟶ to · kind · age`, selected row `--bg-hover`; detail: chips row → title 20 → mono byline `from · date · id` → `READING ORDER · THE SPEC` numbered rows (mono `01` boxes) → floating bar `Comment · Hand back (filled ink) · Snooze S · ✓ Consume E (cobalt)` | close — polish row glyphs, spacing, detail title scale |
| 03 | `03-plan-board.png` | Plan | Header: `Plan` + `Sprint 12 ▾` select + segmented `Board/Backlog/Sprints`; right `type: all ▾ · project: all ▾` + `+ New item` cobalt; columns `TRIAGE / TODO / IN PROGRESS / REVIEW / DONE · CONSUMED` (caps label + count); card = `KIND` caps chip (OPEN amber / TASK neutral / HANDOFF amber) + mono `GEN-nnn` → title → foot (project dot + name · `P2` · `S12` · agent chip `● claude 12m` green / `A D S` kbd row / `4 notes` chip); done cards dimmed w/ mono sha; footer hint mono line; drag = status transition | shipped board uses handoff-state columns w/o card anatomy — rebuild on `listWorkItems` (loredex ≥2.8.0), TRIAGE=needs-triage, REVIEW column, GEN-ids = note names, `+ New item` writes a task note |
| 04 | `04-reader.png` | Reader | Three panes: `DEX TREE` (caps header + refresh/collapse icons, `Name/Content` segmented, `Search notes… ⌘P`, `_INDEX` + project sections w/ tinted rows + topic groups + note rows w/ mono dates) · note (breadcrumb mono `project ▸ topic ▸ date`, `Read / Edit ⌘E` segmented right, H1 + `FRESH` chip + mono byline, body w/ wikilinks cobalt, code block w/ copy) · **right rail 300 px**: `USED BY WORK ITEMS` cards (`GEN-151 open` amber / `GEN-142 doing` green) · `ABOUT THIS NOTE` typed rows (type/filed/tags/origin + `Raw frontmatter ▸`) · `BACKLINKS · 3` list · `THREAD` dashed card (mono chain) | reader keeps v2 anatomy; right rail sections + work-item cards missing; tree header/segmented styling off |
| 05 | `05-atlas.png` | Atlas (Map) | Lens segmented `Map/Project/Thread/Deep Dive` left of toolbar pills `Tours/Filters/Blocked/Changed/Export ▾/?`; breadcrumb `dex ▸ …` mono; Map = launcher cards per project | lens bar shipped; toolbar is v2 pills — restyle + breadcrumb placement |
| 18 | `18-atlas-project-lens.png` | Atlas › Project | `← Map` + project dot + name + mono stats; three columns: `RECEIVES` (OPEN card + dimmed CONSUMED) · `TOPICS · NEWEST FIRST` (mono `01` numbered rows + `n notes · date`) · `SENDS` (OPEN card + `trace thread ▸` link); `Deep dive ▸` button top-right | shipped Learn page differs in column framing/numbering |
| 06 | `06-agents.png` | Agents | Title + `● 2 LIVE` chip; `+ Connect an agent` secondary right; **table** `AGENT / MACHINE / DOING NOW / LAST WROTE` (live dot + name + model tag, mono machine, `GEN-nnn · task`, `12m · note` + `watch` link); idle row dimmed w/ `log`; `EVERYWHERE ELSE` chips row; **right panel**: `LIVE SESSION · CLAUDE · GEN-142` mono log `14:02 [MCP] handoffs_open → 1 open` / `[GIT] …` + trust footnote | shipped roster = stacked rows; needs table anatomy, Connect-an-agent (mint-token flow exists), session panel formatting `[MCP]/[GIT]` |
| 07 | `07-activity.png` | Activity | Segmented `All/Handoffs/Consumes/Sync`; right mono `everyone ▾ · from the dex git log`; day group labels; rows = caps kind chip (CONSUME green / FILE green / STATUS neutral / HANDOFF amber / SYNC neutral) + rich sentence (bold actor, mono ids, italic note titles) + mono time + action link (`view/open/board/sync`) | shipped feed cards close in spirit; chip/row/action anatomy differs |
| 08 | `08-settings-general.png` | Settings › General | **Settings = its own two-pane IA**: left settings-nav (search field; `WORKSPACE · SHARED`: General, Projects & contracts, Members & agents, Filing rules; `PERSONAL · THIS MACHINE`: Appearance, Typography, Shortcuts; `SYSTEM`: MCP server ●, Sync & git ●, GitHub ● — status dots) + content pane. General: `Dex name` row + `Product grouping` row; mono footnote `workspace-shared — synced through the dex remote` | shipped = 3 flat tabs — **full IA rebuild** |
| 09 | `09-settings-projects-contracts.png` | › Projects & contracts | project rows (dot + name + mono path + Remove) + `+ Add project folder…`; `EXTRA CONTRACT GLOBS` mono textarea card | v2 cards; restructure to rows |
| 10 | `10-settings-members-agents.png` | › Members & agents | one roster: owner row (avatar + `owner · git config`) + agent rows (live dot + name + `agent · bearer token ok` + Revoke); footnote `humans from git attribution · agents from MCP tokens — one roster` | new page — merge identity + agent tokens here |
| 11 | `11-settings-filing-rules.png` | › Filing rules | `NEVER ROUTE` glob chips (`×` remove) + `+ add glob` + footnote `the CLI honors the same list`; `DUPLICATE NOTES` row (`! n duplicates` + rust `Remove older`) | scope + duplicates exist as v2 cards; re-anatomy |
| 12 | `12-settings-appearance.png` | › Appearance | `Theme` row w/ segmented `System/Dark/Light`; `Reduce motion` toggle | + reduce-motion setting (new) |
| 13 | `13-settings-typography.png` | › Typography | three rows `Interface/Code & machine facts/Note body` w/ select pills; footnote `v3 defaults — per-dex overrides stay; retro note fonts retired` | condense v2 typography grid to rows |
| 14 | `14-settings-shortcuts.png` | › Shortcuts | four rows (`Command palette ⌘K`, `Places 1-8`, `New handoff · Consume C · E`, `Zoom out / close esc`) + `? opens the full cheatsheet anywhere` | new page (cheatsheet stays) |
| 15 | `15-settings-mcp-server.png` | › MCP server | green status card `● Serving agents on 127.0.0.1:52017` + `2 connected now` + `copy connect command` mono button + `test connection` + `view live sessions →`; `Port` row; toggles `Start server when a dex opens`, `Expose write tools (vault_store, work_update)`; mono footnote re status dot | shipped: port field only — add status card/actions/toggles |
| 16 | `16-settings-sync-git.png` | › Sync & git | green `● In sync with origin` card + `Sync now ⇧⌘S` + mono `poller: 60s`; compact mono grid (remote·branch / ahead·behind / last pull·push / merge driver·gitattributes); footnote `no git warnings this session — the old Sync view lives here now` | shipped panel close in data, needs the card+grid anatomy |
| 17 | `17-settings-github.png` | › GitHub | signed-out: rust card `! gh CLI not found — commit links stay plain` w/ mono install lines + Check again; `OR SIGN IN DIRECTLY — DEVICE FLOW` label + cobalt `Sign in with GitHub` + mono footnote (`token → OS keychain · SSH remotes never need this`) | shipped card functional; adopt anatomy/copy |
| 19 | `19-modal-new-handoff.png` | New handoff modal | dark overlay; modal ≈640 px: title + ✕; caps field labels (`TO PROJECT` select, `OBJECTIVE * required` rust, `READING ORDER · AUTO-SUGGESTED` checked rows w/ kind chip right); footer `Cancel` ghost + `Publish` cobalt | compose modal exists; restyle labels/rows/footer |

## Parity workplan (one PR per row, reference attached)

1. **Shell**: top ⌘K bar + sync pill + avatar; sidebar rebuild (+ New [C],
   numbered rows, product shelves, keys footer, no group labels) — touches
   every screen, lands first.
2. **Settings IA** (08–17): two-pane settings-nav with status dots + search.
3. **Today rail + triage polish** (01, 19).
4. **Plan on real work items** (03) — loredex ≥ 2.8.0 `listWorkItems`.
5. **Reader right rail** (04). 6. **Agents table + session panel** (06).
7. **Activity anatomy** (07). 8. **Atlas toolbar/Project lens** (05, 18).
