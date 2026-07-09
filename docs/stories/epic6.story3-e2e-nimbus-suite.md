# Story 6.3: E2E Nimbus reproduction suite

## Status

Approved

## Story

**As the** maintainer,
**I want** the Nimbus friction reproductions automated end-to-end,
**so that** M1's Definition of Done is executable, not ceremonial.

## Acceptance Criteria

1. A Playwright-for-Electron suite scripts the F1, F4, F6, F7, F8, and F9 reproduction steps from the simulation against a fixture vault; each reproduction must FAIL to reproduce.
2. The suite includes the wizard join flow and an update-check smoke.
3. It runs nightly and on every release, and is documented in the README/CI docs.
4. The full simulation re-run passes with zero Obsidian installs and zero terminal commands for reading/consuming.

## Tasks / Subtasks

- [ ] Harness (AC: 1)
  - [ ] `tests/e2e/`: Playwright `_electron.launch` against the packaged (or dev-built) app with an isolated userData dir and a Nimbus-shaped fixture vault (multi-project, cross-project handoffs, a routed-note history, a second clone for remote scenarios)
- [ ] F-reproduction specs (AC: 1) — each spec asserts the friction CANNOT happen:
  - [ ] F1: send a handoff from the CLI in clone A → clone B's app shows notification + inbox card; consume in B → A's app shows who/when in outbox within cadence (assert sender is NOT blind)
  - [ ] F4: route a file twice (watcher/manual race simulation) → receipt + dedupe merge offered, indexes never hand-edited; undo restores state (assert no silent damage)
  - [ ] F6: query the in-app MCP endpoint via `loredex mcp --via-desktop` while reading the UI badge → same vault identity in both (assert no split-brain)
  - [ ] F7: join a second instance from a generated link → working board, zero terminal (assert onboarding works)
  - [ ] F8: corrupt the gitattributes pattern in the fixture → sync panel shows the merge-driver warning loudly (assert no silent git failure)
  - [ ] F9: open a note with cross-project wikilinks → click-through resolves; ambiguous link shows the picker (assert no filesystem archaeology)
- [ ] Flows (AC: 2)
  - [ ] Wizard join spec (reuses F7), update-check smoke (Story 1.9's spec moved/confirmed here)
- [ ] CI wiring + docs (AC: 3, 4)
  - [ ] Nightly schedule + release-workflow gate in `.github/workflows/`; README testing section documents how to run locally; the M1 DoD statement ("simulation re-run, zero Obsidian, zero read/consume terminal commands") asserted by the combined suite passing

## Dev Notes

- This story IS the M1 Definition of Done — the BUILD-PLAN made the DoD executable by design; the suite's backbone is the automated F-reproductions. [Source: architecture.md#testing-strategy]
- Reproduction sources: the friction steps live in `loredex-simulation/SIMULATION-REPORT.md` (F1–F10) — script F1/F4/F6/F7/F8/F9 (the M1 set; F2/F3/F5/F10 belong to M2/M3 features).
- Two-clone scenarios need a local bare repo as the "remote" — no network, no GitHub dependency in CI.
- Keep specs independent (fresh fixture per spec via snapshot copy) so nightly failures localize.
- The suite exercises real timing (poller cadence): make cadence configurable via env for tests (e.g. `LOREDEX_POLL_MS`) — add that hook to `src/core/poller.ts` if Story 3.5 didn't; a test-only env knob is not a product feature.
- Files: `tests/e2e/*.spec.ts`, `tests/fixtures/` (Nimbus-shaped vault + clones), `.github/workflows/ci.yml`/`release.yml` (nightly + gate), `README.md`. [Source: architecture.md#source-tree]

### Testing

- This story is testing; its own quality bar: suite green twice consecutively on CI (flake check), total runtime budgeted ≤ 15 min nightly. [Source: architecture.md#testing-strategy]

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-09 | 0.1 | Drafted from PRD Epic 6 | Bob (SM) |
| 2026-07-09 | 1.0 | Approved | Sarah (PO) |

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## QA Results
