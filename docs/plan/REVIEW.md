# BUILD-PLAN.md — Independent Fact-Check Review

**Reviewer:** independent technical fact-checker (not the architect, not the judge) · **Date:** 2026-07-09
**Inputs verified against:** `docs/research/*.md` (with live source checks via web where load-bearing), `loredex/src/lib.ts`, `loredex/src/**`, `loredex/package.json`, `loredex/.github/workflows/`, `loredex-obsidian/src/server.ts`, `loredex-simulation/SIMULATION-REPORT.md`, `loredex-simulation/DESKTOP-APP-FEATURES.md`.

Verdicts: **correct** / **wrong (fixed)** / **unverifiable**.

## 1. Technology / version / API claims

| Claim (plan §) | Verdict | Notes / correction |
|---|---|---|
| Electron current major is 43.x (§2.1) | correct | Live check of releases.electronjs.org: v43.1.0 stable, Jul 7 2026 |
| Electron main/utilityProcess "IS Node 22+" (§2.1) | correct | Electron 43 ships Node 24.18.0 (≥22 holds) |
| `utilityProcess.fork` full Node child with `MessagePortMain` brokering (§3.1–3.2) | correct | Real Electron API; ESM entry supported since Electron 28 |
| electron-vite + electron-builder + electron-updater one-stack (§2.2, §6) | correct | All real, maintained, and mutually compatible |
| electron-updater needs ZIP + `latest-mac.yml` on GitHub Releases (§6) | correct | electron-builder macOS default is dmg+zip for exactly this reason |
| Beta channel via electron-updater channels: `channel: beta` → `beta-mac.yml`, in-app `updater.channel` opt-in (§6) | correct | Real electron-builder/electron-updater feature |
| update.electronjs.org / Squirrel path is stable-channel-only, belongs to Forge stack (§2.2, §6) | correct | Matches `[oss-shipping §4]`: update.electronjs.org serves latest stable only |
| Signing: Developer ID + hardened runtime, `allow-jit` only, Electron ≥12 needs no `allow-unsigned-executable-memory`, sign inside-out never `--deep` (§6) | correct | Matches Apple + electron-builder guidance in `[distribution §2,§4]` |
| `notarytool submit --wait`, assert "Accepted" status text (exit 0 unreliable), staple; `ditto -c -k --keepParent` for ZIP (§6) | correct | Matches `[distribution §3]` (rsms gist, electron/notarize#97) |
| CI runner label `macos-latest` = arm64 (§6, §7) | correct | GitHub-hosted macos-latest is Apple Silicon |
| `macos-15-intel` available until Aug 2027; GitHub's last x86_64 macOS support ends Aug 2027 (§2.2) | correct | Live check of actions/runner-images#13045 confirms both. (Note: `macos-26-intel` also exists now, but the Aug 2027 x86_64 end date stands) |
| macOS 26 Tahoe = final Intel release (4 Intel models); macOS 27 AS-only; Rosetta 2 available only through macOS 27 (§2.2) | correct | WWDC25 announcements; `[distribution §5]` |
| `security set-key-partition-list` mandatory in CI keychain step (§6) | correct | Classic codesign-hang failure otherwise |
| GitHub Device Flow: OAuth app client ID only, no secret; `repo` scope for private repos; fine-grained PATs not mintable via OAuth; 5s poll minimum, user-code expiry (§3.5) | correct | All match GitHub OAuth device-flow docs. (Minor: device flow must be enabled per-app in the OAuth app settings — the §3.5 pre-M2 spike will surface this) |
| Electron `safeStorage` = Keychain-backed token storage (§3.5) | correct | Real API |
| `@parcel/watcher`: FSEvents, darwin-arm64 prebuilds, VS Code's watcher, `writeSnapshot`/`getEventsSince` (§3.2) | correct | Real APIs; VS Code File Watcher Internals confirms |
| `better-sqlite3` native module, Electron-ABI-sensitive (§3.1, §8 risk 5) | correct | Real; ABI smoke test is the right mitigation |
| Git strategy: dugite/dugite-native precedent, nodegit dead since 2020 (0.27.0 Jul 2020), isomorphic-git lacks custom merge driver (§3.2) | correct | Matches `[core-reuse §4]` and upstream repos |
| MCP Streamable HTTP: bind 127.0.0.1, Origin validation is spec MUST, CVE-2025-66416 precedent (§3.2) | correct | Live check: CVE-2025-66416 is real (MCP Python SDK, DNS-rebinding protection off by default, CVSS 8.1, fixed 1.23.0). MCP 2025-06-18 transport spec requires Origin validation |
| Playwright for Electron E2E (§7) | correct | Real (experimental Electron support in Playwright) |
| release-please + conventional commits "already loredex's flow" (§6) | correct | Verified: `loredex/.github/workflows/release.yml` uses googleapis/release-please-action@v4 |
| Homebrew notability: ~225 stars for self-submitted cask (3× of 75) (§6, §10) | correct | Matches Acceptable Casks policy |
| Sentry sponsored OSS plan; Astro Starlight docs; TESTFLIGHT/MAS sandbox incompatibility (§6, §9) | correct | All match `[oss-shipping]` |
| Hopp benchmark numbers ~250 MB installed / ~409 MB RAM vs Tauri 8.6 MiB / ~172 MB (§2.1, §8) | correct | Matches `[stack §2]` (244 MiB ≈ ~250 MB) |
| Node sidecar ~85–110 MB; vercel/pkg deprecated; Node SEA needs CJS entry (§2.1–2.2) | correct | Matches `[stack §1]` |
| Decision-table arithmetic: 108 / 70 / 64 / 41 (§2.1) | correct | Re-computed against weights (5,5,2,3,4,3,2); all four totals check |
| Fixed preferred MCP port 52017 (§3.2) | correct (design choice) | Unregistered high port; nothing to verify externally |

## 2. loredex core library claims

| Claim (plan §) | Verdict | Notes / correction |
|---|---|---|
| loredex v2.0.0, `"type": "module"`, `engines.node >= 20`, MIT, deps gray-matter / @modelcontextprotocol/sdk ^1.29 / commander / zod (§2.2) | correct | Verified against `loredex/package.json` |
| No native modules in the core | correct | Deps are pure JS (picocolors is ISC, rest MIT) |
| `execFileSync('git', …)` in core (`core/router.ts`, `core/drift.ts`); `claude`/`codex` spawns in `llm/` (§2.2, §3.2) | correct | Verified in source |
| Published export list "exactly …" (§3.2) | **wrong (fixed)** | List omitted the `PRODUCT_BRIEF_NAME` constant and exported types `Meta`, `ProductHandoff`, `StoreInput`. Fixed in §3.2; §3.3 wording scoped to "of the contract's payload types" |
| §3.3: five types (`Config`, `Doc`, `SearchHit`, `ProductDashboard`, `ProjectState`) exist today | correct (after fix) | The five the IPC contract imports do exist; three more types exist but are unused by the contract — now stated |
| `collectProductHandoffs` is product-scoped; consume is CLI-internal; routing lives in CLI/store internals; `gitPullPush` is act-only (returns boolean, no status) (§3.2 work-plan) | correct | Verified: consume logic in `commands/handoff.ts`; `gitPullPush` is best-effort boolean per `core/router.ts` |
| `loredex-obsidian` hosts `createLoredexMcpServer` + `StreamableHTTPServerTransport` on 127.0.0.1 with bearer auth in ~70 lines (§2.2) | correct | `loredex-obsidian/src/server.ts` = 79 lines, `LoredexHttpServer`, bearer check, 127.0.0.1 bind, stateless transport-per-request |
| Two CLI fixes (F8 gitattributes, F6 npx footer) "must land" in M0 (§3.2, §5) | **wrong (fixed)** | Both are already fixed in loredex source: `core/router.ts:171-176` writes the quoted `"Start Here - Product.md"` pattern **and** migrates away the broken backslash-escaped rule; `commands/handoff.ts:113` footer now uses the project-local `loredex` invocation with an explicit do-not-use-global warning. Plan updated: M0 verifies the fixes are in the pinned published release. (Unverifiable from here: whether the published npm 2.0.0 tarball includes them — hence "verify", not "drop") |
| `loredex mcp` stdio stays with CLI; `loredex doctor` exists (§3.2) | correct | `commands/mcp.ts`, `commands/doctor.ts` exist |
| vitest matches loredex's own setup (§7) | correct | vitest in loredex devDependencies |

## 3. Simulation-evidence citations (F1–F10)

| Citation | Verdict | Notes |
|---|---|---|
| F1 → inbox/outbox, consume identity, notifications (features 7–10); "most-reported friction"; "sender never finds out"; mobile "single highest-value feature" | correct | Matches SIM §4 F1 and spec (b)/(f) verbatim |
| F2 → contract registry/diff/timeline (features 21–23); "3 mutations/day discoverable only via prose"; "ownership by prose convention" | correct | Matches SIM F2 |
| F3 → kinds/threading/chain/dependency (features 16–19); "mobile faked a question as delivery"; "frontend reconstructed lineage by hand" | correct | Matches SIM F3 + spec (b) |
| F4 → route receipts/undo/globs/drift (features 4–6); "only friction that damaged the vault"; "FINDINGS.md silently published"; "route-once staleness ×3" | correct | Matches SIM F4; "damaged" phrasing is the spec's own (pillar 3) |
| F5 → search, product home, sync health, activity feed | correct | Matches SIM F5 (PM grep archaeology, stale snapshot, sync black box) |
| F6 → identity badge, single engine, npx footer; "most dangerous failure mode" | correct | SIM: "the single most dangerous failure mode observed" |
| F7 → wizard, registry-in-vault, identity; "clone = dead vault"; "6–10 manual steps with 2 silent failure modes" (§10 metric) | correct | Steps/failure-modes figure is in the spec (e) wizard evidence; dead-vault in SIM §6 addendum |
| F8 → gitattributes bug, surfaced git warnings; "warned on every op, unseen" | correct | Matches SIM F8 |
| F9 → rendered reader/wikilinks; "every reader did filesystem find per link" | correct | Matches SIM F9 |
| F10 → scope preview (7-note oversweep), target picker (ghost projects), integration cards (ops knowledge homeless) | correct | Matches SIM F10 cluster items one-to-one |
| Feature 35 ("PM can't verify shipped merged") and 27 ("three checkmarks") | correct | Both trace to spec (c)/(e) evidence text |
| §3.4 hybrid state decision vs spec open question #2; §9 cuts vs Q1/Q3/Q4 | correct | Faithful to spec's open-questions text |
| MVP cut line: features 16–23 are spec musts placed after the cut line | correct | Spec: "ship v1 with open/consumed + who/when, add states once frontmatter schema is settled" |

## 4. License compatibility (proposed stack vs MIT)

| Component | License | Compatible with MIT app? |
|---|---|---|
| Electron, electron-builder, electron-updater, electron-vite | MIT | yes |
| loredex (pinned dep) + gray-matter, commander, zod, @modelcontextprotocol/sdk | MIT (picocolors ISC) | yes |
| @parcel/watcher, better-sqlite3 (SQLite is public domain), dugite | MIT | yes |
| Playwright, release-please (tooling only) | Apache-2.0 | yes (tooling/test-time; Apache-2.0 is MIT-compatible regardless) |
| vitest, Sentry JS SDK, Astro Starlight | MIT | yes |
| **dugite-native bundled git binaries** | **GPLv2** (git itself) | **yes, with compliance duties** — the app execs git as a separate process (no linking), which is mere aggregation, so the app stays MIT; but shipping the binary in the bundle requires including git's GPLv2 license text and honoring the source-availability obligation (dugite-native publishes sources). The plan's M0 `legal/` third-party-notices step covers the notice half; the notices generator must not skip the bundled binary. Not an error in the plan — flagged as an execution requirement |

No copyleft anywhere else in the chain; the `[oss-shipping]` "no copyleft appears anywhere in the plausible chain" line is true for npm deps but the bundled git binary is the one GPL artifact — worth remembering at M0.

## 5. Errors found and fixed in BUILD-PLAN.md

1. **§3.2 export inventory** — "the published exports are exactly: …" omitted `PRODUCT_BRIEF_NAME` and the type exports `Meta`/`ProductHandoff`/`StoreInput`. Fixed (list completed; §3.3 wording scoped).
2. **§3.2 + §5 M0 "land the two CLI fixes"** — both F8 (gitattributes) and F6 (npx brief footer) are already fixed in loredex source. Fixed (M0 now verifies the fixes ship in the pinned release).
3. *(covered by 1)* §3.3 "only … exist in lib.ts today" was over-strong; scoped to the contract's payload types.

Nothing else surveyed rose to "outright factual error". Two soft flags, no edit made: (a) §3.5 doesn't mention that GitHub device flow must be explicitly enabled in the OAuth app's settings — the planned pre-M2 spike will hit this; (b) risk-3 mitigation still says "F8 fix ships in loredex first (M0)", which remains true in release terms.

## 6. Overall confidence

**High (≈0.9).** ~60 discrete claims checked: 57 correct, 2 wrong (both fixed, neither affecting the stack decision, architecture, or milestones), 1 partially-unverifiable residue (whether the already-landed CLI fixes are in the *published* npm 2.0.0 artifact — plan now says "verify", which is the correct posture). Post-knowledge-cutoff claims (Electron 43.x/Node 24, macos-26 GA, macos-15-intel retirement, CVE-2025-66416) were verified against live sources. The decision-table arithmetic, the simulation citations, and the loredex code-level claims all check out; the plan's Electron recommendation rests on premises that are true.
