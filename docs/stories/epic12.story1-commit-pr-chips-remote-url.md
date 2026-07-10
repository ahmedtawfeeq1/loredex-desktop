# Story 12.1: Commit/PR chips & remote-URL derivation

## Status

Approved

## Story

**As a** reader,
**I want** every commit sha in the app to be a chip that links to GitHub when the remote is GitHub,
**so that** jumping from vault truth to code review is one click.

## Acceptance Criteria

1. `src/core/github.ts` derives the web base URL per repo: `git remote get-url origin` (project repo for contract chips, vault repo for handoff/activity SHAs), normalizing `git@github.com:o/r.git` and `https://github.com/o/r(.git)` → `https://github.com/o/r`; cached per repo per session.
2. A shared CommitChip component renders `<base>/commit/<sha>` links (mono, short sha); non-GitHub remotes render plain mono text, no link — never a broken URL.
3. The M1 home-view SHA-hyperlink behavior is superseded by this one helper: home brief, activity feed, contract timeline, and handoff contract chips all route through it (one derivation, everywhere).
4. A PR chip slot exists on the component (`prForCommit` populated by Story 12.2; renders nothing until then).
5. Unit tests cover URL normalization (ssh, https, .git suffix, non-GitHub, no remote) and the fallback rendering.

## Tasks / Subtasks

- [ ] Derivation helper (AC: 1, 5)
  - [ ] `src/core/github.ts`: `remoteWebBase(repoRoot)` with normalization + session cache; expose through a small derived channel or embed base URLs in existing payloads (choose one, record it)
- [ ] CommitChip (AC: 2, 4)
  - [ ] `components/CommitChip.tsx`: linked/plain variants, short-sha display, external-open via shell (main-process `shell.openExternal` — renderer never opens URLs directly); PR slot
- [ ] Supersede M1 call sites (AC: 3)
  - [ ] Rewire home brief SHAs, activity feed, contract timeline hashes onto CommitChip; delete the old helper
- [ ] Tests

## Dev Notes

- Read-only, network-free story: derivation is one git query + string normalization; no gh, no REST, no tokens. [Source: architecture-m2.md#6-github-layer]
- "Existing SHA-hyperlink behavior from M1 home view is superseded by this one helper" — that supersession is an AC, not a nice-to-have; two derivations would drift. [Source: architecture-m2.md#6-github-layer]
- Which repo's remote: project repo for contract chips, vault repo for handoff/activity SHAs — the call site declares its repoRoot. [Source: architecture-m2.md#6-github-layer]
- No lib dependency; can run parallel from day one. [Source: architecture-m2.md#8-ipc-additions]
- Files: `src/core/github.ts`, `src/renderer/src/components/CommitChip.tsx`, call-site rewires in home/activity/contracts views, `src/main/index.ts` (openExternal broker if not present).

### Testing

- Unit: normalization matrix (ssh/https/.git/enterprise-host/non-github/absent remote), cache behavior, chip variant rendering. [Source: architecture-m2.md#6-github-layer]

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-10 | 0.1 | Drafted from architecture-m2.md (M2 cycle) | Bob (SM) |
| 2026-07-10 | 1.0 | Approved | Sarah (PO) |

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## QA Results
