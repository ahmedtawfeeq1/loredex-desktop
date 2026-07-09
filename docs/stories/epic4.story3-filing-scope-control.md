# Story 4.3: Filing scope control

## Status

Approved

## Story

**As an** integrations engineer,
**I want** never-route globs and a consent step for frontmatter-less files,
**so that** internal scratch files can't be silently published (F4).

## Acceptance Criteria

1. Never-route globs are configurable per project, persisted via the lib's config (`saveConfig`) so the CLI honors them too.
2. Routing any frontmatter-less file requires explicit confirmation that shows the invented frontmatter before anything is written.
3. A blocked route (never-route match) shows a visible explanation — never a silent skip.

## Tasks / Subtasks

- [ ] Glob storage (AC: 1)
  - [ ] Persist never-route globs per project through the engine facade using `saveConfig` (shared config = CLI-honored); settings UI `views/routes/ScopeSettings.tsx`: per-project glob list editor with add/remove + validation
  - [ ] If the pinned loredex config schema lacks a field for this, coordinate: add the field in a small loredex patch PR (config schema is lib-owned) — do NOT invent an app-local config file for a team-visible routing rule
- [ ] Consent step (AC: 2)
  - [ ] In the app's route flow (Story 4.2): `route.preview` first; if the source has no frontmatter, show a confirmation dialog rendering the invented-frontmatter diff; only on confirm call apply
  - [ ] Watcher-triggered auto-routes of frontmatter-less files are held in a pending state (queued card in the routes view) instead of auto-applied
- [ ] Blocked visibility (AC: 3)
  - [ ] Never-route match → route attempt short-circuits with an explanation card naming the matching glob; log to the routes history as `blocked`

## Dev Notes

- The evidence: F4's worst moment was `FINDINGS.md` silently published company-wide with invented, wrong metadata — the fix is consent (frontmatter-less confirm) + policy (globs). Both must be impossible to bypass from the app's flows.
- Storage decision matters: never-route globs are team-visible routing policy → they belong in shared lib config (`saveConfig`), not `app.db` (state-placement rule: nothing the team needs to see lives only in app.db). [Source: architecture.md#state-placement]
- Plan/apply separation (PR-3) is what makes the consent step possible — preview is side-effect-free by contract. [Source: architecture.md#loredex-library-surface]
- Interaction with CLI: CLI routes honoring the globs depends on the lib reading the config field; if a lib patch is needed (task above), it's a one-field schema addition + honor check, sized well inside this story.
- Files: `src/renderer/src/views/routes/ScopeSettings.tsx`, `src/core/engine.ts` (config read/write passthrough), `src/core/ipc.ts` (pending-route queue state), plus the possible small loredex patch. [Source: architecture.md#source-tree]

### Testing

- Unit: glob matching (minimatch semantics — same library as the lib uses), pending-queue transitions, blocked-explanation payload. Integration: frontmatter-less fixture file → held → confirm → routed; glob-matched file → blocked with named glob. [Source: architecture.md#testing-strategy]

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-09 | 0.1 | Drafted from PRD Epic 4 | Bob (SM) |
| 2026-07-09 | 1.0 | Approved | Sarah (PO) |

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## QA Results
