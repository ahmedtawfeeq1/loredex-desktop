# Story 1.9: Auto-update, beta channel & translocation guard

## Status

Approved

## Story

**As a** user,
**I want** the app to update itself from GitHub Releases with an opt-in beta channel,
**so that** a solo maintainer can ship fixes that actually reach users.

## Acceptance Criteria

1. electron-updater checks GitHub Releases; stable users consume `latest-mac.yml`.
2. An in-app setting flips `updater.channel` to `beta`; pre-releases publish `beta-mac.yml`; stable users never see pre-releases.
3. Launching from `/AppTranslocation/` is detected and prompts Move to Applications (otherwise self-update silently breaks).
4. An update-check smoke test runs in CI; the updater never deletes user data.

## Tasks / Subtasks

- [ ] Updater wiring (AC: 1)
  - [ ] `src/main/updater.ts`: `electron-updater` `autoUpdater` against the GitHub provider; check on launch + every 4 h; download-and-notify flow (restart prompt, no forced restarts)
  - [ ] Update state surfaced to the renderer via a main→renderer notification channel (updater is main-process-owned; it does NOT ride the core-host contract)
- [ ] Beta channel (AC: 2)
  - [ ] Settings toggle flips `autoUpdater.channel = 'beta'` (persisted in the main-owned settings JSON from Story 1.4)
  - [ ] `release.yml` (Story 1.8): pre-release tags publish with `channel: beta` producing `beta-mac.yml`; stable releases publish `latest-mac.yml`
  - [ ] Verify a stable-channel install never offers a pre-release
- [ ] Translocation guard (AC: 3)
  - [ ] At launch, if `app.getPath('exe')` contains `/AppTranslocation/`, show a dialog prompting Move to /Applications with a Reveal button; do not attempt updates while translocated
- [ ] CI smoke (AC: 4)
  - [ ] Playwright/CI smoke: app launches with updater pointed at a fixture feed (or `--no-update` env), update check completes without error; assert updater code paths never touch `userData` contents

## Dev Notes

- One update stack: electron-builder + electron-updater against GitHub Releases. update.electronjs.org/Squirrel is explicitly NOT used (stable-channel-only, wrong stack). [Source: architecture.md#tech-stack] [Source: architecture.md#distribution-constraints-dev-relevant]
- Channel mechanics: pre-releases → `beta-mac.yml`; opt-in flips `updater.channel`. Both YMLs' integrity is asserted by the release pipeline. [Source: architecture.md#distribution-constraints-dev-relevant]
- Translocation: Gatekeeper runs quarantined apps from a randomized read-only mount; self-update silently breaks there — detect and prompt. DMG drag-to-/Applications (Story 1.8) is the primary defense; this is the runtime guard. [Source: architecture.md#distribution-constraints-dev-relevant]
- Updater lives in main (window/OS concern, no business logic violation); it must not import anything from `src/core/`. [Source: architecture.md#process-model]
- Rollback story (ops, not code): a bad release is unpublished so `latest-mac.yml` points at the previous good version — never build "downgrade" logic into the app.
- Files: `src/main/updater.ts`, `src/main/index.ts` (launch checks), `src/renderer/src/views/settings/` (beta toggle), `.github/workflows/release.yml` (channel publish), `tests/e2e/update-smoke.spec.ts`. [Source: architecture.md#source-tree]

### Testing

- Unit: channel-selection logic, translocation path detection (string fixture). E2E: update-check smoke in `tests/e2e/`, run in CI nightly + release. [Source: architecture.md#testing-strategy]

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
