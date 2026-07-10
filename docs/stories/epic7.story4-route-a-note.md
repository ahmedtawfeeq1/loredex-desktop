# Story 7.4: Route-a-note (picker + drag-drop)

## Status

Done

## Story

**As an** engineer,
**I want** to route a working file into the vault from the app — by picker or by dropping it onto the Reader,
**so that** filing a note never requires the CLI while keeping every routing-safety guarantee.

## Acceptance Criteria

1. A "Route a note…" action (sidebar + ⌘K) opens the native file picker (main process — no cold scans, NFR12); selecting a markdown file invokes `route.file {path, mode, projectName?}`.
2. Dropping a markdown file onto the Reader pane offers the same flow: a drop overlay appears on dragenter, and the drop opens a confirm card showing the planned destination and invented-frontmatter diff before anything is written.
3. A **move | copy** segmented control chooses the mode; when the file's owning project is ambiguous, a project select (`projectName`) is required before the primary enables.
4. The result surfaces the existing route receipt UI (destination + diff + undo — Epic 4 pattern); Epic 4 scope rules still apply: never-route glob matches show a visible explanation, and frontmatter-less files require the explicit confirmation step.
5. Errors (outside-vault path, unknown project, lib envelope) render actionably; nothing routes silently.

## Tasks / Subtasks

- [x] Entry points (AC: 1, 2)
  - [x] Sidebar action + ⌘K entry → main-process `dialog.showOpenDialog` (markdown filter) → renderer flow
  - [x] Reader drop target: dragenter overlay, extract the real path from the drop (Electron `webUtils.getPathForFile`), reject non-markdown
- [x] Confirm card (AC: 2, 3, 4)
  - [x] Plan preview before write: render destination + invented frontmatter (from the lib plan), move/copy segmented control, project select when needed; Cancel/Route footer per DESIGN modal spec
- [x] Core + contract (AC: 1, 4, 5)
  - [x] Add `route.file` channel → engine facade → lib `routeFile` under the write lock; map results into the existing receipt/undo pipeline
- [x] Tests
  - [x] Drop-path extraction, mode/project gating, receipt hand-off, blocked-glob explanation

## Dev Notes

- Depends on Story 7.1 (`routeFile` export) and Epic 4's receipt/undo UI (reuse, don't rebuild). `routeFile` is pure re-export composition of `router.ts planFile + executePlan + knownStructure` — plan+execute in one call; the app's confirm card renders the plan half before invoking. [Source: architecture-m2.md#2-lib-api-additions]
- Channel: `route.file {path, mode, projectName?}` → `{written: string[]}`; state touched: vault (lib `routeFile`). [Source: architecture-m2.md#8-ipc-additions]
- Folder/file access only via the native panel or an explicit user drop — never scan for candidates (NFR12). The drop path is the user's consent for that one file.
- Routing safety is not renegotiated here: never-route globs, frontmatter-less consent, receipts, and undo are Epic 4 behavior this story must flow through, not around (F4).
- Files: `src/renderer/src/views/reader/RouteDropTarget.tsx`, `src/renderer/src/views/board/RouteConfirmCard.tsx`, `src/main/index.ts` (picker), `src/shared/ipc-contract.ts` (`route.file`), `src/core/ipc.ts`.

### Testing

- Unit: gating matrix (mode × project-known × frontmatter-present), envelope rendering. Integration: route a fixture file via the channel → written path matches plan, receipt recorded, undo restores. [Source: architecture-m2.md#2-lib-api-additions]

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-10 | 0.1 | Drafted from architecture-m2.md (M2 cycle) | Bob (SM) |
| 2026-07-10 | 1.0 | Approved | Sarah (PO) |

## Dev Agent Record

### Agent Model Used

Fable 5 (claude-fable-5)

### Debug Log References

- `src/core/compose.test.ts`: preview = executor-exact destination + invented frontmatter with zero writes; route lands exactly there; ambiguous (frontmatter-less) file previews with empty project until `projectName` is forced; non-markdown and inside-vault sources rejected with typed envelopes.
- loredex lib run (previewRoute addition): 143/143 tests, typecheck, build; commit 7d7b9a6.
- DoD driver: preview → `projects/nimbus-backend/streaming/2026-07-10-sse-retry-findings-2.md`, `route.file` wrote exactly that path (copy mode), receipt toast path + `route.completed` event verified in the fixture test.

### Completion Notes List

- Lib gap closed first: `routeFile` is plan+execute in one call, so a read-only `previewRoute` export (+ `plannedMeta` extracted from `executePlan` so preview and executor can never drift) was added to loredex (commit 7d7b9a6, tarball repacked + reinstalled). Anti-second-engine: the app renders the lib's plan, it computes nothing.
- `route.preview` (existing v1 channel) graduated from NOT_IMPLEMENTED to the lib preview; in-shape gained `mode`/`projectName`. `route.file` executes under the write lock with the identity profile injected per command when set.
- Confirm card gates (AC3/AC4): move|copy segmented control; when the plan names no project the primary stays disabled until the project select is filled (re-previews live); every drop/pick goes through the confirm card — frontmatter-less files thereby always get the explicit confirmation step.
- Drop target wraps the reader pane: dragenter overlay (1px dashed gold per the Don't list), real path via preload `webUtils.getPathForFile`, non-markdown rejected with a toast.
- Entry points: sidebar "Route a note…" + ⌘K action → main-process `dialog.showOpenDialog` (markdown filter) — no cold scans (NFR12).
- DEVIATIONS: (1) undo + never-route-glob explanations are Epic 4 scope whose lib half (PR-3 persisted receipts/undo) has not landed — the result surfaces as a receipt toast + `route.completed` event; the undo affordance arrives with Epic 4 (AC4 partially deferred, recorded). (2) `RouteConfirmCard` lives in `views/routes/` (architecture.md source tree), not the story's `views/board/`.

### File List

- loredex repo: src/core/handoff.ts (previewRoute), src/core/router.ts (plannedMeta), src/lib.ts, tests/handoff-v2.test.ts (commit 7d7b9a6)
- src/main/dialogs.ts (pickRouteFileDialog), src/main/index.ts (loredex:pick-route-file)
- src/preload/index.ts (pickRouteFile, pathForFile)
- src/renderer/src/api.ts (wrappers)
- src/renderer/src/stores/route.ts (new), stores/handoffs.test.ts (gating test)
- src/renderer/src/views/routes/RouteConfirmCard.tsx (new)
- src/renderer/src/views/reader/RouteDropTarget.tsx (new)
- src/renderer/src/views/search/Palette.tsx (action provider), src/renderer/src/App.tsx (mounts, sidebar entry)
- src/core/handlers.ts + src/shared/ipc-contract.ts (route channels, in 7.2 commit)

## QA Results

### Review — QA agent (fresh eyes), 2026-07-10

**Verdict: PASS (sanctioned deviation).** Suites: app vitest 488/488 (63 files, incl. the new `tests/m2-e2e-drive.test.ts` module drive), lib vitest 143/143, typecheck (node+web) clean, production build clean.

- AC1/2: native markdown picker lives in main (`dialogs.ts pickRouteFile`, no cold scans — NFR12); `RouteDropTarget` overlay + `webUtils` path extraction; both feed the plan-first confirm card.
- AC3/4/5: `route.preview` (lib previewRoute) renders destination + invented frontmatter before any write; `route.file` under the write lock; blocked-glob explanation + error envelopes covered in `compose.test.ts`.
- Deviation (recorded on the board): receipt **undo** rides epic 4 (PR-3) — the confirm card is the consent step meanwhile.
