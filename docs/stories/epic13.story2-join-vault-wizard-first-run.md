# Story 13.2: Join-vault wizard & first-run screen

## Status

Done

## Story

**As an** engineer joining a team,
**I want** to join a vault from a pasted URL or deep link, starting from a real first-run screen,
**so that** onboarding is minutes with zero git commands and the bare vault picker disappears.

## Acceptance Criteria

1. `wizard.joinVault {url, dest}` runs the decided sequence: paste clone URL (or `loredex://join?remote=…&branch=…` deep link, main → core) → native destination pick → `git clone` with streamed progress → shape validation (`projects/` or `.loredex/engine.json`, else `NOT_A_VAULT`, clone kept, user told) → schema handshake (`vaultSchemaStatus`; newer-than-supported → loud warning, join continues read-mostly) → register (`saveConfig` vaultPath + merge `projects` map when shipped) → seed `app_settings project_roots` prompt ("where do this team's repos live on this machine?" — skippable) → identity check (block writes, not reading) → `ensureGeneratedMergeDriver` + first fetch + seed `poll_cursor` (no notification storm).
2. A **first-run screen replaces the bare vault picker**: logo, one serif sentence, and three cards — "Create a vault" (13.1), "Join a vault", "Open an existing folder" (the old picker path, kept); it shows whenever no vault is configured.
3. Failures map to typed codes with actionable messages: `CLONE_AUTH_FAILED` (private repo — same no-OAuth credentials message), `DEST_NOT_EMPTY`, `NOT_A_VAULT`, `SCHEMA_AHEAD` (warning, not fatal).
4. Steps report `wizard.progress` events rendered in the stepped modal; on completion the reader and board are immediately live against the joined vault.
5. The v0.1 `vault.createOrJoin` channel is REMOVED in favor of the three wizard channels; all git ops under the write lock with `-c` identity injection.

## Tasks / Subtasks

- [x] Core sequence (AC: 1, 5)
  - [x] `src/core/wizard.ts joinVault`: clone with progress streaming, shape validation, `vaultSchemaStatus` handshake, register + project_roots seed, merge driver + first fetch + fresh-cursor seed; delete `vault.createOrJoin`
- [x] Deep link (AC: 1)
  - [x] Main registers the `loredex://` protocol; `join?remote&branch` opens the wizard pre-filled (paste path always available)
- [x] First-run screen (AC: 2)
  - [x] `views/wizard/FirstRun.tsx`: three-card chooser on `--bg-app`, serif empty-state line, routes to CreateVaultWizard / JoinVaultWizard / native picker
- [x] Wizard UI + failures (AC: 3, 4)
  - [x] `JoinVaultWizard.tsx` stepped modal; code→message map; SCHEMA_AHEAD renders as a loud warning banner, join continues; post-join pivot (core host on the new vault, board live)
- [x] Tests

## Dev Notes

- Supersedes Story 5.5 (M1 join wizard) — deep-link params are now `remote`/`branch` (registry rides the vault itself per PR-7a/7b); the batch-repo-registration idea becomes the skippable `project_roots` seeding prompt, which also feeds contract discovery (Story 11.1). Mark 5.5 superseded on the board. [Source: architecture-m2.md#7-wizards] [Source: architecture-m2.md#5-contract-intelligence]
- Step order, failure codes, the read-mostly SCHEMA_AHEAD behavior, and the no-storm cursor seed are decided verbatim. Clone-kept-on-NOT_A_VAULT matters: never delete what the user just downloaded. [Source: architecture-m2.md#7-wizards]
- Identity check blocks WRITES, not reading — a joiner can browse immediately and set identity when they first act. [Source: architecture-m2.md#7-wizards]
- First-run is renderer composition of existing pieces (picker, two wizards) — no new state; "wizard-driven join/create" is a PRD goal (F6/F7) finishing here. [Source: architecture-m2.md#7-wizards]
- Depends on Story 13.1 (wizard runner, progress modal machinery, validateRemote). Files: `src/core/wizard.ts`, `src/renderer/src/views/wizard/JoinVaultWizard.tsx`, `FirstRun.tsx`, `src/main/index.ts` (protocol), `src/shared/ipc-contract.ts` (`wizard.joinVault`; remove `vault.createOrJoin`), `src/core/ipc.ts`.

### Testing

- Unit: code→message map, deep-link parse, shape-validation matrix (projects/ present / engine.json only / neither), handshake outcomes. Integration: join a fixture remote vault end-to-end → registered, cursor seeded, zero notifications, board live; NOT_A_VAULT leaves the clone. [Source: architecture-m2.md#7-wizards]

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-10 | 0.1 | Drafted from architecture-m2.md (M2 cycle; supersedes Story 5.5) | Bob (SM) |
| 2026-07-10 | 1.0 | Approved | Sarah (PO) |

## Dev Agent Record

### Agent Model Used

claude-fable-5 (Claude Code)

### Debug Log References

- `npm run typecheck` clean; `npx vitest run` 62 files / 480 tests green; `npm run build` clean.
- M2 DoD walk (driver run, scratch bare repo in the OS temp dir): create on machine1 → pushed `refs/heads/main` (`.loredex/engine.json`, `_index/Home.md`), config.json → machine1 vault; join on machine2 → clone streamed (`Cloning into…`/`done.` as running details), handshake "vault predates schema stamping — compatible", config.json → machine2 vault, origin wired, cursor seeded at `origin/main b3fe957 — no notification storm`. Both flows returned their contract results (`remoteWired: true` / `schemaOk: true`).

### Completion Notes List

- Join sequence verbatim (m2 §7): destination → clone (streamed `git clone --progress`, stderr lines throttled ~3/s as running details) → shape validation (`projects/` OR `.loredex/engine.json`; the clone is KEPT on NOT_A_VAULT and the message names where) → `vaultSchemaStatus` handshake (SCHEMA_AHEAD = loud `warn` step + rust banner on the done page, join continues read-mostly, `schemaOk:false` in the result) → register (lib `saveConfig`, existing editor/projects preserved) → identity check (warn, never fail — blocks writes not reading, per the existing writer-channel identity gates) → merge driver + first fetch + fresh-cursor seed at `origin/<branch>`.
- Deep link: main registers `loredex://` (`setAsDefaultProtocolClient` + `open-url`, buffered until a window loads) and forwards the RAW url; parsing lives in `shared/join-link.ts` (renderer), so main stays logic-free. `branch` param rides into `git clone --branch` and the checked-out branch (symbolic-ref) wins the cursor.
- First-run screen replaces the bare picker (`status === 'no-vault'`): inline SVG mark (icon.svg identity, token-colored), serif line, three cards (Create / Join / Open existing folder — old picker kept). No gold primary on the view: the cards are the decision; hover ring is the gold vocabulary.
- Post-join skippable prompt "where do this team's repos live on this machine?" collects folders via the existing native project-root picker; the seed runs AFTER the pivot (`settings.projectRoots.set`) so rows land in the NEW vault's app-db scope — feeds contract discovery (11.1).
- `vault.createOrJoin` + `WizardInput`/`WizardResult` fully REMOVED (it never had a registered handler); the three wizard channels replace it (AC5).
- Integration test joins the vault the create-flow test just pushed (the literal DoD: a second "machine" joins machine1's remote); NOT_A_VAULT integration case proves the clone is kept and config untouched. Note learned there: a fresh scaffold's empty `projects/` is untracked by git, so joins of pristine vaults validate via `engine.json` — exactly why the shape rule is an OR.
- Deviation (recorded): identity prompt inside the join modal is the warn step + Settings pointer rather than an embedded form — the create wizard's `IdentityConfirm` remains the one identity-entry surface; join must not block on it (AC1 "block writes, not reading").

### File List

- `src/shared/ipc-contract.ts` — `wizard.joinVault`; `vault.createOrJoin` removed
- `src/shared/types.ts` — `JoinVaultResult`; `WizardInput`/`WizardResult` removed
- `src/shared/join-link.ts` + `join-link.test.ts` (new) — deep-link parsing
- `src/core/wizard.ts` — `joinVault`, `looksLikeVault`; deps gain `clone`/`schemaStatus`
- `src/core/git.ts` — `gitCloneStreaming`
- `src/core/engine.ts` — `schemaStatusAt`
- `src/core/handlers.ts` — join registration + real clone/schema deps
- `src/core/wizard.test.ts` — join failure matrix, shape matrix, SCHEMA_AHEAD/identity warn, deep-link branch, progress streaming
- `src/core/wizard.integration.test.ts` — machine2 join + NOT_A_VAULT clone-kept cases
- `src/main/index.ts` — `loredex://` registration, open-url buffering/forwarding
- `src/preload/index.ts`, `src/renderer/src/api.ts` — `onJoinLink`
- `src/renderer/src/stores/wizard.ts` — join form/run state, roots prompt, post-pivot seed
- `src/renderer/src/views/wizard/JoinVaultWizard.tsx`, `FirstRun.tsx` (new)
- `src/renderer/src/App.tsx` — FirstRun replaces EmptyVault; JoinVaultWizard mount; deep-link wiring
- `src/renderer/src/styles.css` — schema banner, roots list, first-run cards

## QA Results
