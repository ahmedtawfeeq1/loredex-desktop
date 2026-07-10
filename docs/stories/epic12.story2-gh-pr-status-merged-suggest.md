# Story 12.2: gh-powered PR status & merged→suggest-status toast

## Status

Approved

## Story

**As a** sender,
**I want** PR state on commit chips and a one-click suggestion when a merged PR references my handoff,
**so that** "the work landed" and "the handoff says so" stop drifting apart — without the app ever writing status silently.

## Acceptance Criteria

1. gh capability is feature-detected once at core-host startup (`gh --version` && `gh auth status` exit 0 → `gh: true`, cached in app-db `meta`, re-checked on settings change); without gh, degradation is graceful — plain commit links, PR chips absent, Settings shows "install gh for PR chips". No REST fallback, no tokens, no OAuth.
2. With gh, `github.prForCommit {repoRoot, sha}` runs `gh pr list --repo <o/r> --search <sha> --state all --json number,title,state,mergedAt,url` (5 s timeout, per-sha session cache) and the CommitChip PR slot renders number/title/state (merged state visually distinct).
3. When a merged PR (or `mentioned`-tier commit) references an `open`/`accepted` handoff owned by the current identity's project, core emits `suggest.statusChange {handoffId, suggested: 'consumed'|'accepted', evidence: {sha, prUrl?}}`.
4. The renderer shows a DESIGN-spec toast with one-click **Apply** → an ordinary `handoffs.setStatus` invoke (write lock, attributed, committed) — silent auto-transitions are a bug, categorically; Dismiss persists as `app_settings key='dismissed:<handoffId>:<sha>'` and the suggestion never re-fires.
5. Unit tests cover capability detection/degradation, gh output parsing + timeout, suggestion trigger matrix (tier × status × ownership × dismissed), and that no code path writes status without a user action.

## Tasks / Subtasks

- [ ] Capability + lookup (AC: 1, 2)
  - [ ] `src/core/github.ts`: detect + cache `gh` capability; `prForCommit` exec with timeout + session cache; register the channel; CommitChip PR rendering; Settings hint row
- [ ] Suggest pipeline (AC: 3, 4)
  - [ ] Evaluate on poller integrate + contract scan: merged PR / mentioned commit ↔ open|accepted handoffs owned by my project; check dismissals; emit `suggest.statusChange`
  - [ ] `SuggestToast.tsx`: evidence line (sha/PR), Apply → `handoffs.setStatus`, Dismiss → persist dismissal
- [ ] Tests (AC: 5)

## Dev Notes

- The categorical rule: PR-merged SUGGESTS, never auto-writes. Apply is an ordinary attributed transition through the write lock — the suggestion pipeline owns zero write paths. [Source: architecture-m2.md#6-github-layer]
- Only `mentioned`-tier links feed suggestions (Story 11.3 guardrail); heuristic-tier is display-only. [Source: architecture-m2.md#5-contract-intelligence]
- gh CLI is the only network path this cycle; command shape, timeout, and caching are specified verbatim. Capability lives in app-db `meta`; dismissals in `app_settings`. [Source: architecture-m2.md#6-github-layer] [Source: architecture-m2.md#3-app-db]
- Channel: `github.prForCommit {repoRoot, sha}` → `{url, number, title, state, mergedAt} | null`; event: `suggest.statusChange`. [Source: architecture-m2.md#8-ipc-additions]
- Toast spec: bottom-right card, receipt-style, mono details, auto-dismiss 5s — but a suggestion toast should persist until acted on or dismissed (deviation already implied by Dismiss semantics; record it). [Source: DESIGN.md#layout]
- Depends on Stories 12.1 (chips/base URLs), 11.3 (mentioned tier), 8.1 (`handoffs.setStatus`), 9.2 (meta/app_settings). Files: `src/core/github.ts`, `src/renderer/src/components/CommitChip.tsx`, `SuggestToast.tsx`, `src/shared/ipc-contract.ts`, `src/core/ipc.ts`, Settings row.

### Testing

- Unit: detection matrix (no gh / gh unauth / gh ok), parse + timeout fallback, suggestion trigger table incl. dismissed and not-my-project negatives, Apply payload correctness. Integration: fixture with a merged-PR-referencing handoff → toast → Apply → frontmatter transition via lib. [Source: architecture-m2.md#6-github-layer]

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
