# Embedding the loredex Node/TypeScript Core in a macOS Desktop App

Research date: 2026-07-09. Lens: how to reuse the existing `loredex` npm package (v2.0.0, ESM-only, `engines: node >=20`) as the engine of a native-feeling macOS (arm64-first) desktop app with the least custom code.

## 1. What the core actually needs (ground truth from the repo)

Verified against `/Users/tawfeeq/Business/GenuDo/Technical/md-files-reader/loredex/src`:

- **Full Node runtime.** `node:fs`, `node:path`, `node:crypto`, `node:http`; deps `@modelcontextprotocol/sdk ^1.29`, `gray-matter`, `commander`, `zod`. Built as ESM (`"type": "module"`, tsup target `node20`).
- **Shells out to binaries on PATH.** `core/router.ts` and `core/drift.ts` run `git` via `execFileSync` (add/commit/pull/push/rev-parse, merge-driver config); `llm/claude-cli.ts` and `llm/codex-cli.ts` spawn `claude` / `codex` for curation and handoff briefs. No shell interpolation anywhere (`execFileSync`/`spawn` with arg arrays).
- **MCP server factory, transport-agnostic.** `createLoredexMcpServer(config)` is exported from `lib.ts`; the CLI wires it to stdio, and the Obsidian plugin (`loredex-obsidian/src/server.ts`) already wires the *same factory* to `StreamableHTTPServerTransport` on a `node:http` server bound to `127.0.0.1`, with bearer-token auth and a stateless one-transport-per-request pattern.

That last point is the decisive fact: **the core has already been embedded once, inside Obsidian's Electron process, with ~70 lines of glue.** The desktop app should be the second consumer of the exact same seam, which also resolves the simulation's F6 split-brain finding (one process, one config resolution, one vault) by construction (see `DESKTOP-APP-FEATURES.md`, open question 5).

## 2. Shell choice: Electron vs Tauri v2 for a Node core

### Electron

Electron's [main process runs a full Node.js environment](https://www.electronjs.org/docs/latest/tutorial/process-model), so `import { gitPullPush, createLoredexMcpServer } from 'loredex'` works with zero packaging tricks. Two placement options:

- **Main process.** Simplest; fine for quick calls, but a long `curate` (40–60s LLM spawn per the simulation report) or a git pull over a slow network executed synchronously (`execFileSync`!) would block the event loop that also services window management.
- **[`utilityProcess`](https://www.electronjs.org/docs/latest/api/utility-process).** Electron's Chromium-services-based equivalent of `child_process.fork`: a full Node environment in a child process, with the unique ability to hand a `MessagePortMain` directly to a renderer. Electron explicitly positions it for "untrusted services, CPU intensive tasks or crash prone components," and recommends preferring it over `child_process.fork`. `stdio` can be piped (stdout/stderr only; stdin is not configurable — irrelevant here since the app would host MCP over HTTP, not stdio).

ESM caveat: since [Electron 28](https://www.electronjs.org/blog/electron-28-0), ESM is supported in the main process and in [`utilityProcess` entry points](https://www.electronjs.org/docs/latest/tutorial/esm); loredex being ESM-only is therefore a non-issue, but main-process entry modules load asynchronously, so anything that must run before `app.ready` needs top-level await. Version alignment is comfortable: current Electron stable is in the 40s ([43.x as of mid-2026](https://releases.electronjs.org/)); e.g. [Electron 39 ships Node 22.20](https://github.com/electron/electron/releases) — well above loredex's `node >= 20` floor. Because loredex has **no native modules**, there is no `electron-rebuild` obligation for the core itself.

### Tauri v2

Tauri has no JS runtime of its own; a Node core must ship as a **sidecar binary**. The [official Tauri v2 Node.js sidecar guide](https://v2.tauri.app/learn/sidecar-nodejs/) compiles the Node app with `pkg` into a self-contained executable, renames it to the `name-<target-triple>` convention under `src-tauri/binaries/`, declares it in `tauri.conf.json` `externalBin`, and grants `shell:allow-execute` with `sidecar: true` in the capabilities file. The guide itself frames sidecars as short-lived stdin/stdout commands and says long-running services need "alternative inter-process communication systems such as a localhost server, stdin/stdout or local sockets."

Problems for this project, in order of severity:

1. **`pkg` is deprecated** ([vercel/pkg is archived; 5.8.1 was the last release](https://github.com/vercel/pkg)), and it never supported ESM well. The 2025-26 replacements are [Node's official Single Executable Applications](https://getlarge.eu/blog/building-single-executable-applications-with-nodejs/) (still requiring a CJS bundle step today) or [Bun's `--compile`](https://codeforreal.com/blogs/using-bun-or-deno-as-a-web-server-in-tauri/) — the latter swaps the runtime entirely, which is untested territory for `@modelcontextprotocol/sdk` + `execFileSync` behavior parity.
2. **Two IPC hops.** UI (webview) → Rust command → sidecar process → back. Every one of the ~23 lib functions needs a Rust-side passthrough or a localhost RPC server anyway — at which point you've rebuilt the Electron utilityProcess pattern with more moving parts and a Rust build in the loop.
3. Sidecar binaries are ~80–110 MB each (a full Node/Bun runtime), eroding Tauri's headline size advantage; you ship a Chromium-less app that still contains a JS runtime.

Tauri is the right call for a new Rust-core app; it is the wrong call for wrapping an existing, published Node library. **Verdict: Electron, core in a `utilityProcess`.**

## 3. IPC between UI and core

Baseline: [contextBridge](https://www.electronjs.org/docs/latest/api/context-bridge) + `ipcRenderer.invoke`/`ipcMain.handle` with contextIsolation and sandbox on (Electron defaults since v20). For the utilityProcess topology, the main process forks the core host and can pass a `MessagePortMain` pair so renderer and core talk directly, with main only brokering setup ([utilityProcess docs](https://www.electronjs.org/docs/latest/api/utility-process)).

Typed options:

- **[electron-trpc](https://github.com/jsonnull/electron-trpc)** (v0.7.1, Dec 2024): tRPC router in main, `exposeElectronTRPC()` in preload, `ipcLink()` in the renderer; full queries/mutations/**subscriptions** support — subscriptions map neatly onto loredex's watcher/activity-feed streams. Explicitly marketed as "a secure alternative to opening servers on localhost." Caveats: maintenance cadence is slow (one person, last release >18 months ago), it assumes the router lives in the *main* process (a utilityProcess router needs a forwarding hop), and there is credible criticism that tRPC's serialization layering is [measurable overhead for chatty desktop IPC](https://seedteamtalks.hyper.media/tech-talks/the-case-against-electron-trpc-when-type-safety-becomes-a-performance-tax).
- **Hand-rolled typed channel map**: one `interface CoreApi` mirroring the ~23 `lib.ts` exports, a generic `invoke<K extends keyof CoreApi>` wrapper on both sides. For an API surface this small and already typed (the lib ships `.d.ts`), this is ~100 lines and zero dependencies; community best-practice writeups now warn that *building a framework* here is the trap, not writing the thin map.

**Recommendation:** thin typed wrapper over `MessagePort`/`invoke`, deriving its types from `import type { ... } from 'loredex'` so the lib's published types remain the single source of truth. Add an event channel (core → UI) for watcher events, sync status, and MCP request logs. Reach for electron-trpc only if the UI grows genuinely RPC-heavy with streaming.

## 4. Running git from the app

What the incumbent Git GUIs do:

- **GitHub Desktop: shells out to a bundled git.** [dugite](https://github.com/desktop/dugite) execs the real git CLI and is "under active development for Git-related projects at GitHub" — v3.2.2 shipped April 2026. Its sibling `dugite-native` publishes portable git binaries (incl. darwin-arm64). The maintainers' stated reasons for CLI-over-libgit2 are exactly loredex's concerns: full command/flag coverage, no behavior drift from core git, and out-of-process memory ([dugite #98](https://github.com/desktop/dugite/issues/98)).
- **GitKraken: libgit2 via NodeGit** ([their engineering post](https://www.gitkraken.com/blog/nodegit-libgit2)) — but they maintain their own fork at real cost; upstream [nodegit's last stable release was 0.27.0 in July 2020](https://github.com/nodegit/nodegit/releases), with only alphas since. As a native module it would also drag `electron-rebuild` into every Electron upgrade. Not a serious option in 2026.
- **isomorphic-git**: pure JS, no binary to bundle — but it reimplements git, its own [FAQ](https://isomorphic-git.org/docs/en/faq) documents workarounds for gaps like deepening shallow clones, and it lacks the merge-driver machinery loredex already depends on (`ensureGeneratedMergeDriver` configures `merge.loredex-generated.driver` — a real-git feature). Adopting it means rewriting `core/router.ts` semantics. Rejected.

**Recommendation:** keep loredex's `execFileSync('git', …)` code untouched. In the app, resolve the git binary once at startup: prefer system git (macOS provides it via Xcode Command Line Tools, but a fresh Mac *without* CLT has none — the naive `git` invocation triggers the CLT install dialog), and fall back to a bundled dugite-native git. Practically: depend on `dugite`, set `GIT_EXEC_PATH`/`PATH` for the core host process, and surface "which git, which identity" in the Sync Health panel — the simulation's F7 ("auth is ambient") finding argues for making this visible, and for using per-repo `git -c user.name=... -c user.email=...` from the app's managed identity profile rather than ambient global config. One code change worth making in the lib: offer async variants (or run the whole core in the utilityProcess so `execFileSync`'s blocking is confined there).

## 5. File watching for live vault updates (macOS/FSEvents)

Two credible libraries, both FSEvents-backed on macOS:

- **[@parcel/watcher](https://github.com/parcel-bundler/watcher)** — native C++ module with prebuilds (`@parcel/watcher-darwin-arm64`), recursive subscriptions, and *snapshot/“events since”* querying (`writeSnapshot`/`getEventsSince`), which is a perfect fit for "what changed in the vault while the app was closed." It is what [VS Code uses for all recursive workspace watching](https://github.com/microsoft/vscode/wiki/File-Watcher-Internals) — the strongest possible production endorsement for Electron specifically. Being a native module, it must match the Electron ABI when loaded in main/utilityProcess (prebuilds + `electron-rebuild`/Forge handle this routinely).
- **[chokidar](https://github.com/paulmillr/chokidar)** — v4 (Sep 2024) dropped globs and the bundled fsevents dependency; v5 (Nov 2025) is ESM-only, Node ≥ 20. Pure-JS on macOS since v4 means it no longer rides FSEvents by default — fine for small trees, weaker for a large team vault.

**Recommendation:** `@parcel/watcher` in the core-host utilityProcess, watching the vault root; debounce and re-emit as typed events to the UI (feeds the route-receipt, drift-badge, and activity-feed features). Ignore `.git/**` and expect event storms during `git pull` — reconcile by re-reading indexes rather than trusting per-file events. The snapshot API doubles as the "what changed since last brief" primitive the PM persona asked for (F5).

## 6. Hosting the localhost MCP/HTTP server inside the app

The Obsidian plugin already proves the pattern: `node:http` server on `127.0.0.1:<port>`, bearer token checked per request, stateless `StreamableHTTPServerTransport` per request. Port it verbatim into the core host. Hardening, per the [MCP transport spec (2025-06-18)](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports):

- **Bind loopback only** and **validate the `Origin` header** on every request — both are spec MUST/SHOULDs against DNS-rebinding, and real CVEs shipped in 2025 for SDKs that skipped rebinding protection by default ([CVE-2025-66416 in the Python SDK](https://advisories.gitlab.com/pypi/mcp/CVE-2025-66416/)). The TS SDK's `StreamableHTTPServerTransport` accepts `allowedOrigins`/`enableDnsRebindingProtection` options; local agent clients (Claude Code et al.) send no browser `Origin`, so the rule is "reject requests *with* a non-allowlisted Origin."
- **Auth:** keep the plugin's bearer-token model. Generate a random token per vault/app install, write `{ port, token }` to a discovery file (e.g. `~/.loredex/desktop.json`, chmod 600) so the CLI and `.mcp.json` templates can find the live server — this is how the app becomes the *single* MCP endpoint and kills the F6 npx/vault split-brain.
- **Port conflicts:** listen on a preferred fixed port, fall back to `listen(0)` (OS-assigned) on `EADDRINUSE`, and always publish the actual port via the discovery file. Never hard-code the port into generated repo files; template them to read the discovery file or use a stable `--port` the app re-acquires on launch.
- **macOS prompts:** loopback-only listeners are outside Local Network privacy's scope — the local-network permission (macOS 15 Sequoia's per-app prompt) targets LAN traffic, and loopback traffic is explicitly exempt from local-network-access checks in both [Apple's TN3179 territory](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy) and the [W3C/WICG Local Network Access spec](https://github.com/WICG/local-network-access/blob/main/explainer.md); Sequoia's rollout was nonetheless buggy enough that some loopback apps got prompted anyway ([mjtsai roundup, Oct 2024](https://mjtsai.com/blog/2024/10/02/local-network-privacy-on-sequoia/)). The separate *application firewall* "accept incoming connections?" dialog is triggered by listening sockets in unsigned/ad-hoc-signed builds — Electron apps that aren't properly signed get it on every launch ([FoundryVTT #8959](https://github.com/foundryvtt/foundryvtt/issues/8959)). Mitigation: bind `127.0.0.1` (never `0.0.0.0`) and ship Developer-ID-signed + notarized builds; dev builds should be self-signed to avoid the nag.
- Keep **stdio MCP** delegated to the CLI (`npx loredex mcp` / `loredex` bin) for editors that prefer subprocess servers; the app owns the HTTP endpoint. Same factory, two hosts — no duplicated tool logic.

## 7. Recommended architecture (least custom code)

**Electron (Forge, arm64 dmg/zip), three processes:**

1. **Main process** — windows, menus, native notifications (`new Notification()` covers the F1 must-haves), tray, deep links (`loredex://join?...` for the join-vault flow), auto-update. No business logic.
2. **Core host (`utilityProcess.fork('core-host.mjs')`)** — imports `loredex` directly (no vendoring, no compile-to-binary): config load, routing, search, handoffs, `gitPullPush`, `buildDashboard`, the `@parcel/watcher` vault watcher, and the Streamable HTTP MCP server reusing the Obsidian plugin's `LoredexHttpServer` shape. All `execFileSync` git and `spawn claude/codex` calls live here, so blocking never touches the UI. Crash = respawn, windows unaffected.
3. **Renderer** (sandboxed, contextIsolation) — talks to the core host over a `MessagePortMain` handed through the preload; thin typed wrapper generated from `loredex`'s own `.d.ts` types.

Custom code this actually requires: the typed IPC map (~100–200 lines), the core-host bootstrap (~100 lines, mostly copied from `loredex-obsidian/src/server.ts`), git/claude binary resolution (~50 lines), and the discovery-file writer. Everything else is UI. The lib may want two small additions: async variants of the git calls (or acceptance that they block only the core host) and an injectable "events" emitter so route/consume/sync actions can notify the UI without polling — both are additive, non-breaking `lib.ts` changes.

## 8. Risks

- **Single-maintainer IPC deps:** if electron-trpc is adopted and stalls further, migration back to raw IPC is invasive; the hand-rolled map avoids the dependency entirely.
- **Native-module ABI churn:** `@parcel/watcher` prebuilds must track Electron major upgrades; pin Electron majors and test the watcher in CI on darwin-arm64.
- **Blocking core calls:** `execFileSync` inside the core host still serializes core-host work (a slow `git pull` delays concurrent MCP requests); medium-term fix is async exec in `core/router.ts`.
- **Two writers, one vault:** app watcher + CLI/agents writing concurrently re-creates the simulation's route/watcher race (F4); the app must treat the filesystem+git as the source of truth and reconcile, not cache.
- **Port/token discovery drift:** repos templated with a stale port/token will fail opaquely; the discovery file plus a `loredex doctor` check on it should ship together.
- **Signing is not optional:** an unsigned dev build with a listener will firewall-prompt every launch and poison first impressions.

## Sources

- [Electron process model](https://www.electronjs.org/docs/latest/tutorial/process-model)
- [Electron utilityProcess API](https://www.electronjs.org/docs/latest/api/utility-process)
- [Electron 28: ESM support](https://www.electronjs.org/blog/electron-28-0) and [ESM tutorial](https://www.electronjs.org/docs/latest/tutorial/esm)
- [Electron releases (current versions / bundled Node)](https://releases.electronjs.org/)
- [Tauri v2: Node.js as a sidecar](https://v2.tauri.app/learn/sidecar-nodejs/) and [Embedding external binaries](https://v2.tauri.app/develop/sidecar/)
- [vercel/pkg (deprecated)](https://github.com/vercel/pkg); [Node.js Single Executable Applications guide](https://getlarge.eu/blog/building-single-executable-applications-with-nodejs/)
- [electron-trpc](https://github.com/jsonnull/electron-trpc); [The case against electron-trpc](https://seedteamtalks.hyper.media/tech-talks/the-case-against-electron-trpc-when-type-safety-becomes-a-performance-tax)
- [Electron contextBridge](https://www.electronjs.org/docs/latest/api/context-bridge)
- [dugite (GitHub Desktop's git bindings)](https://github.com/desktop/dugite); [dugite vs nodegit discussion](https://github.com/desktop/dugite/issues/98)
- [GitKraken: NodeGit and libgit2](https://www.gitkraken.com/blog/nodegit-libgit2); [nodegit releases](https://github.com/nodegit/nodegit/releases)
- [isomorphic-git FAQ](https://isomorphic-git.org/docs/en/faq)
- [@parcel/watcher](https://github.com/parcel-bundler/watcher); [VS Code File Watcher Internals](https://github.com/microsoft/vscode/wiki/File-Watcher-Internals)
- [chokidar](https://github.com/paulmillr/chokidar)
- [MCP spec — Transports (2025-06-18)](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports)
- [CVE-2025-66416: MCP Python SDK DNS-rebinding default](https://advisories.gitlab.com/pypi/mcp/CVE-2025-66416/)
- [Apple TN3179: Understanding local network privacy](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy); [WICG Local Network Access explainer (loopback exemption)](https://github.com/WICG/local-network-access/blob/main/explainer.md); [Local Network Privacy on Sequoia (mjtsai)](https://mjtsai.com/blog/2024/10/02/local-network-privacy-on-sequoia/)
- [FoundryVTT: Electron firewall prompt every launch](https://github.com/foundryvtt/foundryvtt/issues/8959)
