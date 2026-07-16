# Story 26.9: v3 deferred trio — per-agent tokens, git askpass shim, Win/Linux token store

## Status

Done

## Story

**As a** loredex user,
**I want** each agent to carry its own MCP token (so sessions attribute per agent), HTTPS dex remotes to ride my stored GitHub token without prompts, and sign-in to work off macOS,
**so that** the v3 Agents/auth stories stop deferring to "later".

Specs: DESIGN v3 §6.5/§8 (session telemetry), AUTH-GITHUB.md §2 (per-OS stores) + §3 (git transport).

## Acceptance Criteria

1. **Per-agent MCP tokens**: minted per name in Settings-grade UI on the Agents view (token shown ONCE), stored app-db-side, read live by the HTTP host — a request bearing an agent token authorizes AND attributes (`[name]` in the session feed); revoke applies immediately; the install token stays unattributed. `resolveBearer` unit-tested.
2. **GIT_ASKPASS shim** (AUTH §3): poller/wizard git spawns get `GIT_ASKPASS` → a 0700 helper answering `x-access-token` / the stored token from the child env only (never disk/argv); cache refreshes on boot + every auth status/login/logout/device-authorize; empty cache = shim inert (system git credentials untouched); SSH remotes bypass everything.
3. **Win/Linux token store** (AUTH §2 fallback): AES-256-GCM file `~/.config/loredex/credentials`, machine-scrypt key, 0600; `AuthStatus.store: 'encrypted-file'` renders the honest Settings warning; macOS keychain path unchanged.
4. Gates green.

## Dev Agent Record

- Native Credential Manager / libsecret modules deliberately skipped — the spec sanctions the encrypted-file fallback with a visible warning; a native module is a packaging cost the zero-budget constraint doesn't want yet.
- The lib PR (loredex#25) carries the CLI/auth/work-items companions; the desktop Plan view upgrade to real work-item columns lands when that publishes and the dep bumps.

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-17 | 1.0 | Per-agent MCP tokens + attribution; askpass shim; encrypted-file store | Claude (dev agent) |
