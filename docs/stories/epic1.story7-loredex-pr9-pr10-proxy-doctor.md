# Story 1.7: loredex PR-9 + PR-10 — stdio proxy & doctor checks (loredex repo)

## Status

Approved

## Story

**As a** CLI/agent user,
**I want** `loredex mcp --via-desktop` and doctor handshake checks,
**so that** static `.mcp.json` configs reach the app's MCP server and version skew is caught loudly.

## Acceptance Criteria

1. `loredex mcp --via-desktop` is a stdio↔HTTP proxy that reads `~/.loredex/desktop.json` at spawn and forwards MCP traffic with the bearer token.
2. When the app isn't running or the token is stale, the proxy exits loudly with a `loredex doctor` hint.
3. `loredex doctor` validates the discovery file and compares engine/schema versions (CLI vs app vs vault), warning on material mismatch.
4. The desktop repo gains the MCP contract test: spawn the real core host, connect via `--via-desktop`, and assert tool list/results parity with the CLI's stdio server against a fixture vault (the F6 regression net), gated on every PR.

## Tasks / Subtasks

- [ ] PR-9: stdio proxy (AC: 1, 2)
  - [ ] In the loredex repo, add `--via-desktop` to the `mcp` command: read `~/.loredex/desktop.json` at spawn; forward stdio MCP traffic to `http://127.0.0.1:<port>` with `Authorization: Bearer <token>` (Streamable HTTP client transport from the MCP SDK)
  - [ ] Missing/unparsable discovery file, connection refused, or 401/403 → exit non-zero with a clear message including "run `loredex doctor`"
  - [ ] Plain `loredex mcp` (stdio, CLI-owned engine) is untouched
- [ ] PR-10: doctor checks (AC: 3)
  - [ ] `loredex doctor` gains: discovery-file presence/shape/permissions check; live probe of the app endpoint; engine/schema comparison between the CLI's own version, the discovery file's `engineVersion`/`schemaVersion`, and the vault's `.loredex/engine.json` when present — material mismatch prints a loud warning
- [ ] Release + pin bump (AC: 1–3)
  - [ ] loredex tests for proxy error paths + doctor checks; publish release; bump the desktop repo's exact pin
- [ ] Desktop MCP contract test (AC: 4)
  - [ ] `tests/mcp-contract/`: spawn the real core host against `tests/fixtures/vault/`; connect one MCP SDK client through a spawned `loredex mcp --via-desktop` process and one directly to the CLI's stdio server; assert identical tool lists and identical `vault_search` results
  - [ ] Wire into `ci.yml` on every PR

## Dev Notes

- **Repo split:** proxy + doctor code lands in the sibling `loredex` repo; the contract test lands in `loredex-desktop/tests/mcp-contract/`. [Source: architecture.md#testing-strategy]
- Why a proxy: a static `.mcp.json` cannot read a discovery file, so templated repo configs invoke `loredex mcp --via-desktop`, which resolves `{port, token}` at spawn time — this is the decided discovery mechanism. [Source: architecture.md#mcp-hosting--discovery]
- The discovery file shape is exactly `{port, token, engineVersion, schemaVersion}` at `~/.loredex/desktop.json`, chmod 600, written by Story 1.6's `src/core/discovery.ts`. Custom ports keep working because the proxy reads whatever port the file records. [Source: architecture.md#mcp-hosting--discovery]
- The handshake matters because the app pins loredex exact while CLIs float via `npx -y loredex@latest` — version-skew split-brain is risk 2; doctor is the CLI-side tripwire, the app's sync health panel (Story 5.2) is the app side. [Source: architecture.md#state-placement]
- Parity test is the permanent F6 regression net: same tool list, same results, one vault. Fail loudly on any divergence. [Source: architecture.md#testing-strategy]

### Testing

- loredex repo: unit tests for proxy failure modes (no file, dead endpoint, stale token) and doctor verdicts (ok / warn / mismatch matrix).
- Desktop repo: the contract suite above; keep runtime under ~60 s so it can gate every PR. [Source: architecture.md#testing-strategy]

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
