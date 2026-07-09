# Story 5.5: Join wizard & deep link

## Status

Approved

## Story

**As an** engineer joining a team,
**I want** to join a vault from a single link,
**so that** onboarding takes minutes with zero git commands (F7, FR11).

## Acceptance Criteria

1. The `loredex://join?...` deep link (registered by the main process) encodes remote URL, branch, and registry, opening the wizard pre-filled; a paste-the-link path exists too.
2. Join clones the vault, registers this machine, and batch-registers local repos by scanning a user-picked parent folder (native picker — no cold scans).
3. The flow completes with zero manual git commands; the canonical branch comes from the link, so master/main mismatch is impossible by construction.
4. Failure states (unreachable remote, auth failure) surface actionable messages.
5. On completion the reader and board are immediately live against the joined vault.

## Tasks / Subtasks

- [ ] Deep link plumbing (AC: 1)
  - [ ] `src/main/deep-links.ts`: register the `loredex://` protocol (`app.setAsDefaultProtocolClient` + `open-url` handler, Info.plist scheme via electron-builder config); parse `join` links `{remote, branch, registry?}`; forward to the renderer wizard route
  - [ ] Wizard also accepts a pasted link (same parser, shared in `src/shared/`)
- [ ] Join flow (AC: 2, 3, 4)
  - [ ] `views/wizard/JoinWizard.tsx` stepping: link → clone location (native picker) → clone (async git via core host, `vault.createOrJoin` channel) on the link's branch → engine re-init on the new vault → machine registration via the registry exports (PR-7a/b)
  - [ ] Batch-register: native folder picker for a parent dir; core host scans ONLY that picked dir for repos matching registry entries; user confirms the checklist before registration
  - [ ] Failure mapping: clone auth failure → "check your git credentials for <host>" + retry; unreachable remote → offline hint; never a raw git dump without the actionable line first
- [ ] Handler (AC: 2, 5)
  - [ ] Register `vault.createOrJoin` (join arm): performs clone + registration under the write lock, returns `WizardResult`; on success main persists the new vault path and the app pivots all views to it (engine re-init = respawn the core host with the new vault — cleanest single-resolution semantics)
- [ ] Zero-git validation (AC: 3)
  - [ ] E2E-able script: fresh userData + join link → working board, no terminal

## Dev Notes

- Depends on PR-7a/b (Stories 5.3/5.4): joining = clone + registry read + self-registration; without the registry a clone is dead (F7). The wizard should refuse-with-guidance on pre-registry vaults ("ask your admin to upgrade the vault: loredex ≥ <version>").
- Vault switch = core-host respawn with the new vault path: config is resolved exactly once per host lifetime, so re-pointing means a fresh host (main already knows how to respawn from Story 1.1). Do not hot-swap config inside a running host. [Source: architecture.md#process-model]
- `vault.createOrJoin` and `WizardInput`/`WizardResult` are contract members (app-local types). [Source: architecture.md#ipc-contract]
- TCC discipline: batch-register scans only a user-picked folder via the native panel — never scan `~` or guess paths. [Source: architecture.md#distribution-constraints-dev-relevant]
- Branch-from-link kills the master/main silent failure — there is no branch prompt, the link is authoritative (F7 evidence).
- Clone runs through core-host async git helpers; identity for the registration write uses the app identity profile (`-c` injection, Story 3.4). [Source: architecture.md#git-strategy]
- The join-link GENERATOR lives in the create wizard (Story 5.6); keep the link codec in `src/shared/join-link.ts` so both use it (versioned format, URL-safe).
- Files: `src/main/deep-links.ts`, `electron-builder.yml` (protocol), `src/shared/join-link.ts`, `src/renderer/src/views/wizard/JoinWizard.tsx`, `src/core/ipc.ts` (register createOrJoin join arm), `src/core/engine.ts`. [Source: architecture.md#source-tree]

### Testing

- Unit: link codec round-trip + malformed links, failure-message mapping, repo-scan matching. E2E (lands fully in 6.3 but scaffold now): join a fixture remote from a link → board renders. [Source: architecture.md#testing-strategy]

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-09 | 0.1 | Drafted from PRD Epic 5 | Bob (SM) |
| 2026-07-09 | 1.0 | Approved | Sarah (PO) |

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## QA Results
