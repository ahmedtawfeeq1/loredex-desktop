# Story 1.6: In-app MCP server & discovery file

## Status

Approved

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

- [ ] Port the HTTP host (AC: 1, 2)
  - [ ] `src/core/mcp-server.ts`: `createLoredexMcpServer` (from the engine facade) + `StreamableHTTPServerTransport`, `http.createServer` listening on `127.0.0.1` explicitly
  - [ ] Validate `Origin` header (reject anything not absent/localhost) and `Authorization: Bearer <token>`; 403 otherwise
  - [ ] Generate the per-install token once (crypto random), stored in userData
- [ ] Port policy (AC: 3)
  - [ ] Try 52017 (or the settings override); on `EADDRINUSE` emit a `PORT_CONFLICT` sync-health error event — do NOT `listen(0)`
  - [ ] Settings override plumbed through `views/settings/` (a minimal settings pane is acceptable here)
- [ ] Discovery file (AC: 4)
  - [ ] `src/core/discovery.ts`: write `~/.loredex/desktop.json` `{port, token, engineVersion, schemaVersion}` with mode `0o600` after successful listen; delete on clean shutdown (core-host exit hook + main `before-quit` signal)
  - [ ] `engineVersion` = pinned loredex version (read from its package.json); `schemaVersion` = lib-declared schema (hardcode current value with a TODO tied to lib PR-2 until it exports one)
- [ ] Identity echo (AC: 5)
  - [ ] Wrap/configure tool responses so each carries the vault identity line (reuse `formatVaultIdentity` from Story 1.4)
- [ ] Prove one-engine (AC: 6)
  - [ ] Integration test: spawn the core host against the fixture vault, connect an MCP SDK client over HTTP with the token, call `vault_search`, assert hits match `invoke('vault.search')` results

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

### Debug Log References

### Completion Notes List

### File List

## QA Results
