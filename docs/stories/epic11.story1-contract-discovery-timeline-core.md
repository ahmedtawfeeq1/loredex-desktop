# Story 11.1: Contract discovery & change timeline (core host)

## Status

Approved

## Story

**As an** integrations engineer,
**I want** the app to discover contract files in team repos and build their change timeline from git history,
**so that** contract churn is visible without anyone maintaining a spreadsheet.

## Acceptance Criteria

1. Project-root discovery follows the decided precedence: loredex `config.projects` (when non-empty AND `config.vaultPath` matches the open vault) wins; else `app_settings key='project_roots'` for this vault; the app-side map is never written back into config.json.
2. Contract files are matched per project root, case-insensitive: `openapi*.y?(a)ml`, `*openapi*.json`, `postman*collection*.json`, `**/*.graphql`, plus user globs from `app_settings key='contract_globs'`; `.git/` and `node_modules/` are always excluded.
3. Per matched file, `git log --follow --numstat --format=<token-separated>` builds timeline rows cached in app-db `contract_scan (repo_root, file, commit_sha, committed_at, summary_json)`; scans are incremental — only log since the newest cached sha per file.
4. `contracts.timeline {project?}` returns a merged, date-sorted `ContractChange[]` (`{file, sha, date, author, adds, dels, links: []}` — links empty until Story 11.3); `settings.projectRoots` and `settings.contractGlobs` get/set channels persist to app-db.
5. A post-integrate scan emits `contract.changed {project, file, sha}` for new rows; everything in this story is read-only against the repos — no vault writes, no worktree diffs.

## Tasks / Subtasks

- [ ] Root discovery + settings (AC: 1, 4)
  - [ ] `src/core/contracts.ts`: precedence resolver; `settings.projectRoots` / `settings.contractGlobs` channels backed by `app_settings`; Settings UI rows (folder picker via native panel — no cold scans)
- [ ] Matching + scan (AC: 2, 3)
  - [ ] Glob matcher with the fixed pattern set + user globs; incremental `git log --follow --numstat` per file; parse into `contract_scan` rows (adds/dels, subject, author in `summary_json`)
- [ ] Timeline channel + event (AC: 4, 5)
  - [ ] `contracts.timeline` merges cached rows date-sorted; wire the post-integrate scan hook (poller) → `contract.changed`
- [ ] Tests

## Dev Notes

- Contract intelligence is read-only and app-side by design — no vault writes means core-host code, NOT lib exports; this does not violate the anti-second-engine rule because nothing here writes vault markdown. [Source: architecture-m2.md#5-contract-intelligence]
- Precedence, pattern set, cache table, and incremental discipline are decided verbatim in §5; `contract_scan` schema ships with Story 3.6/9.2 — this story owns its read/write logic. [Source: architecture-m2.md#5-contract-intelligence] [Source: architecture-m2.md#3-app-db]
- Channel shapes and state placement (`derived + app-db cache`) per the §8 table. Wizard join-flow seeds `project_roots` (Story 13.2); Settings is the manual path built here. [Source: architecture-m2.md#8-ipc-additions]
- No lib dependency — per the sequencing note, contract stories can run parallel from day one (after 9.2 lands the db). [Source: architecture-m2.md#8-ipc-additions]
- Files: `src/core/contracts.ts`, `src/core/git.ts` (log helpers), `src/shared/ipc-contract.ts` (channels + `ContractChange`), `src/core/ipc.ts`, `src/renderer/src/views/settings/` (roots + globs rows).

### Testing

- Unit: precedence matrix (config match / mismatch / empty), glob matching incl. exclusions + user globs, numstat parsing, incremental-scan cutoff. Integration: fixture repo with an openapi.yaml mutated over 3 commits → 3 cached rows, second scan adds 0. [Source: architecture-m2.md#5-contract-intelligence]

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
