# Story 26.7: DESIGN v3 P6 — GitHub auth (gh reuse · PAT · keychain · dex registry)

## Status

Done

## Story

**As a** loredex user,
**I want** to sign in with GitHub — reuse my gh session or paste a token — and see every repo tagged `loredex-dex` with one-click Join/Create,
**so that** GitHub is the account and dexes are just repos I own (no loredex server, ever).

Spec: handoff/AUTH-GITHUB.md (§0–§6) + docs/DESIGN.md v3 amendment §9. Login stays optional — SSH dexes need none of this.

## Acceptance Criteria

1. Core `auth.ts`: approach **A** (live `gh auth token`, never copied), approach **C** (PAT validated via `GET /user`, stored in the macOS Keychain — service `loredex`, account `github.com`, the one shared entry the CLI reads), approach **B** (device flow start/poll with the §5 state machine — `pending`/`slow_down`/`expired`/`denied` — gated on the public `GITHUB_CLIENT_ID`, empty until the OAuth app is registered). Token masked everywhere (`ghp_…7f2a`), never crosses IPC/MCP, never logged.
2. Typed channels: `auth.status` / `auth.loginWithToken` / `auth.logout` / `auth.deviceStart` / `auth.devicePoll` / `dex.registry` / `dex.createRepo` — status carries account/source/store/scopes/mask only.
3. Dex registry (AUTH §3/§4): `GET /user/repos` filtered to the `loredex-dex` topic (pagination, 403 → honest RATE_LIMITED); **Join** feeds the clone URL into the existing join wizard; **Create dex** = `POST /user/repos` (private) + `PUT …/topics` adding `loredex-dex`.
4. Settings › System › GitHub rebuilt: signed-in state (account · store · masked token · scopes · Sign out for stored tokens · Re-check), signed-out state (gh auto-detect, Paste-a-token flow, revoked-token banner per §5, SSH-needs-nothing copy, honest device-flow-pending note).
5. Gates green; auth pure functions unit-tested with a stubbed fetch (mask, topic filter, token validation, §5 poll states).

## Dev Notes

- Files: `core/auth.ts(.test)`, `core/handlers.ts`, `shared/types.ts` (`AuthStatus`/`DeviceCode`/`DexRepo`), `shared/ipc-contract.ts`, `views/settings/GitHubSection.tsx`, `styles.css`.
- The 12.2 gh-capability path (PR chips) is untouched — it keeps its own channel.

## Dev Agent Record

- **Device flow is code-complete but gated**: AUTH §1B needs a registered GitHub OAuth App's public client_id, which doesn't exist yet (user action — free, github.com/settings/developers → New OAuth App, enable device flow, paste the id into `GITHUB_CLIENT_ID`). UI shows an honest "unlocks once the OAuth app id ships" note instead of a dead button (D1a8).
- **Token store is macOS-only this story** (`security` CLI — zero new deps, CLI-shared): Windows Credential Manager + libsecret/encrypted-file fallback are follow-ups; on those OSes login degrades to gh reuse with an honest error on PAT store.
- **Git transport injection (GIT_ASKPASS shim) deferred**: HTTPS clone/push credentials still ride the system git config; wiring the stored token into the lib's git spawns needs a lib env hook (flagged for the lib backlog). SSH untouched by design.
- **CLI verbs (`loredex auth/dex …`)** live in the loredex lib repo — out of this app's scope, same storage contract documented here.
- Known-flaky git-timing suites pass isolated (pre-existing).

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-17 | 1.0 | gh reuse + PAT + keychain store + masked status + gated device flow + dex registry (list/join/create) | Claude (dev agent) |
