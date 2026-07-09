# Story 5.7: Registry company overview

## Status

Approved

## Story

**As a** PM,
**I want** a company overview of the registry,
**so that** membership and sync recency are visible instead of per-machine folklore (FR12).

## Acceptance Criteria

1. An overview view renders the vault registry: member repos, registrants, and last sync per teammate.
2. Data comes from the core host reading the registry via lib exports, refreshing on `vault.changed` and poller integrates.
3. The overview links into sync health and the board.

## Tasks / Subtasks

- [ ] Data channel (AC: 1, 2)
  - [ ] Add contract channel `registry.overview { in: void; out: RegistryOverview }` (app-local type wrapping the lib's registry types: projects → repos, registrants with identity, last-sync per machine)
  - [ ] Core handler reads via the PR-7a registry exports; refresh on `vault.changed` (registry file paths) and post-integrate
- [ ] Overview UI (AC: 1, 3)
  - [ ] `views/registry/Overview.tsx`: table/cards per project — repos, who registered, last sync recency (with stale styling past a threshold); each project links to its board lanes; header links to the sync panel
  - [ ] Empty/pre-registry state: explain + point at the create/join wizard

## Dev Notes

- Small, read-only closer for FR12: PR-7a/b made the registry truth; this renders it. No writes anywhere in this story.
- Read through the engine facade (lib registry exports) only — do not parse the registry file app-side; its format is lib-owned and may change under `loredex_schema`. [Source: architecture.md#loredex-library-surface] [Source: architecture.md#coding-standards]
- "Last sync per teammate" comes from registry entries (PR-7a defines the field); recency styling should reuse the freshness-badge conventions from Story 2.5 for visual consistency.
- New contract channel per the one-seam rule. [Source: architecture.md#ipc-contract]
- Files: `src/shared/ipc-contract.ts` (+`registry.overview`), `src/shared/types.ts` (`RegistryOverview`), `src/core/ipc.ts`, `src/renderer/src/views/registry/Overview.tsx`. [Source: architecture.md#source-tree]

### Testing

- Unit: overview shaping from fixture registry data, stale-threshold styling logic, pre-registry empty state. [Source: architecture.md#testing-strategy]

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
