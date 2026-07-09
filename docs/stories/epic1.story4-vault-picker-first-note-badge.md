# Story 1.4: Vault picker, first rendered note & identity badge

## Status

Done

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

- [x] Vault picker (AC: 1, 4)
  - [x] `src/main/dialogs.ts`: `dialog.showOpenDialog({ properties: ['openDirectory'] })` invoked from a menu item + empty-state button
  - [x] Persist the chosen path (simple JSON in `app.getPath('userData')`, written by main); pass it to the core host at fork time as the vault override for `initEngine`
  - [x] No directory reads before a vault is chosen; no reads outside it after
- [x] Minimal reader (AC: 2)
  - [x] `src/renderer/src/markdown/`: unified pipeline — `remark-parse` → `remark-gfm` → `remark-rehype` → `rehype-sanitize` → `rehype-react`
  - [x] `views/reader/NoteView.tsx`: fetch via `invoke('vault.readNote', {path})`, render body through the pipeline, frontmatter as a key/value metadata panel
  - [x] Hardcode/first-note selection is acceptable (full tree is Story 2.1); a simple path input or "open Start Here" button suffices
- [x] Identity badge (AC: 3)
  - [x] `components/IdentityBadge.tsx`: reads `invoke('app.identity')` → shows vault path (abbreviated), config source, remote URL (tooltip)
  - [x] Mount in the app shell chrome (sidebar vault chip per DESIGN.md) so every view includes it
- [x] App shell (AC: 2, 3)
  - [x] Minimal `App.tsx` layout: DESIGN.md three-pane shell (sidebar + list pane + reader); zustand stores for identity + current note

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

Claude Fable 5 (claude-fable-5), BMAD dev agent, 2026-07-10.

### Debug Log References

- `npm run typecheck` clean; `npm test` 24/24; `npm run build` green (see commit).

### Completion Notes List

- Vault picker: native `dialog.showOpenDialog(openDirectory)` in main (`dialogs.ts`), persisted to `userData/vault.json`; picked path crosses to the core host as `--vault <path>` at fork time and `initEngine(vaultOverride)` wins over any loredex config (F6: config still resolves exactly once per core-host lifetime — a vault change kills + re-forks the host and re-brokers ports, renderers get a `vault-changed` push after the new port).
- **Deviation:** badge reads a new app-local contract channel `app.identity` (returns `VaultIdentity` incl. `engineVersion` read from the embedded loredex package) instead of raw `config.get` — loredex `Config` carries no source/remote/engine-version. Same one-seam evolution pattern story 2.1 prescribes for `vault.tree`. Remote is a read-only peek at `<vault>/.git/config` (no git shell-out).
- **Deviation:** the picker + `vault-changed` push are main-owned native capabilities, exposed as two extra methods on the single `window.loredex` bridge global (`pickVault`, `onVaultChanged`) — not core-seam channels, since the dialog and bootstrap persistence live in main per this story's dev notes. No new bridge global.
- **Deviation (DESIGN.md):** badge implemented as the DESIGN.md sidebar vault-identity chip (name 13/600, path + engine version 11px mono, ink sync dot, full identity tooltip via shared `formatVaultIdentity`) rather than a "top bar" — DESIGN.md is binding over the story sketch. Sidebar nav shows only the implemented Reader view (Home/Inbox/Search/Activity arrive with their epics; dead nav would violate lazy-minimal). Cmd+K palette deferred to story 2.4 (search); Open Vault has menu item + Cmd+O.
- Release-time TODO: `loredex` is a `file:../loredex` link (local npm pkg pattern proven by loredex-obsidian), NOT the pinned npm version — swap to the exact npm pin before release.
- New exact-pinned deps: unified@11.0.5, remark-parse@11.0.0, remark-gfm@4.0.1, remark-rehype@11.1.2, rehype-sanitize@6.0.0, rehype-react@8.0.0, unist-util-visit@5.0.0, zustand@5.0.8.

### File List

- `src/main/dialogs.ts` (new), `src/main/index.ts`, `src/main/windows.ts` (hiddenInset + sidebar vibrancy + external-link guard)
- `src/core/engine.ts` (identity/engineVersion/remote, configSource), `src/core/handlers.ts`, `src/core/index.ts` (`--vault` argv)
- `src/shared/types.ts` (`VaultIdentity`), `src/shared/ipc-contract.ts` (`app.identity`), `src/shared/identity.ts` (new) + `identity.test.ts`
- `src/preload/index.ts` (pickVault/onVaultChanged), `src/renderer/src/api.ts`
- `src/renderer/src/markdown/pipeline.ts` (new) + `pipeline.test.ts`, `src/renderer/src/stores/app.ts`, `src/renderer/src/stores/reader.ts`, `src/renderer/src/components/IdentityBadge.tsx`, `src/renderer/src/views/reader/NoteView.tsx`, `src/renderer/src/App.tsx`, `src/renderer/src/styles.css`, `src/renderer/src/main.tsx`
- `package.json` / `package-lock.json`

## QA Results

**Verdict: PASS** — Evidence base (QA pass 2026-07-10, fresh-eyes BMAD QA agent): app vitest 118/118 (23 files), lib vitest 115/115, `npm run typecheck` clean, `npm run build` clean, time-boxed `npm run dev` smoke (alive 3+ min, clean exit), and an M1-DoD driver that exercised the core-host modules directly against the real nimbus simulation vault (tree/readNote/resolveLink/search/handoffs/homeBrief/syncStatus/activity).

- AC1: code-verified, not UI-verified — native `dialog.showOpenDialog` in main (`src/main/dialogs.ts`), persisted to `userData/vault.json`, re-forked host with `--vault`. Runtime evidence the persisted choice works: the dev smoke's MCP identity echo reported `source: vault-picker` against the previously-picked nimbus vault.
- AC2: verified — reader renders frontmatter panel + body via the sanctioned pipeline (pipeline tests; M1 driver parsed a real note).
- AC3: verified — vault identity chip is permanent at the sidebar bottom (`IdentityBadge` rendered unconditionally in `App.tsx`), shows name/path/engine/config source, full identity in tooltip; matches DESIGN.md.
- AC4: code-verified — the only directory walk (`walkVault`) roots at the chosen vault; no cold scans found.
