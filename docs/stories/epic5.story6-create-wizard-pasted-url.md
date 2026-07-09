# Story 5.6: Create wizard (pasted repo URL)

## Status

Approved

## Story

**As a** DevOps admin,
**I want** to create a vault and connect an existing GitHub repo in one flow,
**so that** team setup replaces the manual bare-repo dance (F7, FR11).

## Acceptance Criteria

1. Create scaffolds a vault via the lib (`scaffoldVault` + registry init from PR-7a).
2. The flow connects an existing GitHub repo by pasted URL, sets the canonical branch, and performs the initial push.
3. It ends by generating the shareable join link/deep link.
4. No OAuth anywhere (11b is M2).
5. Errors (non-empty repo, auth failure, branch mismatch) surface actionable messages.

## Tasks / Subtasks

- [ ] Create flow (AC: 1, 2)
  - [ ] `views/wizard/CreateWizard.tsx` stepping: vault location (native picker) → team/vault name → paste repo URL + canonical branch choice → create
  - [ ] Core-side (the `vault.createOrJoin` create arm): `scaffoldVault` (writes initial registry per PR-7a) → `git init` on the link branch → `git remote add origin <url>` → initial commit (identity `-c` injected) → `git push -u origin <branch>` — all async, under the write lock
- [ ] Join link generation (AC: 3)
  - [ ] On success, encode `{remote, branch, registry}` with `src/shared/join-link.ts` (Story 5.5 codec); show as copyable `loredex://join?...` + plain-URL fallback text for chat pasting
- [ ] Guardrails (AC: 4, 5)
  - [ ] Preflight the pasted remote: `git ls-remote` — unreachable → actionable auth/URL message; non-empty repo → warn and require explicit confirmation (or a different repo); branch already exists remotely with different history → abort with explanation
  - [ ] No OAuth code paths, no token storage — pasted URL relies on ambient git credentials for the push (documented in the wizard UI)
- [ ] Post-create pivot (AC: 1)
  - [ ] Same respawn-pivot as join (Story 5.5): core host restarts on the new vault; home/board live

## Dev Notes

- Scope honesty: this is 11a — the create path WITHOUT GitHub repo creation. OAuth device flow is M2 feature 11b, gated on a research spike; do not scaffold auth code "for later". [Source: architecture.md#overview]
- Vault scaffold + registry init are lib exports (`scaffoldVault`, PR-7a registry) — the app orchestrates, the lib writes. Git wiring (init/remote/push) is repo plumbing orchestrated by the core host with async helpers + `-c` identity. [Source: architecture.md#loredex-library-surface] [Source: architecture.md#git-strategy]
- The push uses ambient git credential helpers (osxkeychain) — acceptable for M1 because the DevOps persona doing create has working git creds; the wizard states this plainly ("uses your existing git credentials").
- Canonical branch is chosen HERE once and encoded in every join link — this is where the master/main class of failure dies (F7).
- Failure UX matters more than the happy path: each named failure (unreachable, non-empty, diverged branch, push rejected) needs its own message + recovery step; log full git output behind a details expander (F8: surface, don't swallow).
- Files: `src/renderer/src/views/wizard/CreateWizard.tsx`, `src/core/ipc.ts` (create arm), `src/core/git.ts` (preflight helpers), `src/shared/join-link.ts` (reuse). [Source: architecture.md#source-tree]

### Testing

- Unit: preflight decision matrix, link generation round-trip. Integration: create against a fixture bare repo → vault pushed, registry present, generated link joins successfully (chain with Story 5.5's flow — this pair is the M1 demo's first act). [Source: architecture.md#testing-strategy]

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-09 | 0.1 | Drafted from PRD Epic 5 | Bob (SM) |
| 2026-07-09 | 1.0 | Approved | Sarah (PO) |

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## QA Results
