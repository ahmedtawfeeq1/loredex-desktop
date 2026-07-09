# Story 1.3: Core host embeds pinned loredex

## Status

Approved

## Story

**As a** maintainer,
**I want** the core host to import the pinned loredex library and serve config/read/search over IPC,
**so that** one in-process engine serves the app (F6 fixed by construction).

## Acceptance Criteria

1. `loredex` is an exact-version pinned dependency; the core host `import`s it directly (no CLI shell-outs for these operations).
2. Config is resolved exactly once at core-host startup; `config.get` returns the resolved `Config` over IPC.
3. `vault.readNote` returns a parsed `Doc` using `parseDoc` + `resolveNoteInsideVault`; paths outside the vault are rejected.
4. `vault.search` proxies `searchVault` and returns `SearchHit[]`.
5. An automated check verifies the pinned release contains the F8 gitattributes fix and the F6 npx-footer fix (quoted pattern in router output; project-local footer in handoff briefs).

## Tasks / Subtasks

- [ ] Add the engine dependency (AC: 1)
  - [ ] `npm i -E loredex` (exact pin, latest 2.x published release)
- [ ] Engine facade (AC: 1, 2)
  - [ ] `src/core/engine.ts`: the sole `import 'loredex'` site; `initEngine(vaultOverride?)` calls `loadConfig` exactly once, memoizes the resolved `Config`, exposes typed accessors used by handlers
  - [ ] Core-host entry `src/core/index.ts` calls `initEngine()` before registering IPC handlers; a second init call throws
- [ ] IPC handlers (AC: 2, 3, 4)
  - [ ] Register `config.get` → memoized `Config`
  - [ ] Register `vault.readNote` → `resolveNoteInsideVault(vault, path)` then `parseDoc`; resolution failure → `VAULT_OUTSIDE_PATH` envelope
  - [ ] Register `vault.search` → `searchVault(q)`; `facets` param accepted but may be ignored until Story 2.4
- [ ] Pinned-release fix verification (AC: 5)
  - [ ] Add `tests/pinned-release.test.ts`: against the installed `node_modules/loredex`, assert the router writes the quoted gitattributes pattern (F8) and handoff footers use the project-local `loredex` invocation, not `npx -y loredex@latest` (F6); test fails on a regressed pin bump

## Dev Notes

- Anti-second-engine rule is in force from this story on: `src/core/engine.ts` is the ONLY file that imports `loredex`. Everything else goes through it. [Source: architecture.md#coding-standards] [Source: architecture.md#overview]
- Published exports you may use now: `loadConfig`, `parseDoc`, `resolveNoteInsideVault`, `searchVault` (full inventory in the lib-surface table — do not call exports that ship with future PRs). [Source: architecture.md#loredex-library-surface]
- Config is resolved exactly once per core-host lifetime — this is the F6 split-brain defense. Respawn re-resolves; that is fine (fresh process). [Source: architecture.md#process-model]
- `vault.readNote` path safety: never `fs.readFile` a renderer-supplied path directly; always route through `resolveNoteInsideVault`. Rejections use the `VAULT_OUTSIDE_PATH` envelope code. [Source: architecture.md#ipc-contract]
- Payload types `Config`, `Doc`, `SearchHit` come `import type from 'loredex'` in the contract — with the real dependency installed, remove any temporary stubs for these three from `src/shared/types.ts`. [Source: architecture.md#ipc-contract]
- The two CLI fixes are already landed in loredex source; this story only proves the pinned published release includes them (BUILD-PLAN M0 scope is "verify", not "land").
- Files: `src/core/engine.ts`, `src/core/index.ts`, `src/core/ipc.ts` (register handlers), `tests/pinned-release.test.ts`, `package.json`. [Source: architecture.md#source-tree]

### Testing

- Unit tests against `tests/fixtures/vault/` (create a minimal fixture vault: 2 projects, 3 notes, one handoff note) — this fixture is reused by the MCP contract test in Story 1.7. [Source: architecture.md#testing-strategy]
- Cover: single-resolution guarantee (second init throws), readNote traversal rejection, search returns hits from the fixture.

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
