# Story 1.1: App scaffold & three-process topology

## Status

Approved

## Story

**As a** maintainer,
**I want** a scaffolded Electron app with the decided three-process topology and a CI build,
**so that** every later story lands on working infrastructure.

## Acceptance Criteria

1. Repo scaffolded with electron-vite + TypeScript + electron-builder targeting macOS arm64; `npm run dev` opens a window.
2. Main process forks a core host via `utilityProcess.fork` at startup and brokers a `MessagePortMain` pair to the renderer; a ping message round-trips renderer → core host → renderer.
3. Renderer runs with `sandbox: true` and `contextIsolation: true`; Node integration disabled.
4. A core-host crash triggers respawn and port re-brokering without closing the window.
5. GitHub Actions on `macos-latest` (arm64) builds an unsigned DMG artifact on every PR; vitest is wired with at least one passing unit test.
6. Repo is public with MIT license and README stub.

## Tasks / Subtasks

- [ ] Scaffold the repo (AC: 1, 6)
  - [ ] `npm create @quick-start/electron` (electron-vite) with the React + TS template; convert to ESM (`"type": "module"`)
  - [ ] Pin exact versions per the tech-stack table (Electron 43.x, TypeScript 5.x, electron-vite 4.x, electron-builder 26.x, React 19.x); record exact pins in File List
  - [ ] Add `electron-builder.yml`: `mac.target: [dmg, zip]`, `arch: [arm64]`, `LSMinimumSystemVersion: '14.0'`
  - [ ] MIT `LICENSE`, README stub
- [ ] Lay down the source tree skeleton (AC: 1)
  - [ ] Create `src/main/`, `src/core/`, `src/preload/`, `src/renderer/src/`, `src/shared/` exactly per the architecture source tree; empty modules may export TODO stubs
- [ ] Three-process topology (AC: 2, 3, 4)
  - [ ] `src/main/index.ts`: create `BrowserWindow` with `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`, preload wired
  - [ ] Fork `src/core/index.ts` via `utilityProcess.fork` at app ready
  - [ ] Broker a `MessageChannelMain` pair: one port to core host via `postMessage`, one to renderer via `webContents.postMessage`
  - [ ] Implement ping: renderer sends `{t:'ping'}` over the port, core host replies `{t:'pong'}`, renderer logs it
  - [ ] On core-host `exit` event: re-fork and re-broker fresh ports; window stays open
- [ ] CI (AC: 5)
  - [ ] `.github/workflows/ci.yml` on `macos-latest`: install, typecheck, vitest, `electron-builder --mac --arm64` (unsigned, `CSC_IDENTITY_AUTO_DISCOVERY=false`), upload DMG artifact
  - [ ] One passing vitest unit test (e.g. a ping message codec test)

## Dev Notes

- Greenfield story: the repo is empty. Follow the tech stack and source tree **exactly**. [Source: architecture.md#tech-stack] [Source: architecture.md#source-tree]
- Process ownership: main is logic-free (windows, forking, brokering only); core host will own all engine work; renderer is fully sandboxed. Do not add business logic to `src/main/`. [Source: architecture.md#process-model]
- The MessagePort brokered here is the transport that Story 1.2's typed contract rides on — keep the raw port handling in one place (`src/main/index.ts` brokering, `src/preload/index.ts` receive side) so 1.2 can wrap it.
- Renderer receives its port via `ipcRenderer.on('core-port')` **in the preload only**; the renderer page itself never touches `ipcRenderer`. [Source: architecture.md#coding-standards]
- Respawn rule: main re-forks and re-brokers on crash; renderer-side wrapper resilience (buffer + retry) is Story 1.2's job — here it is enough that the window survives and a new ping succeeds. [Source: architecture.md#process-model]
- Unsigned CI build now; signing/notarization is Story 1.8. Public repo + MIT from day one is a distribution requirement. [Source: architecture.md#distribution-constraints-dev-relevant]

### Testing

- vitest colocated `*.test.ts`; wire `npm test`. [Source: architecture.md#testing-strategy]
- Minimum: one unit test passing in CI; manual check that killing the core host process (Activity Monitor) leaves the window alive and ping works after respawn.

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
