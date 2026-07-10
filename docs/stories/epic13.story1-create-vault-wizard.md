# Story 13.1: Create-vault wizard

## Status

Done

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

- [x] Core sequence (AC: 1, 5)
  - [x] `src/core/wizard.ts`: `createVault` step runner emitting `wizard.progress`; `validateRemote` (`git ls-remote` → `{reachable, empty, defaultBranch}`); write-lock + `-c` identity on every git op; poll_cursor seed on completion
- [x] Modal UI (AC: 2)
  - [x] `views/wizard/CreateVaultWizard.tsx`: stepped modal (folder pick via main dialog → remote paste (optional, skippable) → identity confirm → progress list with per-step status)
- [x] Failure UX (AC: 3, 4)
  - [x] Envelope-code → message + recovery action map; "local vault created, remote wiring failed — retry from Sync settings" terminal state; full git output behind a details expander
- [x] Channels + removal (AC: 1)
  - [x] Register `wizard.validateRemote` / `wizard.createVault`; remove the create arm of v0.1 `vault.createOrJoin` (fully removed once 13.2 lands)
- [x] Tests

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

claude-fable-5 (Claude Code)

### Debug Log References

- `npm run typecheck` clean; `npx vitest run` 60 files / 465 tests green (before the integration test landed); `npx vitest run src/core/wizard.integration.test.ts` 1 passed (real bare remote: scaffold → config → push → cursor seed → F7 attribution); `npm run build` clean.

### Completion Notes List

- Sequence implemented verbatim (m2 §7): destination → preflight (`git ls-remote --symref`, BEFORE any writes) → identity → scaffold (+`saveConfig` +`git init -b <branch>`) → remote wiring (remote add, merge driver, attributed commit, `push -u`) → seed (first `sync.status` + poll_cursor at pushed sha). Whole mutating flow under `withWriteLock`; wizard git runs with `GIT_TERMINAL_PROMPT=0` + `GIT_SSH_COMMAND='ssh -oBatchMode=yes'` so auth failures fail fast with git's own words instead of hanging (no OAuth anywhere).
- Failure codes at their exact steps: `DEST_NOT_EMPTY` (Finder `.DS_Store` doesn't count), `REMOTE_UNREACHABLE` (decided no-OAuth message verbatim), `PUSH_REJECTED` (non-empty remote at preflight → offer join; rejected push after scaffold → same code with `localVaultCreated: true`), `IDENTITY_MISSING`. Every envelope after scaffold carries `detail.localVaultCreated + gitOutput`; the modal renders "local vault intact — retry remote wiring from Sync settings" + a details expander (AC3/AC4).
- Non-empty-remote is caught at preflight (before any write) rather than at push — strictly better than the AC's minimum; the push-race case still maps PUSH_REJECTED post-scaffold.
- App-local contract evolution: `RemoteCheck.message` (git's words for the inline retry), `wizard.progress` status includes `'warn'` (used by 13.2's handshake), and the remote's advertised default branch is adopted for `git init -b` (push never fights the remote's HEAD).
- Success pivot: new main-owned `loredex:set-vault` (persist + core-host restart + `vault-changed`), sharing the picker's `applyVault` mechanics — main stays logic-free. Wizard folder pick = new native dialog with `createDirectory` (TCC rule kept).
- Identity confirm reuses the ordinary `settings.identity.*` channels; `settings.identity.get` now degrades `ambient` to null instead of throwing NO_CONFIG so the step works on first run (13.2 dependency).
- `vault.createOrJoin` had no registered handler (was NOT_IMPLEMENTED); channel + WizardInput/WizardResult removal happens in 13.2 as the story directs.
- EmptyVault gained a temporary "Create a vault" primary — replaced by the 13.2 FirstRun screen.

### File List

- `src/shared/ipc-contract.ts` — `wizard.validateRemote` / `wizard.createVault` channels, `wizard.progress` event, 6 wizard IpcCodes
- `src/shared/types.ts` — `WizardFlow`, `WizardStepStatus`, `RemoteCheck`, `CreateVaultResult`, `WizardFailureDetail`; re-export lib `Config`
- `src/core/wizard.ts` (new) — step runner, `ensureEmptyDir`, `parseLsRemote`, `validateRemote`, `createVault` (deps-injected)
- `src/core/wizard.test.ts` (new), `src/core/wizard.integration.test.ts` (new)
- `src/core/engine.ts` — explicit-path lib wrappers: `readConfigFile`, `writeConfigFile`, `scaffoldNewVault`, `ensureMergeDriverAt`, `syncHealthAt`
- `src/core/git.ts` — `gitAsync` env option + `NON_INTERACTIVE_GIT_ENV`
- `src/core/handlers.ts` — wizard deps + channel registration; identity.get ambient degrade
- `src/main/index.ts` — `applyVault` extraction, `loredex:pick-wizard-folder`, `loredex:set-vault`
- `src/main/dialogs.ts` — `pickWizardFolderDialog`
- `src/preload/index.ts`, `src/renderer/src/api.ts` — `pickWizardFolder`, `setVault`
- `src/renderer/src/stores/wizard.ts` (new)
- `src/renderer/src/views/wizard/CreateVaultWizard.tsx`, `WizardSteps.tsx`, `IdentityConfirm.tsx`, `wizard-errors.ts`, `wizard-errors.test.ts` (all new)
- `src/renderer/src/App.tsx` — modal mount, wizard.progress subscription, EmptyVault create button
- `src/renderer/src/styles.css` — wizard step list / failure / identity styles (DESIGN v2 tokens)

## QA Results

### Review — QA agent (fresh eyes), 2026-07-10

**Verdict: PASS.** Suites: app vitest 488/488 (63 files, incl. the new `tests/m2-e2e-drive.test.ts` module drive), lib vitest 143/143, typecheck (node+web) clean, production build clean.

- Stepped modal per the DESIGN wizard pattern; `wizard.validateRemote` ls-remote preflight with typed failures (auth/not-found/not-empty…) rendered actionably (`wizard.test.ts` + `wizard-errors.test.ts`); scaffold via lib `scaffoldVault` under the write lock; core host restart on vault switch.
- Integration path covered in `wizard.integration.test.ts` against real temp git remotes.
