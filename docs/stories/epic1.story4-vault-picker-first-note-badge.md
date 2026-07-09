# Story 1.4: Vault picker, first rendered note & identity badge

## Status

Approved

## Story

**As a** user,
**I want** to open my vault and read a rendered note with an always-visible vault identity badge,
**so that** I can verify the app serves the vault I chose.

## Acceptance Criteria

1. "Open Vault" uses the native open panel (main process) so folder access is granted without extra TCC prompts; the choice persists across restarts.
2. A selected markdown note renders (frontmatter panel + body) in a minimal reader view.
3. A persistent chrome badge shows vault path, config source, and remote, visible in every view (FR14).
4. The app never cold-scans directories outside the selected vault.

## Tasks / Subtasks

- [ ] Vault picker (AC: 1, 4)
  - [ ] `src/main/dialogs.ts`: `dialog.showOpenDialog({ properties: ['openDirectory'] })` invoked from a menu item + empty-state button
  - [ ] Persist the chosen path (simple JSON in `app.getPath('userData')`, written by main); pass it to the core host at fork time as the vault override for `initEngine`
  - [ ] No directory reads before a vault is chosen; no reads outside it after
- [ ] Minimal reader (AC: 2)
  - [ ] `src/renderer/src/markdown/`: unified pipeline — `remark-parse` → `remark-gfm` → `remark-rehype` → `rehype-sanitize` → `rehype-react`
  - [ ] `views/reader/NoteView.tsx`: fetch via `invoke('vault.readNote', {path})`, render body through the pipeline, frontmatter as a key/value metadata panel
  - [ ] Hardcode/first-note selection is acceptable (full tree is Story 2.1); a simple path input or "open Start Here" button suffices
- [ ] Identity badge (AC: 3)
  - [ ] `components/IdentityBadge.tsx`: reads `invoke('config.get')` → shows vault path (abbreviated), config source, remote URL
  - [ ] Mount in the app shell chrome (top bar) so every view includes it
- [ ] App shell (AC: 2, 3)
  - [ ] Minimal `App.tsx` layout: top chrome (badge) + content area; zustand store for `config` + current note

## Dev Notes

- This is the Epic-1 canary: app boots, opens a vault, renders one note — BMAD's walking-skeleton rule. Keep it minimal; Epic 2 replaces the reader internals.
- TCC rule: folder access ONLY via the native open panel; never cold-scan, never request Full Disk Access. Picker lives in main (native dialog), the path crosses to the core host at fork/init. [Source: architecture.md#process-model] [Source: architecture.md#distribution-constraints-dev-relevant]
- The unified pipeline built here is THE sanctioned markdown path for the whole app — put it in `src/renderer/src/markdown/` for reuse; `rehype-sanitize` is mandatory. [Source: architecture.md#tech-stack] [Source: architecture.md#coding-standards]
- Badge data comes from `config.get` (Story 1.3); the same identity strings will later be echoed by MCP responses (Story 1.6) — export a small `formatVaultIdentity(config)` helper in `src/shared/` so both use it. [Source: architecture.md#mcp-hosting--discovery]
- Persisting the vault choice in main-owned JSON is acceptable main-process state (not business logic — window/bootstrap config). Read-state and prefs later move to `app.db` (Story 3.6); do not build a prefs system here.
- Files: `src/main/dialogs.ts`, `src/main/index.ts` (menu + fork arg), `src/renderer/src/markdown/*`, `src/renderer/src/views/reader/NoteView.tsx`, `src/renderer/src/components/IdentityBadge.tsx`, `src/renderer/src/App.tsx`. [Source: architecture.md#source-tree]

### Testing

- Unit: markdown pipeline renders GFM + sanitizes script injection; `formatVaultIdentity` formatting. [Source: architecture.md#testing-strategy]
- Manual demo check (M0 demo path): fresh launch → pick fixture vault → note renders → badge shows the right vault.

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-09 | 0.1 | Drafted from PRD Epic 1 | Bob (SM) |
| 2026-07-09 | 1.0 | Approved | Sarah (PO) |

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## QA Results
