# Story 12.1: Commit/PR chips & remote-URL derivation

## Status

Done

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

- [x] Derivation helper (AC: 1, 5)
  - [x] `src/core/github.ts`: `remoteWebBase(repoRoot)` with normalization + session cache; expose through a small derived channel or embed base URLs in existing payloads (choose one, record it)
- [x] CommitChip (AC: 2, 4)
  - [x] `components/CommitChip.tsx`: linked/plain variants, short-sha display, external-open via shell (main-process `shell.openExternal` — renderer never opens URLs directly); PR slot
- [x] Supersede M1 call sites (AC: 3)
  - [x] Rewire home brief SHAs, activity feed, contract timeline hashes onto CommitChip; delete the old helper
- [x] Tests

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

Claude Fable 5 (claude-fable-5)

### Debug Log References

- Baseline: 54 files / 402 tests green before the story; 413 after.
- `npx tsc --noEmit` (both projects), `npx vitest run`, `npm run build` — all green.
- Real-vault DoD check: `remoteWebBase(<nimbus _machine2 vault>)` via real git →
  `https://github.com/ahmedtawfeeq1/nimbus` (gated contract test in core/github.test.ts).

### Completion Notes List

- **Exposure decision (recorded per task 1): embed base URLs in existing payloads —
  no new channel.** Three carriers: (1) `ContractChange.commitBase` (new field) filled by
  the `contracts.timeline` handler through `remoteWebBase` (project repo, real
  `git remote get-url origin`, session-cached per repo); (2) Atlas nodes already carried
  `commitBase` — production wiring now routes through the same cached lookup; (3) vault-repo
  call sites (home brief, activity feed) reuse the already-derived `VaultIdentity.remote`
  through the ONE shared normalizer.
- **One derivation, split in two layers**: the pure normalization (`githubWebBase`,
  ssh/https/.git/enterprise/non-GitHub matrix) lives in `src/shared/github.ts` so both
  bundles import it; the per-repo git query + session cache lives in `src/core/github.ts`.
  Deleted superseded helpers: `remoteCommitBase` (markdown/shaLinks.ts, M1 home view — it
  linkified non-GitHub hosts, i.e. potentially broken URLs; now GitHub-only) and
  `commitBaseOf` + the `.git/config` peek `readOriginRemote` (core/atlas.ts).
- **External open**: no new broker needed — chips render `<a target="_blank">`, and the
  existing main-process guard (windows.ts `setWindowOpenHandler` → `shell.openExternal`)
  opens externally; the renderer never opens URLs itself.
- Feed rows and contract cards became `div role="button"` (were `<button>`): an anchor chip
  may not nest inside a button. Keyboard behavior preserved (Enter/Space handlers).
- Handoff contract chips (story 11.3, `ContractChips.tsx`) build no URLs — they navigate to
  the timeline, whose cards now render the linked CommitChip from the same payload-carried
  base; no second derivation exists anywhere.
- PR slot (AC4): `pr?: PrInfo | null` prop + `PrChip` renderer ship now and render nothing
  until story 12.2 populates them (styles included: navy outline, merged = filled navy).

### File List

- `src/shared/github.ts` (new) — githubWebBase / commitUrl / githubRepoSlug / shortSha
- `src/shared/github.test.ts` (new) — AC5 normalization matrix
- `src/core/github.ts` (new) — originRemote / remoteWebBase, per-repo session cache
- `src/core/github.test.ts` (new) — cache behavior, failure caching, nimbus real-vault gate
- `src/shared/types.ts` — ContractChange gains `commitBase: string | null`
- `src/core/contracts.ts` — readTimeline/timelineWithLinks accept the webBase resolver
- `src/core/contracts.test.ts` — commitBase default + injected-base assertions
- `src/core/handlers.ts` — contracts.timeline passes remoteWebBase
- `src/core/atlas.ts` — commitBaseOf/readOriginRemote deleted; shared normalizer + cached lookup
- `src/core/atlas.test.ts` — commitBaseOf test moved to shared/github.test.ts
- `src/renderer/src/components/CommitChip.tsx` (new) + `CommitChip.test.ts` (new)
- `src/renderer/src/markdown/shaLinks.ts` — remoteCommitBase deleted; commitUrl reused
- `src/renderer/src/markdown/shaLinks.test.ts` — derivation tests moved to shared
- `src/renderer/src/views/home/HomeView.tsx` — githubWebBase(identity.remote)
- `src/renderer/src/views/feed/FeedView.tsx` — CommitChip on every activity row
- `src/renderer/src/views/contracts/ContractTimeline.tsx` — CommitChip in card meta
- `src/renderer/src/views/contracts/contract-links.test.ts`, `diff-logic.test.ts` — fixture field
- `src/renderer/src/styles.css` — .commit-chip / .commit-pr styles; .feed-row cursor

## QA Results

### Review — QA agent (fresh eyes), 2026-07-10

**Verdict: PASS.** Suites: app vitest 488/488 (63 files, incl. the new `tests/m2-e2e-drive.test.ts` module drive), lib vitest 143/143, typecheck (node+web) clean, production build clean.

- One remote-URL derivation (`shared/github.ts`, unit-tested: ssh/https/`.git`-suffix normalization, non-GitHub → null); session-cached per repo core-side.
- Commit chips in rendered notes via the `shaLinks` markdown pipeline stage (`shaLinks.test.ts`) + `CommitChip.test.ts`; non-GitHub remotes degrade to mono text + copy-sha (m2 §6) — the same rule the Atlas commit row follows.
