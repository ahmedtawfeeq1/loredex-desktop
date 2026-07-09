# Story 1.8: Signed, notarized release pipeline

## Status

Approved

## Story

**As a** maintainer,
**I want** a CI pipeline that signs, notarizes, staples, and publishes release artifacts unattended,
**so that** every release passes Gatekeeper on a clean Mac.

## Acceptance Criteria

1. Release workflow creates an ephemeral keychain from a base64 .p12 (including `security set-key-partition-list`), signs inside-out with Developer ID + hardened runtime, entitlements `allow-jit` only — never `--deep`.
2. Bundled dugite-native git binaries are individually signed before app signing.
3. `notarytool submit --wait` runs with a ≥ 20 min timeout; CI asserts on the "Accepted" status text, not the exit code; the app is stapled.
4. Artifacts are a DMG (drag-to-/Applications) and a ZIP produced via `ditto -c -k --keepParent`, uploaded to the GitHub Release with `latest-mac.yml`.
5. CI asserts `spctl -a` passes on the stapled artifact.
6. `legal/` third-party notices are generated during the build.
7. release-please + conventional commits drive tagging; the tag merge triggers the signed build.

## Tasks / Subtasks

- [ ] Bundle the git fallback (AC: 2)
  - [ ] Add `dugite-native` binaries to the packaged app resources; `src/core/git.ts` resolves system git first, falls back to the bundled binary (resolution once at startup)
  - [ ] electron-builder hook (`afterPack` or `binaries` config) codesigns each dugite binary individually before app signing
- [ ] Signing config (AC: 1)
  - [ ] `build/entitlements.mac.plist`: `com.apple.security.cs.allow-jit` only; hardened runtime on in `electron-builder.yml`
  - [ ] `.github/workflows/release.yml`: decode base64 .p12 secret → ephemeral keychain (`security create-keychain`, `import`, `set-key-partition-list`), Developer ID identity; electron-builder signs inside-out (default) — assert no `--deep` anywhere
- [ ] Notarize + staple (AC: 3, 5)
  - [ ] `notarytool submit --wait --timeout 25m` with App Store Connect API key secrets; grep the output for `status: Accepted` and fail otherwise
  - [ ] `stapler staple`; then `spctl -a -t exec -vv` on the .app and `spctl -a -t open --context context:primary-signature` on the DMG — assert pass
- [ ] Artifacts + publish (AC: 4, 7)
  - [ ] DMG (drag-to-/Applications layout) + ZIP via `ditto -c -k --keepParent` (electron-builder's mac zip uses ditto; verify, don't assume); publish DMG + ZIP + `latest-mac.yml` to the GitHub Release
  - [ ] release-please workflow: release PR on conventional commits; merged tag triggers `release.yml`
- [ ] Legal notices (AC: 6)
  - [ ] Wire a license bundler (e.g. license-checker output) into the build producing `legal/` third-party notices shipped in the app resources

## Dev Notes

- Every rule here is a hard-won distribution constraint — follow the checklist exactly. [Source: architecture.md#distribution-constraints-dev-relevant]
- The #1 Node-app notarization failure class is unsigned bundled binaries — hence dugite binaries signed individually BEFORE the app bundle. [Source: architecture.md#distribution-constraints-dev-relevant]
- `notarytool` exit code is unreliable; assert the "Accepted" status text. p99 stalls 15–20 min — timeout must exceed that. [Source: architecture.md#distribution-constraints-dev-relevant]
- Plain `zip` corrupts signatures via NFD/NFC normalization; electron-updater requires the ZIP artifact + `latest-mac.yml`. [Source: architecture.md#distribution-constraints-dev-relevant]
- Electron ≥ 12 needs only `allow-jit` (not `allow-unsigned-executable-memory`). [Source: architecture.md#distribution-constraints-dev-relevant]
- `src/core/git.ts` grows the resolution logic here; identity `-c` injection helpers are also declared in this module for later stories (3.4). [Source: architecture.md#git-strategy]
- Secrets needed (document in README, values live in repo secrets): `MAC_CERT_P12_BASE64`, `MAC_CERT_PASSWORD`, `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8`. Cert rotation runbook goes in `docs/` (risk 4 mitigation).
- Files: `.github/workflows/release.yml`, `electron-builder.yml`, `build/entitlements.mac.plist`, `src/core/git.ts`, `legal/` generation script, `README` release section. [Source: architecture.md#source-tree]

### Testing

- Release-layer asserts ARE the tests: Accepted text, spctl pass, artifact set integrity. Run the workflow once against a pre-release tag to prove it end-to-end (M0 DoD: stapled DMG passes Gatekeeper on a clean Mac). [Source: architecture.md#testing-strategy]

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
