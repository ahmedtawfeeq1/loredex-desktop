# Loredex Desktop v0.1.0 — first testable build (Apple Silicon)

Native macOS companion for the [loredex](https://github.com/ahmedtawfeeq1/loredex) ecosystem: vault reader, handoff inbox/outbox, search, sync health, activity feed, and an in-app MCP server — no Obsidian required.

## Install (testers)

Requires an Apple Silicon Mac (M1 or newer), macOS 14+.

1. Download `Loredex-0.1.0-arm64.dmg` below, open it, drag **Loredex** to Applications.
2. **This build is unsigned** (no Apple Developer certificate yet), so Gatekeeper will block the first launch. Either:
   - Right-click Loredex.app → **Open** → **Open** in the dialog, or
   - Terminal: `xattr -dr com.apple.quarantine /Applications/Loredex.app`
3. Launch, then **File → Open Vault… (⌘O)** and pick any loredex vault folder (a folder with `projects/` + `_index/` created by `npx -y loredex@latest init`).

## What to try

- Browse and read notes; click `[[wikilinks]]` (broken ones get diagnostics, never phantom files)
- **⌘K** — command palette + faceted search
- **Inbox** — open handoffs addressed to your project; hit **Consume** and watch the stamp flip; your identity lands in the note's frontmatter
- **Sync** panel — ahead/behind vs the vault's git remote
- **Activity** — the team's route/handoff/consume/sync history from vault git log
- While the app runs, `~/.loredex/desktop.json` exposes the in-app MCP server (bearer token inside) — point Claude Code at it and the agent reads the SAME vault the app shows

## Known limits (v0.1)

- Unsigned build (signing + notarization is the next milestone)
- No auto-update — testers re-download
- Manual refresh (no file watcher yet); no create/join-vault wizard yet
- Feedback → GitHub issues on this repo

Built from 36 BMAD stories; 18 shipped in v0.1 — see `V1-STATUS.md` and `docs/` for the full plan, research, and story board.
