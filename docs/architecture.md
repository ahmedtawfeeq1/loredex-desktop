# Loredex Desktop Architecture Document

**Author:** Winston (Architect) · **Date:** 2026-07-09 · **Status:** Approved
**Audience:** dev agents. This is the distillation of `docs/plan/BUILD-PLAN.md` §3 (+ §6/§7 where dev-relevant). Dev agents read **this document and their story file only** — never the PRD or the full build plan. Decisions here are final; do not relitigate.

### Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-09 | 1.0 | Distilled from approved BUILD-PLAN | Winston |

## Overview

Loredex Desktop is an Electron app (macOS arm64 only) that embeds the published `loredex` npm library **in-process** inside a Node `utilityProcess` ("core host"). One engine serves the UI, the file watcher, git, and an in-app Streamable-HTTP MCP server — the CLI/agents connect to that same engine via a stdio proxy. Team-visible truth lives in vault frontmatter; per-user state lives in app-local SQLite; derived views are recomputed caches.

**Hard rule (anti-second-engine):** any operation that *writes* vault markdown/frontmatter MUST be a `loredex` lib export shared with the CLI. App-side code may implement only read-only view logic (link resolution, rendering, drift queries) and non-vault I/O (SQLite, notifications, GitHub network calls).

## Tech Stack

Pin **exact** versions in `package.json` (no `^`/`~` for runtime deps). Baseline versions below are current at authoring; a story that scaffolds or bumps must record the exact pin in its File List.

| Category | Technology | Version | Notes |
|---|---|---|---|
| Desktop shell | Electron | 43.x (pin exact) | arm64 only; majors pinned; 8-week cadence handled via dependabot + CI next-major lane |
| Language | TypeScript | 5.x | `strict: true` everywhere; ESM only |
| Build | electron-vite | 4.x | main / preload / renderer builds |
| Packaging | electron-builder | 26.x | DMG + ZIP (`ditto`), `LSMinimumSystemVersion` 14.0 |
| Updates | electron-updater | 6.x | GitHub Releases; `latest-mac.yml` stable, `beta-mac.yml` beta channel |
| Engine | loredex | exact pin (2.x) | THE engine; bumped only via lib-PR stories |
| UI framework | React | 19.x | function components only |
| UI state | zustand | 5.x | thin stores per view; no Redux |
| Markdown | unified + remark-parse + remark-gfm + remark-rehype + rehype-sanitize + rehype-react | latest stable | the ONLY sanctioned rendering pipeline; custom wikilink plugin in renderer |
| File watching | @parcel/watcher | 2.5.x | FSEvents, darwin-arm64 prebuilds; ignore `.git/**` |
| Local DB | better-sqlite3 | 12.x | opened by core host ONLY |
| MCP | @modelcontextprotocol/sdk | match loredex's dependency version | server created by `createLoredexMcpServer` |
| Git binary | system git → dugite-native fallback | latest dugite-native | resolved once at core-host startup |
| Unit tests | vitest | 3.x | matches loredex's setup |
| E2E | Playwright (Electron) | 1.x latest | `_electron` launcher |
| Crash reports | @sentry/electron | latest | opt-in only; paths/hostnames scrubbed |
| Versioning | release-please + conventional commits | — | tag merge triggers release workflow |

## Source Tree

```
loredex-desktop/
├── package.json                  # ESM ("type": "module"), exact-pinned deps
├── electron.vite.config.ts
├── electron-builder.yml          # arm64 dmg+zip, entitlements, LSMinimumSystemVersion 14.0
├── build/entitlements.mac.plist  # allow-jit ONLY
├── .github/workflows/
│   ├── ci.yml                    # lint, typecheck, vitest, unsigned build, smokes
│   └── release.yml               # sign → notarize → staple → publish
├── legal/                        # generated third-party notices (build step)
├── src/
│   ├── shared/
│   │   └── ipc-contract.ts       # THE seam — CoreApi map + CoreEvent union (see below)
│   ├── main/                     # logic-free: windows, OS chrome, brokering
│   │   ├── index.ts              # app lifecycle; forks core host; brokers MessagePorts
│   │   ├── windows.ts
│   │   ├── tray.ts               # tray + dock badge
│   │   ├── notifications.ts      # native Notification display (data comes from core events)
│   │   ├── deep-links.ts         # loredex://join handler
│   │   ├── dialogs.ts            # native open panel (vault picker, folder scan picker)
│   │   └── updater.ts            # electron-updater wiring + translocation guard
│   ├── core/                     # core host — forked via utilityProcess.fork
│   │   ├── index.ts              # entry: resolve config ONCE, wire everything
│   │   ├── engine.ts             # loredex lib facade; single import site for 'loredex'
│   │   ├── ipc.ts                # MessagePort server: CoreApi dispatch + event fan-out
│   │   ├── write-lock.ts         # async mutex; ALL lib write ops acquire it
│   │   ├── poller.ts             # remote-event loop (fetch/parse/pull-when-safe)
│   │   ├── watcher.ts            # @parcel/watcher subscription + snapshots
│   │   ├── links.ts              # wikilink shortest-path resolution (read-only, app-side OK)
│   │   ├── drift.ts              # read-only git drift queries
│   │   ├── mcp-server.ts         # Streamable HTTP host (ported from loredex-obsidian)
│   │   ├── discovery.ts          # ~/.loredex/desktop.json writer (chmod 600)
│   │   ├── git.ts                # git binary resolution; identity -c injection helpers
│   │   └── db/
│   │       ├── index.ts          # better-sqlite3 open (SOLE opener), migrations
│   │       └── read-state.ts     # read/unread, notification log, snoozes, prefs
│   ├── preload/
│   │   └── index.ts              # contextBridge: exposes window.loredex ONLY
│   └── renderer/
│       ├── index.html
│       └── src/
│           ├── main.tsx
│           ├── api.ts            # typed invoke/onEvent wrappers over window.loredex
│           ├── markdown/         # unified pipeline + wikilink plugin
│           ├── stores/           # zustand stores
│           ├── components/       # IdentityBadge, StatusChip, ReceiptCard, ...
│           └── views/
│               ├── reader/       # tree, note view, diagnostics
│               ├── search/       # search view + Cmd+K palette
│               ├── home/         # Start Here, freshness, changed-since
│               ├── handoffs/     # inbox/outbox board, consume
│               ├── routes/       # receipts, undo, scope control
│               ├── sync/         # sync health panel
│               ├── wizard/       # create-or-join
│               ├── registry/     # company overview
│               ├── feed/         # activity feed
│               └── settings/     # identity, updater channel, MCP port, snoozes
├── tests/
│   ├── fixtures/vault/           # fixture vault for unit/contract tests
│   ├── mcp-contract/             # F6 regression net (parity via --via-desktop)
│   ├── native-smoke/             # watcher + better-sqlite3 vs packaged ABI
│   └── e2e/                      # Playwright: Nimbus F-reproductions, wizard, update smoke
└── README.md
```

Unit tests are colocated as `*.test.ts` next to sources; the `tests/` tree holds cross-cutting suites. The sibling `loredex` repo hosts all lib-PR work (stories marked "loredex repo"); it keeps its own test conventions.

## Process Model

| Process | Owns | Never |
|---|---|---|
| **Main** | Windows/menus/tray + dock badge, native `Notification` display, deep links (`loredex://join`), native open panels, auto-update, forking the core host and brokering `MessagePortMain` pairs | Business logic, vault I/O, git |
| **Core host** (`utilityProcess.fork`) | The single `import 'loredex'` site; config resolution exactly once at startup; all git shell-outs; write lock; poller; watcher; MCP server; discovery file; `app.db` (sole SQLite opener) | UI; anything that must not block a window (blocking is fine here — crash = respawn, windows unaffected) |
| **Renderer** (sandbox + contextIsolation) | All views; talks only through `window.loredex` (typed invoke/onEvent) | `fs`, `child_process`, SQLite, Node APIs of any kind |

Main must re-fork the core host on crash and re-broker ports; renderer wrappers must survive a port swap (buffer + retry once).

## IPC Contract

`src/shared/ipc-contract.ts` is the entire seam (~100–200 lines). All payload types come `import type { ... } from 'loredex'` where they exist; types marked *(lib PR-n)* ship with that loredex PR and are stubbed locally (`shared/types.ts`) until the pin bump; `WizardInput`, `WizardResult`, `LinkResolution`, `Facets` are app-local view types. No electron-trpc, no ipcRenderer.send sprawl — one generic `invoke` + one event channel.

```ts
import type { Config, Doc, SearchHit, ProductDashboard } from 'loredex'

interface CoreApi {                       // renderer → core (request/response)
  'config.get':        { in: void;                          out: Config }
  'vault.readNote':    { in: { path: string };              out: Doc }
  'vault.search':      { in: { q: string; facets?: Facets };out: SearchHit[] }
  'vault.resolveLink': { in: { link: string; from: string };out: LinkResolution }
  'handoffs.list':     { in: { scope: 'inbox'|'outbox'|'all' }; out: HandoffCard[] }   // (lib PR-1)
  'handoffs.consume':  { in: { id: string; identity: Identity }; out: ConsumeReceipt } // (lib PR-2)
  'route.preview':     { in: { file: string };              out: RoutePreview }        // (lib PR-3)
  'route.undo':        { in: { receiptId: string };         out: void }                // (lib PR-3)
  'sync.status':       { in: void;                          out: SyncHealth }          // (lib PR-4)
  'sync.run':          { in: void;                          out: SyncReport }          // (lib PR-5)
  'dashboard.build':   { in: void;                          out: ProductDashboard }
  'vault.createOrJoin':{ in: WizardInput;                   out: WizardResult }
  'activity.feed':     { in: { since?: string };            out: ActivityEvent[] }     // (lib PR-6)
}

type CoreEvent =                          // core → renderer (push, one channel)
  | { kind: 'handoff.new';          handoff: HandoffCard }
  | { kind: 'handoff.stateChanged'; id: string; from: string; to: string; by: Identity }
  | { kind: 'route.completed';      receipt: RoutePreview }
  | { kind: 'vault.changed';        paths: string[] }
  | { kind: 'sync.changed';         health: SyncHealth }
  | { kind: 'git.warning';          text: string }          // F8: surface stderr, never swallow

// generic wrappers, both sides:
invoke<K extends keyof CoreApi>(ch: K, arg: CoreApi[K]['in']): Promise<CoreApi[K]['out']>
onEvent(cb: (e: CoreEvent) => void): Unsubscribe
```

Error handling: every `invoke` rejection crosses the seam as a typed envelope `{ code: string; message: string; detail?: unknown }`; `code` values include `NOT_IMPLEMENTED`, `VAULT_OUTSIDE_PATH`, `LOCK_BUSY`, `GIT_FAILED`, `PORT_CONFLICT`. Never throw raw errors across the port.

## loredex Library Surface

Published exports available today (verified against `loredex/src/lib.ts`): `loadConfig`, `saveConfig`, `defaultVaultPath`, `parseDoc`, `serializeDoc`, `rebuildIndexes`, `buildDashboard`, `collectProductHandoffs`, `listProjects`, `projectState`, `renderDashboardMarkdown`, `ensureGeneratedMergeDriver`, `gitAutoCommit`, `gitPullPush`, `searchVault`, `sanitizeForContext`, `storeNote`, `inboxPath`, `scaffoldVault`, `slugify`, `createLoredexMcpServer`, `resolveNoteInsideVault`, `PRODUCT_BRIEF_NAME`, and types `Config`, `Doc`, `Meta`, `ProductDashboard`, `ProductHandoff`, `ProjectState`, `SearchHit`, `StoreInput`.

Planned lib PRs (each is its own story in the epic that consumes it; the desktop app never uses an export before its pin-bump story lands):

| PR | Adds | Consumed by |
|---|---|---|
| PR-1 | `listHandoffs(scope)` + `HandoffCard` | `handoffs.list` |
| PR-2 | `consumeHandoff(id, identity)` + `ConsumeReceipt` + `Identity`; `loredex_schema:` stamping + `.loredex/engine.json` | `handoffs.consume` |
| PR-3 | route plan/apply split + `RoutePreview` + persisted receipts + undo | `route.preview` / `route.undo` |
| PR-4 | `syncStatus()` + `SyncHealth` | `sync.status` |
| PR-5 | async git variants + `SyncReport` | `sync.run`, poller |
| PR-6 | `parseActivity(gitLog)` + `ActivityEvent` | `activity.feed` |
| PR-7 | registry-in-vault (lib resolution + CLI migration) | wizard, registry overview |
| PR-8 | injectable typed event emitter | core-host event fan-out |
| PR-9 | `loredex mcp --via-desktop` stdio proxy | agent/CLI MCP access |
| PR-10 | `loredex doctor` discovery + engine/schema handshake checks | split-brain defense |

## State Placement

| State | Lives in | Rule |
|---|---|---|
| Handoff lifecycle fields, consume who/when, `loredex_schema:` | **Vault frontmatter** (written via lib exports only) | Team-visible truth stays CLI/agent/git-first-class |
| Read/unread, notification log, snoozes, UI prefs, identity profile | **`app.db`** (better-sqlite3, userData dir, core host only) | Never synced; deleting it loses read-state only |
| Search index, link graph, feed, drift computations | **Recomputed cache** | Rebuilt from filesystem + git truth; never authoritative |

**Hard rule:** nothing the team needs to see may live only in `app.db`; nothing per-user may live in the vault.

Schema/engine versioning: every engine vault write stamps `loredex_schema: <n>` (lib PR-2); vault root carries `.loredex/engine.json` `{minEngine, schema}`; the discovery file carries `engineVersion`/`schemaVersion`. App and `loredex doctor` warn loudly (sync health + doctor output) on material mismatch.

## MCP Hosting & Discovery

- Port `loredex-obsidian`'s `LoredexHttpServer` pattern into `src/core/mcp-server.ts`: `createLoredexMcpServer` + `StreamableHTTPServerTransport`, bind `127.0.0.1` **only**, validate `Origin` (MCP spec MUST), require per-install bearer token.
- Preferred fixed port **52017**. If taken: do NOT `listen(0)` silently — emit `git.warning`-class loud error into sync health, offer a settings override; whatever port actually binds is what the discovery file records.
- `src/core/discovery.ts` writes `~/.loredex/desktop.json` `{port, token, engineVersion, schemaVersion}`, chmod 600, removed on clean shutdown.
- CLI access path: `loredex mcp --via-desktop` (lib PR-9) reads the discovery file at spawn and proxies stdio↔HTTP. Plain `loredex mcp` (stdio, CLI-owned engine) remains for app-less use — same `createLoredexMcpServer` factory, two hosts, zero duplicated tool logic.
- MCP tool responses must echo vault identity (path + remote) — same data as the chrome badge.

## Remote-Event Poller & Write Lock

`src/core/poller.ts` + `src/core/write-lock.ts`:

1. `git fetch` (never pull) every **60 s focused / 5 min background** — fetch never touches the working tree, so it is always safe.
2. Parse notification events from `git log ..origin/<branch>` on the fetched ref **without merging** → emit `handoff.new` / `handoff.stateChanged`. The sender-notification path never waits on a merge.
3. Integration (`git pull`) is gated: every lib write operation acquires the write lock; the poller pulls only when the lock is free AND the working tree is clean. Dirty tree → defer to next tick; sync health shows "behind N, integrating…".
4. After every integrate: reconcile from filesystem + git truth and run `rebuildIndexes` — never trust cached per-file watcher events after a pull storm (F4 rule).

## Git Strategy

- Keep loredex's `execFile('git', …)` approach untouched. Resolve the binary once at core-host startup: system git, else bundled `dugite-native` (individually signed at packaging).
- Identity: inject per command via `git -c user.name=… -c user.email=…` from the app identity profile — **never** ambient global config (F7).
- Surface every git stderr warning as a `git.warning` event; swallowing is a bug.

## Coding Standards

1. **ESM + strict TS everywhere.** No `require`, no `any` at the IPC seam or lib facade.
2. **All IPC payload types come from `src/shared/ipc-contract.ts`.** Never redefine or inline-duplicate a payload type.
3. **Anti-second-engine:** vault-writing code paths call `loredex` exports via `src/core/engine.ts` only. `engine.ts` is the sole `import 'loredex'` site.
4. **Main process is logic-free.** If a change adds a decision to `src/main/`, it belongs in the core host.
5. **Renderer has no Node.** Only `window.loredex` (invoke/onEvent). New capabilities = new contract channel, not a new bridge global.
6. **Core host is the sole `app.db` opener.** Renderer read-state access is IPC.
7. **Every lib write op acquires the write lock** (`write-lock.ts`); read-only queries do not.
8. **Never swallow git stderr** — always emit `git.warning`.
9. **Reconcile, don't cache:** after any `git pull`, rebuild views from filesystem + git truth.
10. **Errors cross the seam as typed envelopes** (see IPC Contract); no raw throws over ports.
11. **Markdown renders only through the sanctioned unified pipeline** with `rehype-sanitize`; no `dangerouslySetInnerHTML` with unsanitized content.
12. **Conventional commits** (release-please parses them).
13. Colocate unit tests as `*.test.ts`; every story adds tests for what it adds.

## Testing Strategy

| Layer | Tooling | Covers | Gate |
|---|---|---|---|
| Unit | vitest | IPC wrappers, link resolution, poller lock gating, read-state store, wizard parsing, event grammar; lib PRs carry their tests in the loredex repo | every PR |
| Native-module smoke | CI job, `macos-latest` arm64 | `@parcel/watcher` subscribe/emit and `better-sqlite3` open/write against the **packaged** Electron ABI | every PR + Electron bump |
| MCP contract | vitest + MCP SDK client | real core host + `loredex mcp --via-desktop` via discovery file; tool list/results parity with CLI stdio server on the fixture vault (F6 net) | every PR |
| Merge driver / git | fixture-repo tests (loredex repo) | gitattributes pattern (F8), generated-index merge, concurrent-writer pull-reconcile | every loredex PR |
| E2E | Playwright for Electron | Nimbus F-reproductions (F1/F4/F6/F7/F8/F9) must fail to reproduce; wizard join; update smoke | nightly + release |
| Release | CI asserts | notarization "Accepted" status text, `spctl -a`, `latest-mac.yml`/`beta-mac.yml` integrity | every release |

CI matrix: `macos-latest` (arm64) only; second dimension is Electron pinned vs next-major (allowed-failure lane).

## Distribution Constraints (dev-relevant)

- Signing: Developer ID, hardened runtime, entitlements `allow-jit` only, sign inside-out (never `--deep`); dugite binaries pre-signed individually.
- Notarize: `notarytool submit --wait`, assert on "Accepted" **status text**, ≥ 20 min timeout, staple.
- Artifacts: DMG (primary) + ZIP via `ditto -c -k --keepParent` (plain `zip` breaks signatures).
- Updater: electron-updater vs GitHub Releases; `latest-mac.yml` stable / `beta-mac.yml` beta; detect `/AppTranslocation/` at launch → prompt move to /Applications.
- `LSMinimumSystemVersion` = 14.0; public repo from day one (update feed requires it).
