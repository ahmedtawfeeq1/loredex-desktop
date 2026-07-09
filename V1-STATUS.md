# Loredex Desktop v0.1 — Status

QA pass: 2026-07-10 (fresh-eyes BMAD QA agent). Per-story verdicts live in each story file's
QA Results section (`docs/stories/`); the board is `docs/stories/sprint-status.yaml`.

## What v0.1 contains

**Epic 1 — Walking Skeleton (M0)** · 5 of 9 stories done, 1 partial

- Electron app: three-process topology (main / sandboxed renderer / `utilityProcess` core host),
  crash respawn with port re-brokering, typed IPC seam (`src/shared/ipc-contract.ts`).
- Embedded loredex engine: `src/core/engine.ts` is the sole `import 'loredex'` site; config
  resolves exactly once per host lifetime (F6 defense); pinned-release checks for the F8/F6 fixes.
- Vault picker (native panel, persisted) + permanent vault identity chip (name, path, engine
  version, config source, sync dot, full identity tooltip).
- In-app MCP server: Streamable HTTP on 127.0.0.1:52017, bearer token + Origin validation,
  `~/.loredex/desktop.json` discovery file (chmod 600, removed on clean shutdown), vault identity
  echoed in every tool response.
- Partial (1.5): loredex PR-8 event-emitter subset landed (loredex 99a134d); PR-5 async git open.

**Epic 2 — Vault Reader & Product Home** · 4 of 6 done

- Vault file tree (dotfiles/.git hidden), read-only GFM rendering through one sanitized unified
  pipeline, frontmatter metadata panel, 1 MB notes without freezing.
- Wikilinks: Obsidian shortest-path resolution in the core host, collision picker with project
  context, hover previews, broken-link diagnostics (rust dotted, never auto-created).
- Faceted full-text search (lib `searchVault` + app-side facet narrowing) with a search view and
  a global Cmd+K palette; 42 ms on a 1,000-note vault.
- Product home: rendered Start Here brief, freshness badge, SHA hyperlinks to the owning remote,
  live-rendered dashboard fallback. (Re-curate button cut — seam registered, see deferred.)

**Epic 3 — Handoffs, Consume & Notifications** · 5 of 7 done

- Inbox/outbox board per project + company-wide PM view; routing-slip cards (DESIGN.md signature);
  brief opens with reading-order notes inline.
- Consume with identity: lib `consumeHandoff` writes who/when + `loredex_schema: 1`; app-side
  identity profile (never in the vault); per-command git identity injection; honest receipt UI
  (frontmatter diff + pushed/pending).
- Native notifications + dock badge (open inbound only, batch collapse >3), refresh-triggered
  checks (no poller in v0.1).

**Epic 4 — Routing Safety** · nothing shipped (all deferred).

**Epic 5 — Onboarding, Registry & Sync Health** · 2 of 7 done

- Lib `syncStatus()` (read-only: reachability, branch match, ahead/behind, merge-driver +
  F8 gitattributes validation, last pull/push) and the sync health panel with warning log,
  sync-now with structured report, schema handshake banner, MCP port-conflict banner, and the
  vault-chip dot (ink=clean / amber=ahead-behind / rust=error).

**Epic 6 — Activity Feed & MVP Hardening** · 2 of 3 done

- Lib `parseActivity` grammar (route/consume/handoff/sync, identity-attributed) shared with the
  CLI; feed view with day headers, initials avatars, click-through navigation, load-older paging.

## Verification evidence (QA pass 2026-07-10)

| Check | Result |
|---|---|
| App unit tests (`npm test`) | 118/118, 23 files |
| Lib unit tests (loredex repo) | 115/115 (after QA flake fix) |
| `npm run typecheck` | clean (node + web projects) |
| `npm run build` (production) | clean |
| Launch smoke (`npm run dev`) | window + core host alive 3+ min, clean SIGTERM exit |
| MCP live checks | tools/list 200 w/ bearer; 401 no token; 403 bad Origin; identity echo present; discovery file 600 and removed on shutdown |
| M1-DoD driver (core host vs real nimbus vault, no UI) | tree ✓, readNote ✓, wikilink unique/ambiguous(3 candidates)/broken ✓, search 10 hits ✓, 8 handoffs (2 open) ✓, home brief ✓, syncStatus `ok 0/0` ✓, 29 activity events (all 4 kinds) ✓ |
| Design fidelity vs DESIGN.md | tokens exact in light+dark+data-theme, three-pane, permanent vault chip, routing-slip card to spec (stamp chip / U+27F6 route line / serif objective), :focus-visible ink rings, reduced-motion global kill, serif confined (1 violation fixed), zero system-blue |

QA fixes applied: lib `tests/handoff.test.ts` consume-test timeout (parallel-load flake) →
explicit 30 s; `.settings-title` serif → sans (DESIGN.md confinement). Window screenshot skipped:
screen-recording permission unavailable to the QA shell.

## Deferred (not Done) — one line each

- **1.5** loredex PR-5 async git + SyncReport — emitter subset landed; async git open (5.2 ships a shim).
- **1.7** `loredex mcp --via-desktop` proxy + doctor handshake — lib PRs 9/10 not started.
- **1.8** signed/notarized release pipeline — needs Developer ID cert + CI secrets; CI builds unsigned.
- **1.9** auto-update, beta channel, translocation guard — depends on 1.8's published releases.
- **2.3** vault watcher live refresh — no `@parcel/watcher`; manual Refresh action is the stand-in.
- **2.6** changed-since-last-brief diff — depends on watcher snapshots (2.3).
- **3.5** remote-event poller + write lock — no background fetch; a lock shim guards writes.
- **3.6** app.db read-state store — no better-sqlite3; identity/settings live in userData JSON.
- **Epic 4 (4.1–4.4)** routing safety (receipts, undo, dedupe, globs, drift) — lib PR-3 not started.
- **5.3/5.4** registry-in-vault + CLI migration — lib PRs 7a/7b not started.
- **5.5/5.6** join/create wizards + deep link — depend on registry (5.3/5.4).
- **5.7** registry company overview — depends on 5.3.
- **6.3** E2E Nimbus reproduction suite (M1 DoD) — no Playwright harness yet; this QA pass ran a
  module-level DoD driver as interim evidence.

## How to run it

```sh
# prerequisite: the sibling lib checkout must exist and be built
# (package.json pins "loredex": "file:../loredex")
cd ../loredex && npm install && npm run build

cd ../loredex-desktop
npm install
npm run dev        # launch the app
```

Then: File → Open Vault (⌘O) and pick a loredex vault (e.g. the nimbus simulation vault).
Views: Home (Start Here), Reader (tree + notes + wikilinks), Handoffs (board + consume),
Search (also ⌘K anywhere), Activity, Sync, Settings (identity + MCP port).
The MCP server publishes `~/.loredex/desktop.json` while the app runs.

Other commands: `npm test`, `npm run typecheck`, `npm run build`, `npm run dist` (unsigned DMG/ZIP).

## Release-time TODO

1. **Publish loredex to npm and swap the dep** — replace `"loredex": "file:../loredex"` with the
   exact-pinned 2.x release (PRs 1, 2, 4, 6, 8-subset are in the local lib repo, unpublished);
   update `ci.yml` to stop cloning the sibling.
2. **Story 1.8 signing pipeline** — Developer ID + hardened runtime + notarytool ("Accepted"
   asserted) + stapling + `spctl -a` gate; sign dugite binaries individually; `legal/` notices;
   release-please tagging.
3. **Story 1.9 auto-update** — electron-updater vs GitHub Releases, beta channel, translocation guard.
4. **Lib fix: qualify `HandoffCard.id`** — basenames collide across projects (real case in the
   nimbus vault: two open `2026-07-09-handoff-nimbus-backend-2`); consume-by-path or qualified id.
5. **Thread `-c user.name/email` argv through lib git calls** (PR revision) and delete the
   env-var identity shim in `src/core/git.ts`.
6. **Land PR-5 (async git + real stderr SyncReport)** and delete the `sync.run` shim in the app.
7. **Write `.loredex/engine.json`** on scaffold/migration (deferred slice of PR-2) so the NFR8
   handshake stops leaning on frontmatter stamps alone.
8. **Story 6.3 E2E suite** — the Playwright-for-Electron Nimbus reproductions are M1's DoD;
   v0.1 ships without it (module-level DoD driver evidence only).
