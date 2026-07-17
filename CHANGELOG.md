# Changelog

All notable changes to Loredex Desktop are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning is
[SemVer](https://semver.org/). Installers for each release (macOS · Windows ·
Linux) are on the [releases page](https://github.com/ahmedtawfeeq1/loredex-desktop/releases).

## [Unreleased]

## [0.7.1] - 2026-07-17

### Fixed
- **In-app GitHub sign-in now beats the machine's git credential helpers**:
  when you sign in inside Loredex, the app's git operations (poller pull,
  sync, wizard clone/push) reset the helper chain via env config and use
  YOUR stored token — the gh CLI's active-account helper can no longer
  serve the wrong account for a private dex ("repository not found").
  Signed out = your own git setup, untouched.

## [0.7.0] - 2026-07-17

### Changed
- **DESIGN v3 "Obsidian Glass / Cobalt"** — the full approved redesign
  (stories 26.1–26.9). Dark-first §2 token system, self-hosted Geist /
  Geist Mono, the locked R1 brand mark; §4 primitives (cobalt-gradient
  buttons with kbd hints, glyph status chips, pressed-glass segments);
  Home → **Today** (ranked needs-you triage, in-flight agents, new
  knowledge, insight rail); Handoffs → two-pane **Inbox** (For me /
  Created / All, reading order, floating action bar); one-key triage
  A/D/S/E + C everywhere; Atlas lenses **Map · Project · Thread · Deep
  Dive**; Settings regrouped Workspace / Personal / System with the Sync
  view absorbed; first-run checklist. Every v2 capability re-homed, none
  removed.

### Added
- **Plan** (preview flag): Board · Backlog · Sprints over the handoff
  state machine — enable via ⌘K "Enable the Plan preview".
- **Agents view**: roster from git attribution + a read-only live MCP
  session feed; per-agent MCP tokens (mint once, revoke live) attribute
  each tool call.
- **GitHub sign-in** (optional, SSH dexes need none): reuse a gh session,
  paste a PAT, or the OAuth **device flow**; tokens in the macOS keychain
  (encrypted-file fallback elsewhere); dex registry — list repos tagged
  `loredex-dex`, Join (clone) or Create from the app; HTTPS remotes ride
  the stored token via an askpass shim.

### Fixed
- Amber/gold no longer collides with warning semantics anywhere; status
  is always glyph + label, never color alone.

## [0.6.0] - 2026-07-16

### Added
- **Interactive checklists**: clicking a task checkbox in the reader writes
  `[x]`/`[ ]` straight back into the note file — same identity requirement
  and git auto-commit as edit mode; the file stays the only truth. Stale
  renders and code-fence lookalikes are refused, never mis-written; hover
  previews and briefs keep inert checkboxes.

### Changed
- **External links are visibly hyperlinks** (Addendum D2): note-body web
  links render in link blue (`#0B57D0` light / `#8AB4F8` dark), underlined
  at rest. Wikilinks keep their gold treatment; app chrome stays navy.

## [0.5.0] - 2026-07-14

### Added
- **Agent-ops dex support** (loredex 2.5.0 dex types): a dex declaring
  `_index/dex.json` `{"type": "agent-ops"}` gets a **Clients** view — the fleet
  grouped by Manager with category tag chips and pending-inbox badges, and a
  per-client page: pipelines with their ordered `01 → NN` stage rail, agents,
  knowledge tables, automation workflows, inbox attention, and schema problems
  from the doctor's lint engine.
- **Workspace panel**: generate or check a client's agent tooling
  (`.mcp.json` / `.claude/settings.json` / `AGENTS.md`) from its committed,
  secret-free `workspace.yml` — generated files are gitignored; missing
  `${ENV_VAR}` secrets are reported, never guessed.
- **Data files in the tree and reader**: agent-ops dexes list yaml/json/csv
  (knowledge tables, settings exports, action files, workflow exports); csv
  opens as a table, yaml/json open read-only in the editor chrome.
- **`manager:` search operator** — narrow hits to clients filed under one
  manager (products manifest).
- Create-dex wizard offers the dex type (Research | Agent ops).

### Changed
- Research dexes are untouched: the Clients view stays out of the nav, ⌘1-9
  keep their bindings, and the tree stays markdown-only.
- Pinned loredex engine: **^2.5.0** (dex types, agent-ops scaffolds/lints,
  structural data indexing).
- CI is tests + typecheck + native-ABI smoke only; the redundant per-push DMG
  package was dropped (`release.yml` is the sole packaging/publishing gate on
  tags, and it builds all three OS installers).
- Bumped GitHub Actions to Node 24 runtimes (`checkout@v7`, `setup-node@v6`).

### Fixed
- CI is green again: an invalid-YAML step name (unquoted colon) that failed the
  whole workflow at parse time; a test that read an external sibling vault at
  collection time (ENOENT on runners); and the timing/git-sensitive perf suite
  now skips under CI (kept as a local/manual gate).

### Docs
- Corrected the macOS "damaged" first-launch fix — on Apple Silicon you need
  `xattr -cr` **and** an ad-hoc `codesign`, not quarantine removal alone.
  Install filenames are now version-agnostic.
- Added [SIGNING.md](SIGNING.md) and an activate-on-secrets code-signing +
  notarization hook in `release.yml` (inactive until the certs/secrets exist).

## [0.4.0] - 2026-07-13

### Added
- **App shell polish** ([#1](https://github.com/ahmedtawfeeq1/loredex-desktop/pull/1)):
  - **Grouped sidebar navigation** — the nine views are sectioned into
    Workspace / Collaborate / Knowledge / System (⌘1–9 still bound to position).
  - **Reskinned Settings** — a tabbed, multi-column card layout (General ·
    Typography · Vault · Integrations) replacing the flat stack.
  - **Font control** — pick the app UI font and per-note-format fonts (Title /
    Headings / Body / Code) from 14 bundled, fully-offline fonts, with a
    live-preview picker. Defaults match the previous look (no change until opted
    in); Arabic fallbacks included.
- **Vault tree grouping** — the Reader tree groups Product → Project → Topic → Note.

### Security
- Validate the project name before spawning the loredex CLI (`recurateProject`):
  reject leading `-` (argv flag smuggling) and `/`/`..` (path traversal).

## [0.3.0] - 2026-07-12

### Added
- Product scoping across the app, aligned with the loredex 2.4.0 core — notes
  and views can be grouped by their product.

## [0.2.1] - 2026-07-12

### Fixed
- Release plumbing: depend on the published `loredex` package (pinned) instead
  of a local tarball / sibling checkout; add author email for the Linux `.deb`.

## [0.2.0] - 2026-07-12

### Added
- **Actionable home dashboard** — the Attention queue's **Re-curate** actually
  re-curates a stale project's brief (runs curate in the core host with a busy
  state), and **See board** navigates. No more dead buttons.
- **Route receipts + undo** — every route lands a receipt; undo restores
  byte-identical source state.
- **Never-route filing-scope globs** — keep chosen paths out of routing.

## [0.1.0] - 2026-07-10

### Added
- First testable build (Apple Silicon, unsigned). The native companion for a
  loredex vault: reader with working wikilinks, handoff inbox/outbox, search,
  sync health, activity feed, and an in-app MCP server — no Obsidian required.

[Unreleased]: https://github.com/ahmedtawfeeq1/loredex-desktop/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/ahmedtawfeeq1/loredex-desktop/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/ahmedtawfeeq1/loredex-desktop/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/ahmedtawfeeq1/loredex-desktop/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/ahmedtawfeeq1/loredex-desktop/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/ahmedtawfeeq1/loredex-desktop/releases/tag/v0.1.0
