# JUDGMENT — Loredex Desktop Build Plan

**Reviewer stance:** skeptical principal engineer, independent of the plan's authors.
**Date:** 2026-07-09.
**Inputs verified:** `BUILD-PLAN.md`, all six research reports in `docs/research/`, `loredex-simulation/DESKTOP-APP-FEATURES.md`, `loredex-simulation/SIMULATION-REPORT.md`, and the actual `loredex/src/lib.ts` + `loredex/package.json`.

---

## Verdict: **PASS-WITH-REVISIONS**

This is one of the better-grounded build plans I have reviewed: every feature traces to a numbered simulation finding, the stack argument is honest about Electron's costs, and the state-location decision (§3.4) is genuinely well argued. But it contains verifiable factual errors (the decision-table arithmetic is wrong in three of four columns), it materially understates the library work required ("two additive lib changes" cannot produce the IPC contract it sketches), it mixes two incompatible Electron updater stacks, its M1 estimate is roughly 2x optimistic for the listed scope, and it has zero test strategy. None of these kill the plan; all of them will bite during execution if not fixed on paper first.

---

## Scores

### (a) Evidence-grounding — **9/10**

Exemplary. All 37 features in §4 carry an evidence tag, and I spot-checked them against `SIMULATION-REPORT.md`: F1 (sender blindness) → features 7–10; F4 (the only vault-damaging friction) → features 4–6; F6 → feature 14 and the whole architecture; F7 → features 11–12, 24, 28; F8 → sync health + the CLI-side fix landing at M0. The "honesty note" under the feature table — admitting features 16–23 are spec *musts* deliberately deferred past the MVP cut line, with the spec's own sequencing as cover — is exactly the kind of intellectual honesty most plans lack. The cut list (§8) also traces: every cut cites either the spec's own priority or a named open question.

Deductions:
- The IPC contract (§3.3) claims its types are "derived from `import type {...} from 'loredex'`" — but `Config`, `Doc`, `SearchHit`, `ProductDashboard`, `ProjectState` are the *only* ones that exist in the published `lib.ts`. `HandoffCard`, `ConsumeReceipt`, `RoutePreview`, `SyncHealth`, `SyncReport`, `WizardInput`, `ActivityEvent`, `Identity`, `LinkResolution`, `Facets` exist nowhere. The claim of single-source-of-truth typing is aspirational, presented as fact.
- Success metric "notification ≤ 60 s after consume (one poll interval)" cites no evidence for a 60 s poll; `ux-patterns.md` §7 recommends a 1–5 min fetch cadence.

### (b) Technical feasibility on Apple Silicon macOS — **7/10**

The load-bearing claims check out against the research and the repo: loredex v2.0.0 is genuinely ESM-only, `engines.node >= 20`, `execFileSync` git, `gray-matter`, MCP SDK (verified in `package.json`); Electron utilityProcess ESM hosting, `@parcel/watcher` darwin-arm64 prebuilds, inside-out signing with `allow-jit` only, `ditto` zipping, staple-the-DMG, translocation detection, arm64-only rationale (macOS 27 AS-only, Rosetta sunset, `macos-15-intel` until Aug 2027) — all consistent with `[stack]`, `[core-reuse]`, `[distribution]`. The `loredex-obsidian` existence proof for in-process MCP hosting is real and decisive.

Deductions:
1. **The decision table's arithmetic is wrong in 3 of 4 columns.** With the stated weights (5,5,2,3,4,3,2): Electron = 25+25+4+12+20+12+10 = **108**, not 107; Swift = **64**, not 62; Flutter = **41**, not 40 (Tauri's 70 is correct). The ranking survives, but a weighted decision table that fails its own multiplication undermines confidence in everything else quantitative in the document.
2. **Two incompatible updater stacks are mixed.** §6 commits to `update.electron.app` (which is `update.electronjs.org` — the plan uses both names; it wraps Squirrel.Mac via `update-electron-app`, pairing naturally with Forge) *and* says the ZIP is "required by electron-updater" *and* has CI uploading `latest-mac.yml` — both of which belong to the electron-builder/electron-updater stack, not Forge/Squirrel. The toolchain line says Forge. Pick one; as written, CI will produce artifacts the chosen updater ignores.
3. **Static `.mcp.json` cannot "read" a discovery file.** §3.2 says generated `.mcp.json` templates read `~/.loredex/desktop.json` — but `.mcp.json` is static JSON consumed by Claude Code; it cannot execute discovery logic for an HTTP endpoint. With the stated `listen(0)` port fallback, every templated repo config breaks the moment the preferred port is taken. This needs a real mechanism, not a hand-wave.
4. **GitHub OAuth from a distributed OSS desktop app is asserted, never researched.** Feature 11 (M1 **must**) requires OAuth repo creation. None of the six research reports covers device flow vs PKCE, the impossibility of embedding a client secret in a public repo's shipped binary, or Keychain token storage. This is the single least-de-risked technical item in the M1 scope.

### (c) Scope realism of M1 (solo maintainer + AI agents) — **5/10**

M0 at ~3 weeks is plausible (the MCP port is a copy job, the signing pipeline is the real work and it's well-specified). M1 at 8–10 weeks is not. By the plan's own estimate scale, features 1–15 contain 3×L (>2 wk each), 8×M (≤2 wk each), 4×S — a serial sum in the ~20+ week range. Agents parallelize some of it, but the three L items (wikilink-resolving vault browser, inbox/outbox board, create-or-join wizard with OAuth) are exactly the kind of integration-heavy, polish-sensitive work where agent parallelism yields least. Two specific under-estimates:

- **Feature 12 (registry-in-vault, M) is not an app feature — it is a change to loredex core config-resolution semantics.** "Replaces per-machine config.json as truth" means the CLI must also read the vault registry, or the CLI and app resolve projects differently — recreating the F6 divergence class the plan exists to kill. That is a coordinated loredex release with migration, not 2 weeks of app work.
- **The "two additive, non-breaking lib changes" claim (§3.2) is falsified by the plan's own IPC contract.** `lib.ts` exports no handoff list/consume, no route (let alone preview/receipt/undo), no sync status/ahead-behind, no drift computation, no activity-feed parsing, no link resolution. Either the lib grows a substantial write-path API surface (many PRs to loredex, all during M0–M1), or the app reimplements CLI internals — a second engine writing the same frontmatter, which is the split-brain in new clothes. Neither option is budgeted.

Also inconsistent: feature 8 (consume with identity + timestamp, M1) adds frontmatter fields — a schema change — while risk 9 defers schema versioning (`loredex_schema:`) to M2. The schema changes in M1 whether the plan admits it or not.

### (d) Architecture soundness — **8/10**

The core is right and well-defended: three processes with a logic-free main, the lib in a `utilityProcess` so `execFileSync` blocking and 40–60 s curate spawns never touch the window, MessagePort IPC brokered by main, reconcile-from-filesystem-after-pull (the F4 lesson correctly generalized), git identity injected per-command via `-c` (F7), MCP hosted in-process with Origin validation and loopback binding (spec-compliant, CVE-aware). §3.4's hybrid state split with the hard rule ("nothing team-visible only in app DB; nothing per-user in the vault") is the best paragraph in the document and correctly resolves the spec's open question #2.

Deductions:
1. **The diagram shows `renderer <--> DB` directly.** A sandboxed, context-isolated renderer cannot open SQLite. `app.db` must live behind the core host or main (and if it's `better-sqlite3`, that's a *second* native module with Electron-ABI churn, absent from risk 5).
2. **The split-brain fix is oversold as "by construction."** The app pins `loredex` exact; users' CLIs float (`npx -y loredex@latest` is literally the F6 footer bug). Two engine versions writing one vault is version-skew split-brain, acknowledged only obliquely in risk 2. There is no engine/schema version handshake specified.
3. **The remote-event loop is undesigned.** Handoff notifications from other machines require background `git fetch`/`pull` on a cadence; the architecture has an FSEvents watcher (local only) and no poller component. Auto-pull while local agents/CLI are mid-write is a concurrency surface (F4's cousin) with no design and no risk-table entry.
4. Write-path APIs missing from the lib (covered in (c)) — an architectural gap, not just a scope one.

### (e) Completeness — **7/10**

Distribution (§6) is the strongest section — signing, notarization gotchas (status-text assertion, partition-list, ditto-vs-zip, translocation), Homebrew notability gates, TCC-safe onboarding, telemetry posture — all present and consistent with `[distribution]`/`[oss-shipping]`. The risk table is real (likelihood/impact/mitigation, no filler), and §8's "deliberately not building" list is disciplined.

Missing, and each will bite:
1. **No test strategy at all.** No unit/E2E split, no Playwright-for-Electron (or equivalent), no MCP contract tests, no merge-driver fixture tests, no CI test matrix beyond a watcher smoke test. The plan cites BMAD story anatomy, whose Dev Notes *require* a testing-strategy shard — which cannot be written from this document.
2. **Beta channel mechanics unresolved.** `update.electronjs.org` serves stable only (flagged in `[oss-shipping]` risks); "beta via GitHub pre-releases" leaves beta users outside auto-update with no stated plan.
3. **Public-repo-from-day-one requirement** for update.electronjs.org (oss-shipping risk 2) — never addressed; if the repo starts private, M0's DoD auto-update path can't be dogfooded.
4. Minimum macOS version undeclared (research recommends 13/14 floor).
5. No update-rollback story for a bad release; no `legal/` third-party-notices task (recommended in `[oss-shipping]`); crash-report path/hostname scrubbing (in research) absent from the plan; M1 identity story for CLI-side consumes (managed identity is M2) leaves the F1 "who consumed" metric partially unmeetable when consumption happens outside the app.

---

## MANDATORY revisions

1. **Fix the §2.1 decision-table arithmetic.** Correct totals with the stated weights: Electron **108**, Tauri 70, Swift **64**, Flutter **41**. Re-verify every weighted row; the ranking stands, the numbers must too.
2. **Replace the "two additive lib changes" claim with an honest lib work-plan.** Enumerate every `CoreApi` operation in §3.3 against the actual `lib.ts` exports and state, per operation, whether it (a) exists, (b) becomes a new lib export (list the loredex PRs and schedule them), or (c) is app-side — and for every (c) that *writes* the vault, justify why it isn't a second engine. Handoff list/consume, route+receipt+undo, sync status, drift, and activity parsing all currently have no lib surface.
3. **Pick one updater stack and make §6 internally consistent.** Either Electron Forge + `update-electron-app`/update.electronjs.org (Squirrel.Mac; ZIP artifact; **no** `latest-mac.yml`) or electron-builder + electron-updater (`latest-mac.yml`; supports beta channels). Resolve the beta-channel question and the public-repo-from-day-one requirement in the same edit.
4. **Specify the `.mcp.json` ↔ dynamic-port mechanism.** A static config file cannot read `~/.loredex/desktop.json`. Options: guarantee a fixed port and fail loudly (drop `listen(0)`), or ship a thin stdio proxy (`loredex mcp --via-desktop`) that reads the discovery file and forwards to the app's HTTP endpoint so templated configs stay static. Choose and document.
5. **Design the remote-event loop.** Background fetch/pull cadence, its interaction with concurrent CLI/agent writes to the same vault (locking or reconcile rules), how it feeds notifications, and whether the ≤60 s consume-notification metric is achievable — add the component to the §3.1 diagram and a row to the risk table. Align the metric with the chosen cadence.
6. **Fix the renderer↔SQLite path.** Move `app.db` behind the core host (or main) with IPC access; if `better-sqlite3` (or similar native module) is used, add it to risk 5's ABI-churn mitigation and the CI smoke test.
7. **Close the engine-version split-brain.** Specify an engine+schema version handshake: the app and `loredex doctor` must detect and warn when the CLI version writing a vault differs materially from the app's pinned engine, and the `loredex_schema:` version key must ship in **M1** (feature 8 already changes the frontmatter schema), not M2.
8. **Re-baseline M1.** Either extend to a defensible 14–16 weeks or move scope out — the create-or-join wizard's GitHub-repo-creation half and/or feature 12 are the candidates. Re-plan feature 12 (registry-in-vault) explicitly as a coordinated loredex-core change with CLI support and migration, not an app feature.
9. **Add a test-strategy section.** Unit (vitest, matching loredex), E2E harness for Electron (e.g., Playwright), MCP contract tests against the in-app endpoint, merge-driver/gitattributes fixture tests, and the CI matrix — this is also a prerequisite for the BMAD `testing-strategy` shard the plan says stories will cite.
10. **Research and specify GitHub OAuth for a distributed OSS desktop app** before M1 stories are authored: device flow vs PKCE, no embeddable client secret, token storage in macOS Keychain, scopes needed for private-repo creation, and the failure UX. This is currently an M1 **must** with zero research behind it.

## Optional suggestions

- Declare a minimum macOS version (13 or 14 per `[distribution]`) in §6.
- Add a `legal/` third-party-notices task (Zed pattern, per `[oss-shipping]`) to M0.
- State the M1 identity story explicitly: in-app consumes carry app identity; CLI consumes remain ambient-git-config until M2 — and reflect that caveat in the "sender learns fate" success metric.
- Add an update-rollback plan (previous DMG retained on the Release; documented re-install path).
- Carry the Sentry path/hostname scrubbing requirement from `[oss-shipping]` §5 into the plan's telemetry row.
- Add an idle-RAM CI budget check to keep success-metric row 9 ("≤450 MB") honest continuously rather than at launch.
- The M1 DoD ("re-run the Nimbus simulation, all F-reproductions fail") is excellent — consider automating the reproduction steps as the E2E suite's backbone so the DoD is executable, not ceremonial.

---

*Judgment rendered against the evidence as of 2026-07-09. The plan's grounding discipline is well above the bar; the revisions are about execution honesty, not direction.*
