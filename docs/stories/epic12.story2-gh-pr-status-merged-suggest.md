# Story 12.2: gh-powered PR status & merged→suggest-status toast

## Status

Done

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

- [x] Capability + lookup (AC: 1, 2)
  - [x] `src/core/github.ts`: detect + cache `gh` capability; `prForCommit` exec with timeout + session cache; register the channel; CommitChip PR rendering; Settings hint row
- [x] Suggest pipeline (AC: 3, 4)
  - [x] Evaluate on poller integrate + contract scan: merged PR / mentioned commit ↔ open|accepted handoffs owned by my project; check dismissals; emit `suggest.statusChange`
  - [x] `SuggestToast.tsx`: evidence line (sha/PR), Apply → `handoffs.setStatus`, Dismiss → persist dismissal
- [x] Tests (AC: 5)

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

Claude Fable 5 (claude-fable-5)

### Debug Log References

- `npx tsc --noEmit` (both projects), `npx vitest run` → 58 files / 442 tests green,
  `npm run build` green.
- Real-path smoke on this machine: `gh auth status` → logged in; the exact decided command
  (`gh pr list --repo ahmedtawfeeq1/nimbus --search <HEAD sha> --state all --json
  number,title,state,mergedAt,url`) runs clean and returns `[]` → parsePrList → null →
  plain-link degradation (the sim repo has no PRs; both gh-present and gh-absent paths are
  additionally unit-tested with stubbed exec).

### Completion Notes List

- **Apply routing deviation (AC4 wording)**: the lib's `HandoffTransition` union has no
  `consumed` arm (consume is its own writer, m2 §2 verbatim) — Apply for `suggested:
  'consumed'` rides the ordinary `handoffs.consume` channel; `'accepted'` rides
  `handoffs.setStatus`. Both are the same guarantees the AC wants: user click → write lock →
  attributed lib write → commit/push. Pure `applyChannel()` unit-tests the routing.
- **Toast persistence deviation (sanctioned by the story)**: suggestion toasts persist until
  Apply/Dismiss (own `SuggestToastStack`, stacked above the 5 s receipt stack, gold left
  rail). Receipt toasts after Apply still auto-dismiss per DESIGN.
- **Suggestion matrix, decided**: merged PR → suggest `consumed` (open→consumed stays the
  legal skip-accept path); mentioned commit without a merged PR → suggest `accepted`, only
  from `open`. Ownership = handoff's TO project ∈ registered projects (recipient
  transitions); zero registered projects = every project mine (story 3.7 notifier rule).
  Only `mentioned` tier enters (heuristic filtered by type, story 11.3 guardrail).
- **Session dedupe**: a suggestion fires once per core-host lifetime (in-memory key set)
  even when not dismissed — rescans must not re-toast; Dismiss additionally persists
  (`app_settings dismissed:<handoffId>:<sha>`) and never re-fires across restarts.
- **No-write guarantee is tested two ways**: the pipeline's dependency surface contains no
  writer (compile-time impossibility), plus a source-scan test pins `core/github.ts` to
  never import `./engine`, `./write-lock`, or `loredex`.
- **App-local contract evolution (recorded)**: `github.capability {refresh?}` (Settings hint
  + the m2 "re-checked on settings change" path) and `suggest.dismiss` (persisting a
  dismissal is a renderer-initiated app-db write, so it needs a channel). Apply is
  deliberately NOT a channel.
- **PR lookups are armed only on contract-timeline chips** (repoRoot prop): a 200-row
  activity feed would otherwise fan out up to 200 gh executions; feed/home chips stay
  link-only. The renderer memoizes per repoRoot:sha on top of the core session cache.
- `github.prForCommit` guards repoRoot to registered roots + the vault path (same rule as
  contracts.diff: gh/git only run where the user pointed the app).
- gh capability: startup probe is async; until it lands, `ghCapability()` answers from the
  app-db meta cache of the previous run (false on first ever run) — never a guess, never a
  block.

### File List

- `src/core/github.ts` — gh detection/capability (meta-cached), prListArgs/parsePrList,
  prForCommit (5 s timeout, per-sha session cache), evaluateSuggestions +
  suggestFromFreshChanges (emit-only pipeline), dismissKey
- `src/core/github.test.ts` — detection matrix, parse/timeout/cache, trigger matrix,
  no-write guarantees, real-vault gate
- `src/core/handlers.ts` — runSuggestionScan glue; channels github.prForCommit /
  github.capability / suggest.dismiss; timeline scan feeds suggestions
- `src/core/index.ts` — startup `initGhCapability`; post-integrate scan feeds suggestions
- `src/shared/types.ts` — `PrInfo`
- `src/shared/ipc-contract.ts` — the two channels + `suggest.dismiss` + the
  `suggest.statusChange` CoreEvent
- `src/renderer/src/components/CommitChip.tsx` — PR slot self-loads via repoRoot (memoized)
- `src/renderer/src/components/SuggestToast.tsx` (new) — persistent suggestion stack
- `src/renderer/src/stores/suggests.ts` (new) + `suggests.test.ts` (new) — event intake,
  Apply/Dismiss, applyChannel routing
- `src/renderer/src/views/settings/GitHubSection.tsx` (new) + `SettingsView.tsx` — the
  "install gh for PR chips" hint + re-check
- `src/renderer/src/views/contracts/ContractTimeline.tsx` — repoRoot arms the PR lookup
- `src/renderer/src/App.tsx` — SuggestToastStack mount + vault-change reset
- `src/renderer/src/styles.css` — suggest-stack/toast/actions styles

## QA Results

### Review — QA agent (fresh eyes), 2026-07-10

**Verdict: PASS.** Suites: app vitest 488/488 (63 files, incl. the new `tests/m2-e2e-drive.test.ts` module drive), lib vitest 143/143, typecheck (node+web) clean, production build clean.

- gh CLI only, no OAuth: capability probed once at startup and cached in app-db meta (`initGhCapability`), Settings re-checks with `{refresh}`; absent gh degrades to plain links (`github.test.ts`).
- PR lookup 5s-timeout + per-sha session cache; merged→suggest pipeline (`suggests.test.ts`) SUGGESTS only — never writes; SuggestToast wired app-root; dismissals persisted per vault (`suggest.dismiss`).
