# Changelog

All notable changes to Loredex Desktop are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning is
[SemVer](https://semver.org/). Installers for each release (macOS · Windows ·
Linux) are on the [releases page](https://github.com/ahmedtawfeeq1/loredex-desktop/releases).

## [Unreleased]

### Changed
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
