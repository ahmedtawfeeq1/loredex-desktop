# Story 1.3: Core host embeds pinned loredex

## Status

Done

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

- [x] Add the engine dependency (AC: 1)
  - [x] `npm i -E loredex` (exact pin, latest 2.x published release)
- [x] Engine facade (AC: 1, 2)
  - [x] `src/core/engine.ts`: the sole `import 'loredex'` site; `initEngine(vaultOverride?)` calls `loadConfig` exactly once, memoizes the resolved `Config`, exposes typed accessors used by handlers
  - [x] Core-host entry `src/core/index.ts` calls `initEngine()` before registering IPC handlers; a second init call throws
- [x] IPC handlers (AC: 2, 3, 4)
  - [x] Register `config.get` → memoized `Config`
  - [x] Register `vault.readNote` → `resolveNoteInsideVault(vault, path)` then `parseDoc`; resolution failure → `VAULT_OUTSIDE_PATH` envelope
  - [x] Register `vault.search` → `searchVault(q)`; `facets` param accepted but may be ignored until Story 2.4
- [x] Pinned-release fix verification (AC: 5)
  - [x] Add `tests/pinned-release.test.ts`: against the installed `node_modules/loredex`, assert the router writes the quoted gitattributes pattern (F8) and handoff footers use the project-local `loredex` invocation, not `npx -y loredex@latest` (F6); test fails on a regressed pin bump

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

Claude Fable 5 (claude-fable-5) — BMAD dev agent

### Debug Log References

- `npm run typecheck` green; `npm test` 18 passing (4 files, incl. tests/pinned-release.test.ts); `npm run build` green.
- Time-boxed `LOREDEX_CONFIG_DIR=<sim>/.loredex-config npm run dev`: core host logged `config: .../loredex-simulation/nimbus-vault` — the embedded engine resolved the real simulated team vault config once at startup.

### Completion Notes List

- DEVIATION (decided scope cut, release-time TODO): `loredex` is installed as `"loredex": "file:../loredex"` (local sibling link, npm pkg pattern proven by loredex-obsidian), NOT the exact-pinned npm 2.x release AC1 asks for. Replace with the exact npm pin before release; ci.yml clones and builds the sibling as a stand-in.
- `src/core/engine.ts` is the sole runtime `import 'loredex'` site. `initEngine()` calls `loadConfig()` exactly once; a second call throws (F6 defense). No config on disk → engine holds `null` and handlers answer with a `NO_CONFIG` envelope until story 1.4's vault picker.
- Contract types `Config`/`Doc`/`SearchHit`/`ProductDashboard` now `import type from 'loredex'`; the story-1.2 temporary stubs were removed from `src/shared/ipc-contract.ts` (type-only imports don't violate the sole-import rule).
- `vault.readNote` joins vault-relative paths to the vault root, then routes through `resolveNoteInsideVault` — traversal and absolute escapes reject as `VAULT_OUTSIDE_PATH` (tested).
- `vault.search` proxies `searchVault`; `facets` accepted but ignored until story 2.4.
- DEVIATION (file placement): handler registration lives in `src/core/handlers.ts` (not in the architecture source tree) so tests can wire real engine + dispatcher without importing the `process.parentPort` entry.
- AC5 check pins to the *installed build* under `node_modules/loredex/dist`: F8 quoted gitattributes rule (`"Start Here - Product.md" merge=loredex-generated`) present; every handoff consume footer uses project-local `loredex handoffs --consume`, none use npx.
- Fixture vault `tests/fixtures/vault/`: 2 projects (nimbus-api, nimbus-web), product brief, 2 notes + 1 handoff note — reused by story 1.7's MCP contract test.

### File List

- package.json / package-lock.json ("loredex": "file:../loredex" — release TODO above)
- src/core/engine.ts (new — sole loredex import site)
- src/core/handlers.ts (new — registers config.get / vault.readNote / vault.search)
- src/core/index.ts (initEngine() before handler registration)
- src/shared/ipc-contract.ts (loredex type imports replace temp stubs)
- src/core/engine.test.ts (new — init-once, readNote, traversal rejection, search, full IPC round-trip)
- tests/pinned-release.test.ts (new — F8/F6 fix verification against installed build)
- tests/fixtures/vault/** (new fixture: brief + 3 notes across 2 projects, one handoff)

## QA Results
