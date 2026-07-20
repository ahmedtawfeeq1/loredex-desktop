# Changelog

All notable changes to Loredex Desktop are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning is
[SemVer](https://semver.org/). Installers for each release (macOS · Windows ·
Linux) are on the [releases page](https://github.com/ahmedtawfeeq1/loredex-desktop/releases).

## [Unreleased]

## [0.9.10] - 2026-07-20

### Fixed
- **Your identity no longer looks lost on every launch.** It was always saved —
  it just wasn't *loaded* at startup unless you happened to open Settings, the
  Inbox or the vault wizard. Launching straight into the Reader left the app
  thinking you had no identity, so editing a note refused with "Editing needs an
  identity" until you re-saved it. Identity now loads with everything else at
  boot (and reloads on a vault switch, since the fallback git identity is
  per-repo). The warning also waits for that load to finish before claiming
  anything is missing.

## [0.9.9] - 2026-07-20

### Fixed
- **"Chat Here" stopped working after the first chat.** It was hitting the
  4-session limit and failing *silently* — the picker just collapsed. Failures
  now say what went wrong, and the limit is 8 (it is per window, so each pop-out
  gets its own).
- **The second pop-out lost its loredex MCP tools.** Closing any pop-out deleted
  the discovery file that secondary windows use to reach the MCP host — even
  though that pop-out never wrote it. Every pop-out opened afterwards came up
  without tools. (Closing the *main* window while pop-outs are alive still ends
  their MCP; that needs real port brokering and is tracked.)
- **Saved client credentials could disappear (Windows).** The credential store
  read an undecryptable file as an *empty* one, and since every save is
  read-modify-write, the next save overwrote the real contents. It now refuses to
  read what it cannot decrypt instead of quietly discarding it, and the
  non-secret metadata (label, username, url, note) moved to the app database.
  Existing credentials migrate on first read; secrets stay in the OS keychain on
  macOS and the encrypted file elsewhere.

## [0.9.8] - 2026-07-20

### Added
- **Open a note straight from the chat.** When a tool creates or updates a
  markdown note, the tool row now carries an `↗ <name>` button that opens it in
  the reader — and it *switches to the Reader* first, so the click works from
  Clients, Atlas, anywhere. (Previously the note loaded invisibly behind the
  current view.)
- **Pop a note out into its own window.** `⧉ Pop out` on any note, the same
  affordance chat and the terminal already had. The window is reader-only: no
  sidebar, no rails, just the note.
- **Before/after review on a note.** `⇄ Changes` opens a two-column diff of the
  note's most recent commit — the same review shape the contract timeline gives
  an API change, now on the note itself. Works in read *and* edit mode, and on
  research and agent-ops dexes alike (it is plain git history; nothing is
  written).

### Changed
- **Note metadata rail starts collapsed.** Notes open at full prose width; the
  metadata panel is one click away.

## [0.9.7] - 2026-07-20

### Added
- **Tool rows show their input.** A tool call now displays **what it was asked
  to do**, not just what came back — ACP has always sent `rawInput`, the panel
  simply never read it. Expanded rows have **Input** / **Output** sections, and
  a tool with input but no output yet can be inspected too.
- **Elapsed time on running tools.** A pending/running row ticks a live counter
  (`12s` → `4m 05s`), so a long command reads as *working* rather than *stuck*.
- **Update notice.** The top bar tells you when a newer release exists and links
  to the download. (Not a true auto-updater: that needs a code-signed app, and
  these builds are unsigned — a silent-failing updater would be worse.)

### Fixed
- **Arabic and other non-ASCII tool output renders properly.** MCP servers
  serializing with Python's `json.dumps` escape non-ASCII by default
  (`ensure_ascii=True`), so Arabic arrived as `خا…`. JSON output is now
  decoded (and pretty-printed) before display, and text blocks use `dir="auto"`
  so right-to-left scripts lay out correctly. Non-JSON output is untouched.

### Changed
- **Permission modal reads properly.** The proposed diff — the thing you're
  actually judging — is wider (up to 920px) and taller, with an
  **expand/collapse** toggle to see the whole change instead of a summary. The
  *"always allow"* toggle now sits on the decision line beside Allow/Reject
  rather than floating in its own centered row.

## [0.9.6] - 2026-07-20

### Changed
- **The chat composer can be made taller.** Drag its **bottom-right corner** to
  set the height you want (capped at 45% of the panel so it can't swallow the
  thread). It also auto-grows further on its own — up to 12 rows instead of 6 —
  so a long dictated or pasted message isn't stuck in a two-line peephole.

## [0.9.5] - 2026-07-20

Usability pass over the agent panel, terminal, clients and reader — plus one
real MCP bug fix.

### Fixed
- **A continued conversation keeps its folder.** Switching provider
  (CONTINUE IN → Codex/Gemini), reopening from history, or popping a chat into
  its own window used to restart the session at the **vault root**, so the
  client's `.mcp.json` servers silently disappeared (MCP is discovered at
  adapter startup — a later `cd` can't recover it). Conversations now record
  their working directory and continuation respawns there. Falls back
  cwd → client slug → vault root, each checked to still exist. A client-scoped
  thread is asked whether to continue **in its folder** or at the vault root.
- **The code-block Copy button no longer runs away.** It sat inside the
  horizontally-scrolling `<pre>`, so scrolling sideways dragged it across the
  code; it now lives in a non-scrolling wrapper, pinned to the visible corner.
- **Terminal actions stop overlapping the app chrome.** On a narrow left dock
  the `dock / pop / split / split / close` row used to run over the logo; below
  a width threshold it collapses into a **☰ menu** carrying every action.

### Changed
- **You can type while the agent is answering.** Composing and sending are now
  separate rights: type, edit, paste and attach mid-turn — only Send is held
  (it already becomes **Stop**), and ↵ during a turn keeps your draft instead of
  dropping it.
- **Less chrome above the thread.** The pop-out note, session rows and
  CONTINUE IN collapse into one line; the default header is just providers,
  CONTEXT, and the session/tools/MCP summary. The client chip, run state and
  close stay visible while collapsed.
- **The composer action strip is gone.** `New conversation` now lives only in
  the header `＋` (clearly labelled on hover); `Retry` was removed.

### Added
- **Chat Here asks which agent.** Starting a client-scoped chat offers Claude /
  Codex / Gemini with an auth dot each, instead of silently using whichever
  provider the panel happened to be set to.
- **Search the fleet.** The Clients view filters by client name (also manager
  and tag).
- **Jump from the reader to a project's page.** Each project/client row carries
  a `›` that opens *its* page for the dex type — the client console on an
  agent-ops dex, the Atlas project lens on a research dex.

## [0.9.4] - 2026-07-20

The **agent-ops app completion** — the desktop grows from a knowledge reader
into a control surface for a fleet of client AI-agent deployments. Everything
below is gated to `agent-ops` dexes; a research (default) dex is byte-identical
to before.

### Added
- **Client-scoped agent chat** — "Chat Here" on a client page opens the AI panel
  in that client's folder (materializing its tooling first if stale), so the
  session runs with the client's own MCP servers. A `◈ <client>` chip marks
  scoped sessions on the session row and in the history dropdown. Conversations
  now **auto-title** from their first message.
- **Snapshots & Versions** — `⧉ Snapshot` on any pipeline/agent versions its
  definition files into `_versions/<unit>/<stamp>/` as one attributed commit (a
  note + include-tables option in the dialog). A **Versions** section lists them
  newest-first; each row opens its manifest in the reader. Backed by the new
  `loredex snapshot` command + `vault_snapshot` MCP tool, which can also capture
  live platform state fetched via the client's own MCP.
- **Client credentials** — a per-client login card keeps platform usernames/
  passwords in your OS keychain (never the dex): masked rows with Reveal / Copy /
  Edit / Delete. Secrets live in the keychain (encrypted-file fallback);
  metadata is stored separately so the card lists logins without touching a
  secret.
- **Always-allow permissions** — an agent permission request for a scoped client
  offers *"Always allow `<kind>` for `<client>`"*; matching requests then
  auto-answer with no modal. Manage/revoke the rules in **Settings → Agent
  permissions**. A TopBar badge counts pending requests while the panel is closed.
- **Open in the OS** — binary docs/images (`.pdf`, `.xlsx`, `.png`, …) in the
  tree open in your default app; folders and knowledge-tables reveal in Finder/
  Explorer. Guarded by a realpath containment check + an ext **allowlist** —
  teammate-committed executables (even symlinked under a safe name) are revealed,
  never launched.
- **Scaffold from the UI** — `+ Pipeline` / `+ Agent` / `+ Stage` create units
  (stage insert renumbers), and an inbox panel consumes intake files (open /
  keep→randoms / delete) — each one attributed commit. No hand-editing dex files.

### Changed
- **Auto-push** — the background poller now pushes settled local commits (30s
  debounce, fast-forward-only, never holds the write lock, fails fast on a bad
  remote) on agent-ops dexes; a TopBar "N unpushed" pill surfaces commits that
  linger. Research dexes stay pull-only, exactly as before.

## [0.8.0 – 0.9.3] - 2026-07-17 → 2026-07-19

The platform the agent-ops work builds on (previously unreleased in this log):

### Added
- **AI agent panels** — chat with Claude Code or Codex over ACP in a side panel:
  rich markdown, tool-call diffs, usage/cost, slash-command autocomplete, image
  attachments, provider filter, resize. **Cross-provider continuation** carries a
  conversation from one agent to another; a **history dropdown** reopens past
  threads; **pop-out** windows run a chat or terminal standalone.
- **Embedded terminal** — a VS Code-style terminal (xterm.js) with splits,
  docked left or bottom, launched at a client's folder from "Open in Terminal".
- **Add-Client onboarding (agent-ops)** — a terminal-free flow to create a
  client, copy a golden client's standard tooling with per-client env rewrite,
  paste one token per connection, and run a live connection probe (green = a real
  MCP handshake, not just a held token). "Repair structure" normalizes the fleet;
  "Apply & retry" rebinds the MCP host without relaunch.
- **Clients view** — the agent-ops fleet: managers → clients → pipelines/agents →
  stages, per-client pages with the ordered stage rail, knowledge tables,
  workflows, inbox, and the workspace tooling panel.

## [0.7.4] - 2026-07-17

### Changed
- **Warning log retires on a clean sync**: a fully green tick (reachable,
  ok) expires every entry logged before it — the log now shows only what
  happened since the last good sync, instead of parking old failures under
  a healthy board. Warnings racing in after the clean moment are kept.

## [0.7.3] - 2026-07-17

### Fixed
- **In-app GitHub token now reaches ALL of the app's git** — the embedded
  engine's own git calls (Sync now, auto-commit push, reachability probe)
  spawn from the core host and only saw process env; the credential
  override is now applied process-wide while signed in, removed fully on
  sign-out. Private HTTPS dexes sync under the in-app account.

## [0.7.2] - 2026-07-17

### Fixed
- **The app rendered only Settings** — a build-script splice made the
  Settings redirect the app's default export, orphaning the real shell
  (sidebar, Today, Inbox, every view). The full v3 app now actually mounts.
- GitHub card no longer sticks on the boot-time "core host port was
  re-brokered" race (standard retry, like every store).

### Added
- **Sign in as a different account while a gh CLI session exists**: the
  GitHub card now offers device-flow / PAT sign-in even when it detected
  gh — an in-app sign-in outranks the gh session and drives the app's git,
  without touching your gh CLI.

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
