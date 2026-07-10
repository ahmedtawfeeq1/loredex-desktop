# Story 15.4: Public-facing docs — README rewrite + USER-GUIDE

## Status

Done

## Story

**As a** developer or team lead who lands on the loredex-desktop GitHub repo,
**I want** a README that says what the app actually is (with a real feature tour, install path, and architecture sketch) and a user guide that walks every shipped view,
**so that** I can decide to install it, get it running, and use every surface without reading story files or the source.

## Acceptance Criteria

1. **README.md rewritten** for a public audience: hero section referencing `build/icon.svg`, one-paragraph statement of what Loredex Desktop is (ecosystem manager for loredex vaults — reader, handoff lifecycle, atlas, contracts, wizards, in-app MCP), feature tour using the real view names (Home / Reader / Handoffs / Atlas / Contracts / Search / Activity / Sync / Settings), install section (release DMG + the unsigned-build `xattr` caveat, until signing ships), build-from-source section (including the local-tarball loredex pin caveat and the `predev` natives staging), a three-process architecture sketch, and links to the loredex CLI repo and `docs/`.
2. **docs/USER-GUIDE.md written**: walks each view in sidebar order, plus the first-run screen, create/join wizards (and the `loredex://join` deep link), route-a-note, the ⌘K palette, a complete keyboard table (matching `actions/registry.ts` + `ShortcutCheatsheet.tsx` exactly), and an MCP integration section covering `~/.loredex/desktop.json` and connecting Claude Code via `claude mcp add`.
3. **No invented features**: every claim verified against the code or a Done story; deferred items (signing, auto-update, CLI `--via-desktop` proxy, route undo) are stated honestly or omitted. Tone matches the loredex CLI repo's README voice — direct, concrete, no marketing fluff.
4. **Links valid**: every relative link in both files resolves to an existing file in the repo; external links point at the real loredex repo/package.
5. Suites stay green; typecheck + build clean (docs-only change, verified anyway per the M3 rule).

## Tasks / Subtasks

- [x] Verify the feature surface against code + V2-STATUS (AC: 3)
  - [x] View names/order from `actions/registry.ts` `VIEW_ORDER`; shortcuts from `appActions()` + `ShortcutCheatsheet.tsx` `CONTEXT_ROWS`
  - [x] MCP host facts from `src/core/mcp-server.ts` (port 52017, bearer token, Origin check, root-URL endpoint per `mcp-server.test.ts`) + `src/core/discovery.ts` (file shape, chmod 600, removed on quit)
  - [x] Six MCP tools confirmed in `loredex/src/mcp/server.ts` (vault_search, vault_note, handoffs_open, handoff_consume, product_state, vault_store) — same factory both hosts; identity echo from `withIdentityEcho`
  - [x] `--via-desktop` grep of `loredex/src` — NOT shipped (story 1-7 deferred); guide says connect over HTTP directly
  - [x] Install caveats from RELEASE-NOTES-v0.1.0 (unsigned → `xattr -dr com.apple.quarantine`, macOS 14+, arm64) and package.json (`predev` natives staging from story 15.1 — no manual electron-rebuild anymore)
  - [x] Lib pin caveat from package.json (`file:../loredex/loredex-2.1.0.tgz`, 2 commits past npm) per V2-STATUS release TODO 1
- [x] Rewrite README.md (AC: 1, 4)
- [x] Write docs/USER-GUIDE.md (AC: 2, 4)
- [x] Link check + full gate (AC: 4, 5)

## Dev Notes

- Voice reference: `../loredex/README.md` — short declarative sentences, tables for scannable lists, honest FAQ-style caveats, no superlatives. Desktop README keeps the same register but stays leaner (no infographics assets exist in this repo yet).
- The GitHub-rendered hero uses `build/icon.svg` directly (`<img src="build/icon.svg">`); it is in-repo so the link is always valid.
- Honesty lines required by the current state: unsigned builds (1-8/1-9 open), local tarball pin (release blocker), no auto-update, `loredex mcp --via-desktop` planned-not-shipped, route undo deferred (epic 4), contract timeline filters per-project not per-file.
- Keyboard table is transcribed from the registry — if 15.3's registry changes, this table is the only doc to update (the in-app `?` cheatsheet derives from the registry and cannot drift).

### Testing

- Docs-only story: no new tests. Gate = full app suite + typecheck + build green, plus a scripted relative-link existence check over both files (run in-session, evidence in Dev Agent Record).

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-10 | 0.1 | Drafted + implemented (M3 hardening cycle) | Dev Agent |

## Dev Agent Record

### Agent Model Used

Claude Fable 5 (claude-fable-5)

### Debug Log References

- Link check: scripted scan of every relative link + same-file anchor in README.md and docs/USER-GUIDE.md → ALL RELATIVE LINKS OK (README's cross-file `#mcp-connect-your-agents` anchor verified against the USER-GUIDE heading slug by hand)
- Gate: typecheck (node+web) clean; app suite 528/528 (67 files); electron-vite production build clean
- Flake fixed en route: `src/core/activity.test.ts` beforeAll (git-heavy setup) timed out at the 10s default under full-suite load, passed solo in 2.3s — given the suite's explicit 30s convention (identical class + fix as the QA-pass sync.test.ts flake)

### Completion Notes List

- **README rewritten** front to back: centered hero on `build/icon.svg`, one honest paragraph of what the app is, a 9-view tour table using the exact `VIEW_ORDER` names, MCP teaser, install (Releases DMG + the unsigned `xattr -dr com.apple.quarantine` caveat + "no auto-update yet"), build-from-source (with the local-tarball loredex pin caveat stated plainly), a three-process ASCII architecture sketch + the anti-second-engine and state-placement rules, ecosystem table linking the CLI repo, and a docs table. Voice matched to the CLI README (tables, short declaratives, honest caveats); leaner because this repo has no infographic assets.
- **docs/USER-GUIDE.md written**: getting started (first-run's three real cards + ⌘O + identity gating), the window/chip/badge, all nine views in sidebar order with their real behaviors (Home generated-brief fallback, Reader diagnostics + drag-route, full lifecycle table incl. reopen + snooze-never-auto-writes, Atlas three zoom levels + hyperlink-everything + toolbar, Contracts mentioned/heuristic tiers + per-project-filter honesty note, Search facets verbatim, Activity, Sync poller cadence + gating, Settings five sections), route-a-note (undo honestly marked planned), both wizards + deep link + no-OAuth message, palette, keyboard map transcribed from the registry + `CONTEXT_ROWS`, notifications, and the MCP section: discovery-file shape from `discovery.ts`, `claude mcp add --transport http` one-liner (sed pattern verified against the pretty-printed JSON `writeDiscovery` emits), the six tools verified in `loredex/src/mcp/server.ts`, identity echo, loud port-conflict policy, and `--via-desktop` marked planned-not-shipped (grep of lib src: absent; story 1-7 deferred).
- **No invented features:** deferred/known-gap items are either stated (signing, auto-update, tarball pin, route undo, per-file contract filter, --via-desktop) or omitted; nothing described that isn't in a Done story + the code.

### File List

- README.md — rewritten for public audience
- docs/USER-GUIDE.md — NEW: full view-by-view guide + keyboard table + MCP section
- src/core/activity.test.ts — beforeAll given the suite's 30s timeout convention (parallel-load flake, unrelated to docs but blocking the gate)
- docs/stories/sprint-status.yaml — board entry
- docs/stories/epic15.story4-public-docs.md — this story

## QA Results

**PASS (with two one-word doc fixes applied)** — fresh-eyes M3 QA, 2026-07-10.

- Claims spot-checked against code (QA, independent of the dev pass): MCP port 52017
  (`mcp-server.ts` `PREFERRED_MCP_PORT`), discovery file shape `{port, token,
  engineVersion, schemaVersion}` chmod 600 removed on quit (`discovery.ts`), six tools in
  `loredex/src/mcp/server.ts`, poller 60 s focused / 5 min blurred (`poller.ts`
  `FOCUSED_INTERVAL_MS`/`BLURRED_INTERVAL_MS`), ⌘O Open Vault menu accelerator
  (`main/index.ts`), keyboard table matches `registry.ts` + AtlasView/HandoffCardView
  context keys, `--via-desktop` honestly marked not shipped, tarball-pin caveat present.
- Relative links re-checked by QA script over both files — all resolve;
  `#mcp-connect-your-agents` anchor exists in USER-GUIDE.
- **QA fixes:** the Search facet list said "project, topic, type, status, from" in both
  files but the view + `Facets` type ship six facets — added `to` (README tour row,
  USER-GUIDE Search). README's `test:e2e` line now names it the release gate (story 6.3
  AC3 said the README documents that; the 15.4 rewrite had dropped the phrase).
- Gate re-run after fixes: suites green, links green.
