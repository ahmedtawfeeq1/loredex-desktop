# Loredex Desktop v0.2 (M2 cycle) — Status

QA pass: 2026-07-10 (fresh-eyes BMAD QA agent). Per-story verdicts live in each story file's
QA Results section (`docs/stories/`); the board is `docs/stories/sprint-status.yaml`.
Scope of this pass: everything marked Done in the M2 cycle — epics 7–14 plus the in-place
v2.0 upgrades of stories 2.3 / 3.5 / 3.6 (delivered as epic 9).

## Evidence base

- **App suite:** vitest 488/488 across 63 files (unit + seam integration + native-smoke),
  including the new `tests/m2-e2e-drive.test.ts` — a scripted, UI-free end-to-end module drive
  against **sandboxed clones of the nimbus simulation remote** (the simulation itself is never
  written): compose request → reply (route inverted, `replies_to` set on disk) → accept
  (StatusReceipt + typed refusal of an illegal transition) → fulfilling delivery → thread rail
  reports `fulfilledBy`/`fulfills` both directions → poller seeds its cursor quietly, then a
  **real second-clone push** produces `handoff.new` for exactly the pushed card, the gated
  integrate pulls it to disk and the cursor advances → `atlas.graph deep` carries the new nodes
  with `thread` (replies_to + fulfills) and `route` edges → the contract timeline reads the
  **real `nimbus-backend` repo's** openapi/postman git history (agent-config v2 = `97d4b73`)
  and serves that commit's pinned unified diff.
- **Lib suite:** vitest 143/143; lib typecheck clean.
- **Typecheck:** node + web projects clean. **Production build:** clean (electron-vite).
- **Design fidelity:** enforced mechanically by `src/renderer/src/design-fidelity.test.ts`
  (exact v2 token hex both themes, Don't-list, focus rings, reduced motion, card/button/stamp
  recipes, reader measure, density). Screenshots skipped: a dev launch requires
  `npx electron-rebuild` (Electron ABI) which would break the system-node test ABI mid-QA;
  UI-only ACs were code-verified (channel registered + component rendered + wired).

## What shipped, per epic

**Epic 7 — Handoff Writing** · 4/4 done

- Lib PR-11 (loredex `d92146d`): schema v2 (`kind`, `replies_to`, `fulfills`, lifecycle
  attribution fields), `createHandoff` / `replyToHandoff` / `setHandoffStatus` /
  `annotateHandoff` / `routeFile`, the v2 state machine with typed errors, qualified-id
  resolution (`<project>/<name>`, `AMBIGUOUS_HANDOFF`) — closing the v0.1 colliding-basename
  action item — plus CLI subcommands and `previewRoute` (`7d7b9a6`).
- Compose modal (DESIGN v2 pattern, one gold primary, ⌘K-listed), reply variant (locked
  inverted route), comment modal (new `type: 'comment'` note, parent never mutated),
  route-a-note via native picker + Reader drag-drop with a plan-first confirm card
  (`route.preview` → `route.file` under the write lock). Undo defers to epic 4 (recorded).

**Epic 8 — Handoff Lifecycle v2** · 3/3 done

- Accept / decline (reason-gated) / snooze (dated) / reopen over `handoffs.setStatus`;
  stamps for every state incl. SNOOZED dashed; derived snooze-expiry (never auto-written).
- `handoffs.thread` derived core-side; thread rail (2px hairline connector, comments included,
  broken refs as diagnostic chips); REQUEST chip; fulfills close-the-loop with the `--ok`
  FULFILLED badge — request status never auto-written.

**Epic 9 — Live (poller, app.db, watcher)** · 3/3 done (in-place v2.0 of 3.5 / 3.6 / 2.3)

- Remote-event poller: focus-driven cadence, fetch-only remote parse (no merge), cursor in
  app.db advancing only after emit, quiet seed on join; single-flight write lock —
  `tryAcquire` for the poller (user work wins), blocking for user sync; F4 full reconcile after
  every integrate. Proven live in the E2E drive.
- `app.db` (better-sqlite3, WAL, core host sole opener): read-state, snooze mirror + one-shot
  expiry toasts, poll cursor, contract-scan cache, settings; v0.1 JSON shim imported once;
  disposable by contract; native-smoke in CI against the packaged Electron ABI.
- Vault watcher: debounced live refresh, storm → reconcile-from-truth; snooze-respecting
  notification routing; badge = open + expired-snooze inbound only. Refresh buttons are
  fallbacks now.

**Epic 10 — Vault Atlas** · 7/7 done (ATLAS-1..7; supersedes the Dependency Graph slices)

- Core-side derived graph (`atlas.graph`): exactly 6 node types / 6 edge categories, explicit
  clusters (projects/topics — zero inference), confidence tiers verbatim, deterministic
  precomputed layout; invalidated with every reconcile.
- Overview/Learn/Deep discrete levels, breadcrumbs + bounded history, collapsed-atom topics;
  SVG-only canvas with aggregated `N open / M total` route badges.
- **Hyperlink-everything (§3) holds row-for-row** — note→Reader, handoff→brief+thread rail,
  project→drill, source→editor deep link (roots-map re-resolution, honest copy-path fallback),
  commit→GitHub or copy-sha, contract→timeline, edges→their creating handoff; canvas, path
  chain, blocked list, tours and ⌘K all share one resolution table. One dead end found and
  **fixed in QA** (see defects).
- Tours from reading orders / threads / topic date-order with heuristic fallback (labeled);
  path tracing (BFS, gold routing-slip chain), filters at the binding granularity, search-tier
  rings, focus mode, blocked-on preset; changed-since overlay (`--ok` glow) + SVG/PNG export.

**Epic 11 — Contract Intelligence (read-only)** · 3/3 done

- Incremental discovery/scan of registered repos (fixed openapi/postman/graphql globs + user
  globs), merged date-sorted timeline, post-integrate rescan events.
- Timeline UI per the data-viz spec + unified diff pinned to commits (never the worktree),
  200 KB cap with a visible flag.
- Handoff↔contract link tiers ALWAYS labeled: `mentioned` solid, `heuristic` dashed `--text-2`,
  display-only.

**Epic 12 — GitHub Layer (gh CLI, no OAuth)** · 2/2 done

- One remote-URL derivation (ssh/https normalization, non-GitHub → honest mono + copy-sha);
  commit chips in rendered notes via the markdown pipeline.
- gh capability probed once + cached, Settings re-check; PR status with 5 s timeout and per-sha
  cache; merged-PR → suggest toast (suggest-only, never writes), dismissals persisted.

**Epic 13 — Wizards** · 2/2 done (supersede 5-5/5-6)

- Create-vault wizard: stepped modal, `ls-remote` preflight with typed failures, lib scaffold
  under the write lock, host restart on switch.
- Join-vault wizard + first-run screen + `loredex://` deep link (main registers/forwards only;
  parsing renderer-side, malformed links rejected).

**Epic 14 — DESIGN v2 Reskin & Defect Burn-down** · 2/2 done

- Light-first token migration (exact hex table, dark flip), card surfaces, pill buttons, modal
  pattern, theme switcher (system/light/dark); gold budget audited (the board's view primary +
  per-card lifecycle primary is the recorded story-mandated pairing).
- All five v0.1 defects fixed with regression tests: Start-Here heading once; feed dedupe by
  sha + paths on hover; reader centered 68–76ch; broken-links badge → diagnostics panel;
  Sync/Settings v2 density.

## Defects found in this QA pass

1. **Fixed — Atlas contract nodes dead-ended** (hyperlink-everything violation, story 10.4):
   clicking a contract node showed a stale "timeline arrives with epic 11" toast although the
   timeline shipped in 11.2. Resolution now opens the Contracts view pre-scoped to the file's
   project and focus-rings the file's newest change (`resolve.ts`, plus `project` passthrough
   scan-row → `AtlasContractChange` → node in `contracts.ts`/`atlas.ts`/`types.ts`; regression
   test added). Residual minor: the timeline filters by project, not per-file (reported).
2. **Fixed — flaky test:** `src/core/sync.test.ts` sync.run timed out under full-suite load
   (5 s default); given the suite's explicit 30 s convention.
3. **Reported — release packaging:** the loredex pin is `file:../loredex/loredex-2.1.0.tgz`
   whose content is 2 commits **past** the published 2.1.0 (write APIs + previewRoute, both
   unpushed). Not a code defect; a versioning/publish gap (see release TODOs).

## v0.1 defect regression

All five stay fixed (epic 14.2 ACs 1–5), each pinned by a regression test:
`brief-title.test.ts`, `feed-logic.test.ts`, `design-fidelity.test.ts` (reader measure +
density), `diagnostics.test.ts`.

## Deferred remainder (open on the board)

- **Epic 1:** 1-5 partial (lib PR-5 async git), 1-7 proxy/doctor surfacing, 1-8 signed +
  notarized release pipeline, 1-9 auto-update channels/translocation.
- **Epic 2:** 2-6 changed-since brief diff.
- **Epic 4 (all):** route receipts + undo (7.4's undo rides this), filing scope control,
  drift badges/reroute.
- **Epic 5:** 5-3/5-4 registry-in-vault + CLI migration, 5-7 registry/company overview.
- **Epic 6:** 6-3 two-clone Playwright e2e suite (the module-drive test now covers the
  seam-level loop; the windowed harness remains).

## Release TODOs (v0.2)

1. **Lib version bump + npm publish (blocker):** push loredex main (2 local commits), release
   as **2.2.0** (write APIs are additive features), `npm publish`, then repin
   `loredex-desktop/package.json` from the `file:` tarball to the published pinned version
   (`tests/pinned-release.test.ts` guards the seam).
2. **Signing/notarization (blocker for distribution):** story 1-8 — Developer ID cert secrets
   into `release.yml`, hardened runtime + notarize + staple; then 1-9 translocation/auto-update
   channels.
3. Package smoke on the built `.dmg` (electron-builder rebuilds natives — the dev-launch ABI
   caveat does not apply to packaging, but verify app.db + watcher boot in the artifact).
4. Consider a `predev` electron-rebuild script so `npm run dev` stops crash-looping on the
   system-node natives (recorded action item).
5. Release notes: v0.2 = handoff writing + lifecycle v2 + live poller/watcher + Vault Atlas +
   contract intelligence + GitHub layer + wizards + DESIGN v2; call out schema v2 and the
   engine degradation rule (older engines read v2 vaults, doctor warns).
