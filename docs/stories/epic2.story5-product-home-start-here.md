# Story 2.5: Product home — rendered Start Here

## Status

Approved

## Story

**As a** PM,
**I want** the Start Here brief as the app home with linked SHAs, freshness, and one-click re-curate,
**so that** the daily product picture needs no terminal (F5/F9).

## Acceptance Criteria

1. The home view renders the product brief via `buildDashboard`/`renderDashboardMarkdown`.
2. Commit SHAs in the brief render as hyperlinks to the owning remote.
3. A freshness badge shows the brief's age (last curate time).
4. One-click re-curate invokes `dashboard.build` in the core host; the UI stays responsive through a 40–60 s curate, with progress and failure surfaced.
5. Wikilinks inside the brief resolve per Story 2.2.

## Tasks / Subtasks

- [ ] Home data (AC: 1, 3)
  - [ ] Register `dashboard.build` handler → `buildDashboard()` (write lock respected once Story 3.5 lands; until then direct) returning `ProductDashboard`
  - [ ] Read path: render the existing brief note (`PRODUCT_BRIEF_NAME` locates it) through the markdown pipeline; freshness = brief file mtime / dashboard metadata, shown as a relative-age badge with a stale threshold style
- [ ] SHA hyperlinks (AC: 2)
  - [ ] Remark/rehype plugin `markdown/shaLinks.ts`: detect 7–40 char hex tokens in brief content, wrap as links to `<remote>/commit/<sha>` using the remote from `config.get`; unresolvable remote → plain code style, no dead links
- [ ] Re-curate (AC: 4)
  - [ ] Home button → `invoke('dashboard.build')`; run in the core host without blocking other handlers (async path); renderer shows an in-progress state on the freshness badge; failure → error toast + `git.warning`-style detail
- [ ] Brief wikilinks (AC: 5)
  - [ ] Ensure the home view uses the same markdown pipeline instance so `WikiLink` components resolve inside the brief

## Dev Notes

- `buildDashboard`, `renderDashboardMarkdown`, and `PRODUCT_BRIEF_NAME` are published lib exports — use them as-is; the brief regeneration writes vault files, which is fine because it IS the lib. [Source: architecture.md#loredex-library-surface]
- Curate can take 40–60 s (F5) — that's precisely why it lives in the core host, never main/renderer. Do not add a renderer-side timeout shorter than ~120 s for this channel. [Source: architecture.md#process-model]
- SHA links: BUILD-PLAN feature 3 wants SHAs hyperlinked; full commit *verification* (chips, existence checks) is M2 feature 20 — here it's plain link construction, no GitHub API calls.
- The "changed since last brief" diff is Story 2.6 — but this story must record the hook: after a successful `dashboard.build`, notify `watcher.ts` so 2.6 can write its snapshot (leave a callback point, do not implement snapshots).
- Home is the app's default view once a vault is open (replace the Story 1.4 placeholder default).
- Files: `src/core/ipc.ts` (register `dashboard.build`), `src/renderer/src/views/home/HomeView.tsx`, `src/renderer/src/markdown/shaLinks.ts`, `src/renderer/src/stores/home.ts`. [Source: architecture.md#source-tree]

### Testing

- Unit: SHA detection (hex-length boundaries, false positives like plain words), freshness formatting, failure envelope rendering. Manual: re-curate on the fixture vault stays responsive. [Source: architecture.md#testing-strategy]

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-09 | 0.1 | Drafted from PRD Epic 2 | Bob (SM) |
| 2026-07-09 | 1.0 | Approved | Sarah (PO) |

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## QA Results
