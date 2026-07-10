# Story 13.1: Create-vault wizard

## Status

Approved

## Story

**As a** DevOps admin,
**I want** a stepped wizard that creates a vault and optionally wires a pasted remote,
**so that** team setup is minutes of clicking, with every failure leaving a usable local vault.

## Acceptance Criteria

1. `wizard.createVault {dir, remoteUrl?}` runs the decided sequence: native folder pick (empty/nonexistent only) → optional remote paste with `wizard.validateRemote` preflight (`git ls-remote`) → identity confirm (block if unset) → `scaffoldVault` + `saveConfig` (vaultPath, sync:'git') + `git init -b main` → if remote: `remote add origin`, `ensureGeneratedMergeDriver`, initial commit, `git push -u origin main` → first `sync.status` + seed `poll_cursor`.
2. Each step reports `wizard.progress {flow, step, status, detail?}` events; the modal renders step state per the DESIGN modal spec (stepped card, gold primary advances, outline Cancel).
3. Failures map to typed envelope codes: `DEST_NOT_EMPTY`, `REMOTE_UNREACHABLE` (message: "check the URL or your git credentials (SSH key / credential helper); this app never asks for GitHub login"), `PUSH_REJECTED` (non-empty remote → offer the join flow instead), `IDENTITY_MISSING`.
4. Every failure after the scaffold step leaves a valid LOCAL vault; the wizard says so and offers "retry remote wiring" from Sync settings.
5. All git ops run under the write lock with per-command identity injection (`git -c user.name -c user.email`, F7); NO OAuth or device flow anywhere; on success the app pivots to the new vault (reader/board live).

## Tasks / Subtasks

- [ ] Core sequence (AC: 1, 5)
  - [ ] `src/core/wizard.ts`: `createVault` step runner emitting `wizard.progress`; `validateRemote` (`git ls-remote` → `{reachable, empty, defaultBranch}`); write-lock + `-c` identity on every git op; poll_cursor seed on completion
- [ ] Modal UI (AC: 2)
  - [ ] `views/wizard/CreateVaultWizard.tsx`: stepped modal (folder pick via main dialog → remote paste (optional, skippable) → identity confirm → progress list with per-step status)
- [ ] Failure UX (AC: 3, 4)
  - [ ] Envelope-code → message + recovery action map; "local vault created, remote wiring failed — retry from Sync settings" terminal state; full git output behind a details expander
- [ ] Channels + removal (AC: 1)
  - [ ] Register `wizard.validateRemote` / `wizard.createVault`; remove the create arm of v0.1 `vault.createOrJoin` (fully removed once 13.2 lands)
- [ ] Tests

## Dev Notes

- Supersedes Story 5.6 (M1 create wizard) — the M2 channel set (`wizard.createVault` + `wizard.validateRemote` + `wizard.progress`) replaces the `vault.createOrJoin` design; the join-link generation from 5.6 folds into 13.2's flow. Mark 5.6 superseded on the board. [Source: architecture-m2.md#7-wizards]
- Steps, failure codes, the no-OAuth message text, and the "valid local vault after step 4" guarantee are decided verbatim — implement the sequence, don't reorder it. Preflight BEFORE any writes is the point of `validateRemote`. [Source: architecture-m2.md#7-wizards]
- `scaffoldVault`/`saveConfig` are lib exports (vault writes stay in the lib); git wiring is core-host plumbing under the write lock (Story 3.5/9.1's mutex — wizard git ops are in its acquire list). [Source: architecture-m2.md#4-remote-poller]
- Cursor seeding on create/join prevents the notification storm (§4 fresh-cursor rule). [Source: architecture-m2.md#4-remote-poller]
- Modal anatomy per DESIGN (480–560px card, segmented/toggle patterns, footer buttons); wizard = generous surface, decisions happen here. [Source: DESIGN.md#layout]
- Files: `src/core/wizard.ts`, `src/renderer/src/views/wizard/CreateVaultWizard.tsx`, `src/shared/ipc-contract.ts` (3 channels + event), `src/core/ipc.ts`, `src/main/index.ts` (folder dialog).

### Testing

- Unit: step-runner state machine (each failure code at its step), validateRemote result mapping, progress-event ordering. Integration: create against a fixture bare remote → vault pushed, merge driver ensured, cursor seeded; failure injection after scaffold → local vault intact + retry path advertised. [Source: architecture-m2.md#7-wizards]

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-10 | 0.1 | Drafted from architecture-m2.md (M2 cycle; supersedes Story 5.6) | Bob (SM) |
| 2026-07-10 | 1.0 | Approved | Sarah (PO) |

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## QA Results
