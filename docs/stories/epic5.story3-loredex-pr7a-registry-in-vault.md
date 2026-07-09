# Story 5.3: loredex PR-7a — registry-in-vault library core (loredex repo)

## Status

Approved

## Story

**As a** team,
**I want** the project registry stored in the vault as truth,
**so that** a fresh clone is a live vault, not a dead one (F7, FR12).

## Acceptance Criteria

1. The vault carries a shared project registry (member repos, registrants, last sync per teammate); lib config resolution reads it as the source of truth.
2. Registry reads/writes are lib exports; `scaffoldVault` writes an initial registry.
3. Vaults without a registry still resolve via `config.json` (compatibility until PR-7b migration).
4. Tests in the loredex repo; coordinated release notes document the rollout.

## Tasks / Subtasks

- [ ] Registry format + storage (AC: 1)
  - [ ] In the loredex repo: define the registry file in the vault (e.g. `.loredex/registry.json` or a frontmattered note — decide in-PR; must be git-mergeable at 12 writers, so prefer one-entry-per-key JSON or per-project files), entries: project name, repo path/remote, registrant identity, registered-at, last-sync per machine-identity
  - [ ] `loredex_schema` versioning applies (PR-2 machinery); registry writes stamp it
- [ ] Resolution + exports (AC: 1, 2, 3)
  - [ ] Config resolution order: vault registry (when present) → `config.json` fallback (unchanged behavior for pre-registry vaults)
  - [ ] Export registry read/write/upsert functions + types from `lib.ts`; `scaffoldVault` writes the initial registry with the creating identity
- [ ] Release discipline (AC: 4)
  - [ ] Tests; release notes documenting the two-step rollout (7a lib capability, 7b CLI migration) — this is a coordinated loredex-core release, not an app feature

## Dev Notes

- **Repo:** sibling `loredex` repo. This is the largest lib change in M1 (feature 12, estimate L) and is split 7a (lib core, this story) / 7b (CLI migration, Story 5.4) to stay one-session-sized each.
- Evidence: F7 — registration is invisible per-machine state; a fresh vault clone is dead (no member repos), and `status`/`doctor` disagree. The registry makes clone = alive and gives the app its company overview (Story 5.7).
- Merge pressure design constraint: 12 writers touching one registry — structure for low-conflict merges (per-project/per-machine keys, no timestamp churn in a single hot line). The F8 merge-driver breakage is the cautionary tale.
- Desktop consumption pattern: the app reads the registry through the engine facade (`config.get` transparently upgraded + explicit registry reads for the overview) — shape the exports so both work.
- Backwards compatibility is a hard AC: pre-registry vaults keep working on config.json until the CLI migration lands (7b). Never require both PRs to land atomically.

### Testing

- loredex repo: resolution precedence (registry beats config.json; absent registry falls back), scaffold writes initial registry, concurrent-writer merge fixture (two clones register different repos → clean merge), schema stamping. [Source: architecture.md#testing-strategy]

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
