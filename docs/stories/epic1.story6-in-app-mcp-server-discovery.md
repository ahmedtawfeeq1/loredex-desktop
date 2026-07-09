# Story 1.6: In-app MCP server & discovery file

## Status

Done

## Story

**As a** CLI/agent user,
**I want** the app to host the loredex MCP server with a discovery file,
**so that** MCP traffic and the UI provably share one engine and one vault.

## Acceptance Criteria

1. The core host hosts `createLoredexMcpServer` over Streamable HTTP bound to `127.0.0.1` only, ported from loredex-obsidian's `LoredexHttpServer`.
2. Requests are validated: `Origin` check plus per-install bearer token.
3. The app claims preferred port 52017; if taken it does **not** silently fall back — it emits a loud sync-health error with a settings override, and whatever port is bound is what the discovery file records.
4. `~/.loredex/desktop.json` is written chmod 600 with `{port, token, engineVersion, schemaVersion}` and removed on clean shutdown.
5. MCP tool responses echo the vault identity (FR14).
6. An MCP query from a local client returns results from the same vault the UI shows.

## Tasks / Subtasks

- [x] Port the HTTP host (AC: 1, 2)
  - [x] `src/core/mcp-server.ts`: `createLoredexMcpServer` (from the engine facade) + `StreamableHTTPServerTransport`, `http.createServer` listening on `127.0.0.1` explicitly
  - [x] Validate `Origin` header (reject anything not absent/localhost) and `Authorization: Bearer <token>`; 403 otherwise
  - [x] Generate the per-install token once (crypto random), stored in userData
- [x] Port policy (AC: 3)
  - [x] Try 52017 (or the settings override); on `EADDRINUSE` emit a `PORT_CONFLICT` sync-health error event — do NOT `listen(0)`
  - [x] Settings override plumbed through `views/settings/` (a minimal settings pane is acceptable here)
- [x] Discovery file (AC: 4)
  - [x] `src/core/discovery.ts`: write `~/.loredex/desktop.json` `{port, token, engineVersion, schemaVersion}` with mode `0o600` after successful listen; delete on clean shutdown (core-host exit hook + main `before-quit` signal)
  - [x] `engineVersion` = pinned loredex version (read from its package.json); `schemaVersion` = lib-declared schema (hardcode current value with a TODO tied to lib PR-2 until it exports one)
- [x] Identity echo (AC: 5)
  - [x] Wrap/configure tool responses so each carries the vault identity line (reuse `formatVaultIdentity` from Story 1.4)
- [x] Prove one-engine (AC: 6)
  - [x] Integration test: spawn the core host against the fixture vault, connect an MCP SDK client over HTTP with the token, call `vault_search`, assert hits match `invoke('vault.search')` results

## Dev Notes

- The reference implementation is `loredex-obsidian`'s `LoredexHttpServer` (~70 lines) — port it, don't reinvent. Same `createLoredexMcpServer` factory the CLI stdio server uses: two hosts, zero duplicated tool logic. [Source: architecture.md#mcp-hosting--discovery]
- Security posture is mandatory: loopback-only bind, `Origin` validation (MCP spec MUST; CVE-2025-66416 precedent), bearer token, discovery file chmod 600. [Source: architecture.md#mcp-hosting--discovery]
- Loud-failure port policy is a decided design point — silent `listen(0)` would strand the discovery file consumers. The `PORT_CONFLICT` envelope code exists in the contract for this. [Source: architecture.md#ipc-contract] [Source: architecture.md#mcp-hosting--discovery]
- The MCP server runs INSIDE the core host so it shares the once-resolved config — this is the F6 fix by construction; do not fork another process for it. [Source: architecture.md#process-model]
- Loopback bind is also the reason no Local Network permission prompt appears. [Source: architecture.md#distribution-constraints-dev-relevant]
- Consumers of the discovery file: `loredex mcp --via-desktop` (Story 1.7, lib PR-9) and `loredex doctor` (PR-10). Keep the JSON shape exactly `{port, token, engineVersion, schemaVersion}`.
- Files: `src/core/mcp-server.ts`, `src/core/discovery.ts`, `src/core/index.ts` (wire-up), `src/renderer/src/views/settings/` (port override), `src/shared/ipc-contract.ts` untouched (sync-health error rides the existing event channel). [Source: architecture.md#source-tree]

### Testing

- Integration test doubles as the seed of the MCP contract suite (Story 1.7 extends it with proxy parity). Also unit-test: origin rejection, bad token 403, chmod 600 asserted, discovery cleanup on shutdown. [Source: architecture.md#testing-strategy]

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-09 | 0.1 | Drafted from PRD Epic 1 | Bob (SM) |
| 2026-07-09 | 1.0 | Approved | Sarah (PO) |

## Dev Agent Record

### Agent Model Used

claude-fable-5 (BMAD dev agent)

### Debug Log References

- `npx vitest run src/core/mcp-server.test.ts` → 6 passed (origin matrix + 403, 401 token, chmod 600 + exact discovery shape, real-HTTP initialize/listTools/vault_search parity + identity echo, port-conflict loud-fail + discovery cleanup)
- `npm run build` → typecheck (node+web) + electron-vite build green

### Completion Notes List

- Ported loredex-obsidian's `LoredexHttpServer` (stateless: one MCP server + transport per POST) into module-scope functions in `src/core/mcp-server.ts`; added the two things the plugin lacked: `Origin` validation (absent/localhost-only; `403`) and the loud port policy.
- `createLoredexMcpServer` reaches the module only via the engine facade (`engine.createMcpServer()`), keeping `engine.ts` the sole `import 'loredex'` site.
- `schemaVersion`: the lib ALREADY exports `LOREDEX_SCHEMA` (PR-2 landed) — no hardcode/TODO needed; `engine.schemaVersion()` returns it.
- Identity echo (AC5): the MCP SDK has no response middleware, so each registered tool's dispatch-time `handler` is wrapped (`withIdentityEcho`) to append `vault: <formatVaultIdentity(...)>` as a trailing text content block. Uses the SDK's `_registeredTools` map (private-shaped but dispatch reads `tool.handler` live); guarded to degrade to no-echo if the SDK shape changes; covered by the real-HTTP test. Recorded deviation: private-API touch, revisit when the SDK grows middleware or the lib factory accepts a decorator.
- PORT_CONFLICT surfaces as `git.warning` event (contract-sanctioned loud channel) + `mcp.status` state `'port-conflict'` for story 5.2's panel; settings override persists via new `settings.mcpPort.set` and applies on next core-host start (no live rebind — the discovery file must never lie).
- App-local contract evolution: `mcp.status` + `settings.mcpPort.set` channels, `McpStatus` type in `shared/types.ts` (same pattern as `app.identity`).
- Deviation from task text "PORT_CONFLICT sync-health error event": no dedicated event kind exists in the contract; used `git.warning` (arch: "`git.warning`-class loud error into sync health") + queryable `mcp.status`.
- Token: 32-byte hex via `crypto.randomBytes`, persisted once in userData `settings.json` (story 3.6 moves that file to app.db; scope cut keeps JSON).
- Clean shutdown: `process.on('exit')` + SIGTERM/SIGINT handlers in the core host remove the discovery file (main kills the host on `before-quit`).
- Release-time TODO (repo-wide): loredex dep is `file:../loredex`; `@modelcontextprotocol/sdk` pinned exact 1.29.0 to match the lib.

### File List

- `package.json` (+ `@modelcontextprotocol/sdk` 1.29.0 exact)
- `src/core/mcp-server.ts` (new)
- `src/core/mcp-server.test.ts` (new)
- `src/core/discovery.ts` (new)
- `src/core/engine.ts` (facade: `createMcpServer`, `schemaVersion`)
- `src/core/settings.ts` (`loadOrCreateMcpToken`, `loadMcpPortOverride`, `saveMcpPortOverride`)
- `src/core/index.ts` (boot wiring + shutdown hooks)
- `src/core/handlers.ts` (`mcp.status`, `settings.mcpPort.set`)
- `src/shared/ipc-contract.ts`, `src/shared/types.ts` (`McpStatus`, channels)
- `src/renderer/src/views/settings/McpSection.tsx` (new), `SettingsView.tsx`, `styles.css` (`.settings-error`)

## QA Results

**Verdict: PASS** — Evidence base (QA pass 2026-07-10, fresh-eyes BMAD QA agent): app vitest 118/118 (23 files), lib vitest 115/115, `npm run typecheck` clean, `npm run build` clean, time-boxed `npm run dev` smoke (alive 3+ min, clean exit), and an M1-DoD driver that exercised the core-host modules directly against the real nimbus simulation vault (tree/readNote/resolveLink/search/handoffs/homeBrief/syncStatus/activity). Strongest runtime verification of the batch — exercised live against the running dev app:

- AC1: verified live — Streamable HTTP on `127.0.0.1:52017`; `tools/list` returned the lib tool set.
- AC2: verified live — no token → 401; valid token → 200; cross-origin `Origin: https://evil.example` → 403.
- AC3: unit-verified — port-conflict loud-error path covered in `mcp-server.test.ts`; settings override channel present.
- AC4: verified live — `~/.loredex/desktop.json` written `-rw-------` (600) with `{port, token, engineVersion: 2.0.0, schemaVersion: 1}`; removed on clean shutdown (checked after SIGTERM).
- AC5: verified live — `vault_search` response carried the trailing identity echo (`vault: …nimbus-vault · engine loredex 2.0.0 · source: vault-picker · remote: …`).
- AC6: verified live — MCP results came from the same nimbus vault the UI serves.
