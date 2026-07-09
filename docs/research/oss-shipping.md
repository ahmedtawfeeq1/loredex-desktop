# Shipping Loredex Desktop as a Solo OSS Maintainer (2025/26)

Research date: 2026-07-09. Lens: repo strategy, licensing, release automation, beta channels, telemetry norms, docs conventions, and launch marketing for a native-feeling macOS (arm64-first) desktop app that manages the loredex ecosystem — shipped by one person, to an audience of Claude Code + Obsidian developers.

Grounding facts about the existing ecosystem this must fit:

- `loredex` (npm, v2.0.0, MIT) is a single repo that already ships a CLI **and** a library (`src/lib.ts`, exports incl. `createLoredexMcpServer`, `buildDashboard`, `gitPullPush`), plus a Claude Code plugin under `plugin/`, versioned together via **release-please** (`release-please-config.json`, node release-type, `extra-files` bumping `plugin/.claude-plugin/plugin.json`).
- `loredex-obsidian` is a **sibling repo** (own `package.json`, `manifest.json`, `versions.json` — the standard Obsidian plugin layout) that already hosts the loredex MCP server inside Obsidian's process. Since Obsidian is an Electron app, this is an existence proof that the TypeScript core embeds cleanly inside an Electron runtime.
- The simulation report ([SIMULATION-REPORT.md](../../../loredex-simulation/SIMULATION-REPORT.md)) flags F6 (CLI vs MCP split-brain serving different vaults) as "the single most dangerous failure mode observed" — which makes "one shared engine, resolved once" an architectural requirement that repo strategy must serve, not fight.

---

## 1. Repo strategy: sibling repo, same org, engine consumed as the published npm lib

### What comparable projects do

- **Zed** is the maximal monorepo: [231 Rust workspace crates under `crates/`](https://github.com/zed-industries/zed/tree/main/crates), with the CLI as a crate (`cli`), docs as mdbook in `docs/`, and a `legal/` directory aggregating third-party licenses. It works because everything is one language, one build system (Cargo workspace), one team. That's not the loredex situation — but the `legal/` license-aggregation and `docs/` conventions are worth copying.
- **n8n** tried the opposite and it's a cautionary tale: [`n8n-io/n8n-desktop-app`](https://github.com/n8n-io/n8n-desktop-app) was a separate repo wrapping the main product, and it is now **archived/unmaintained**. The lesson is not "separate repos fail" — it's that a desktop app that is merely a thin wrapper with no owned surface dies. Loredex Desktop owns real surface (inbox/outbox, receipts, sync health, onboarding), so it avoids the n8n failure mode on product grounds, but the repo should still be treated as a first-class product, not a wrapper.
- **GitButler** ([gitbutlerapp/gitbutler](https://github.com/gitbutlerapp/gitbutler)) is a single repo organized internally as a monorepo of apps + supporting crates (Tauri + Rust + Svelte). Again: one team, engine and app born together.
- **The Obsidian plugin ecosystem** — the community loredex already lives in — is uniformly one-repo-per-artifact with GitHub Releases as the distribution mechanism (`manifest.json` + `versions.json` + release assets). `loredex-obsidian` already follows this pattern.

### Recommendation

Create **`loredex-desktop` as a sibling repo in the same GitHub org/namespace** as `loredex` and `loredex-obsidian`, consuming the published `loredex` npm package as its engine. Reasons, in order:

1. **Release cadence mismatch is real.** An app release involves macOS runners, code-signing certificates, notarization round-trips to Apple, updater manifests, and DMG artifacts. The CLI releases with `npm publish` in seconds. Coupling them in one release-please config means every CLI patch either drags a 20-minute signed app build or needs component-level release gymnastics.
2. **Secrets isolation.** The Apple Developer ID certificate, notarization API key, and updater signing key live only in the app repo's CI. The CLI repo's CI stays trivially auditable — which matters for a tool people run against their team's knowledge.
3. **The pattern already exists and works.** `loredex-obsidian` proved the sibling-repo, npm-lib-as-engine model. A third sibling is consistent; a mid-life monorepo migration is churn with no user-visible payoff.
4. **The lib boundary is the split-brain fix.** F6 happened because two entry points resolved config independently. The contract to enforce is: the app depends on `loredex` (the lib), pins a version, resolves the vault/config **once**, and surfaces "engine vX.Y.Z, vault: <path>" in the app chrome (which the feature spec's vault-identity badge requires anyway). That contract is exactly as enforceable across repos as within one.

**Dev-loop mitigation for the split:** during development, `npm link` (or `"loredex": "file:../loredex"` in a local override) keeps app work unblocked while lib changes are unpublished; CI always builds against the published version so drift is caught at PR time. If cross-repo change pain becomes chronic (it usually surfaces as "every app feature needs a lib PR first"), that is the signal the lib API is too thin — fix the API before reaching for a monorepo.

---

## 2. Licensing: everything in the realistic stack is permissive; the real constraint is Apple, not licenses

- **Electron** is MIT (bundling Chromium under BSD-style terms and Node under MIT) — no constraint on an MIT app; only obligation is shipping third-party notices, which electron-builder/Forge automate. See [Electron's publishing docs](https://www.electronjs.org/docs/latest/tutorial/tutorial-publishing-updating).
- **Tauri** is dual-licensed MIT OR Apache-2.0 ([tauri-apps/tauri](https://github.com/tauri-apps/tauri)) — no constraint.
- **Sparkle** (the native-macOS updater framework, relevant only if the app ever goes fully native) is [MIT-licensed](https://github.com/sparkle-project/Sparkle) with beta channels and phased rollouts built into Sparkle 2.
- No copyleft appears anywhere in the plausible chain. The app repo can stay MIT to match the CLI. Copy Zed's `legal/` habit: aggregate third-party licenses into the app bundle.

**The framework choice is actually an architecture question, and licensing doesn't decide it — the Node engine does.** The loredex core is a TypeScript/Node library. Electron's main process imports it directly (and the Obsidian plugin already proves the core runs inside an Electron process, including hosting the MCP server over Streamable HTTP). Tauri's backend is Rust; reusing the TS engine there means bundling a Node runtime as a **sidecar binary**, which erases most of Tauri's celebrated size advantage (Tauri ~5MB hello-world vs Electron ~150MB, per [2026 comparisons](https://www.buildmvpfast.com/blog/tauri-v2-vs-electron-desktop-apps-2026)) and adds an IPC seam exactly where F6 says there must be no seam. For a solo maintainer whose entire engine is Node, **Electron is the lower-risk choice**; the Obsidian-user audience already runs Electron daily, blunting the usual size objection.

**The Apple constraint (not a license, but a hard shipping requirement):** distributing outside the Mac App Store requires a [Developer ID certificate + notarization](https://developer.apple.com/developer-id/), which requires the Apple Developer Program ($99/year). As of macOS Sequoia, [users can no longer Control-click to bypass Gatekeeper](https://developer.apple.com/news/?id=saqachfa) for unsigned/un-notarized apps — so for a 2026 arm64 audience, notarization is effectively mandatory, not optional polish. Budget the $99 and the CI plumbing from day one.

---

## 3. Versioning + release automation: keep release-please; tag-triggered signed-build workflow

- **Stay on release-please.** The CLI repo already uses it with conventional commits, including the `extra-files` trick to version-bump the Claude plugin manifest. Using the same tool in `loredex-desktop` keeps one mental model. Release-please's release-PR flow ("a living view of your next release in the PRs tab", per [practitioner writeups](https://totaldebug.uk/posts/ditch-the-manual-chore-automating-releases-and-versions/)) suits a solo maintainer: merge the release PR when ready, get a tag + GitHub Release + changelog.
- **Changesets is the wrong fit here.** It's designed around npm multi-package monorepos, and attaching binary artifacts to its releases is a documented pain point — maintainers route around it with separate tag-triggered publish workflows ([discussion #1086](https://github.com/changesets/changesets/discussions/1086), [#1503](https://github.com/changesets/changesets/discussions/1503)). Since loredex-desktop is one app in one repo with binary artifacts, changesets buys nothing.
- **The binary pipeline hangs off the release tag.** Pattern (used across the Tauri/Electron ecosystem): release-please merges → tag `v0.4.0` → a `release-build` workflow on a macOS arm64 runner builds, signs (Developer ID cert in CI secrets), notarizes, and uploads `.dmg` + update artifacts to the same GitHub Release.
  - If Electron: `electron-builder --publish` or Forge's GitHub publisher; updates via [`update-electron-app`](https://github.com/electron/update-electron-app) pointing at [update.electronjs.org](https://github.com/electron/update.electronjs.org) — a **free service specifically for open-source Electron apps** (requirements: public repo, GitHub Releases, code-signed macOS builds).
  - If Tauri: [`tauri-action`](https://github.com/tauri-apps/tauri-action) builds/signs/uploads and generates the signed `latest.json` updater manifest; the [Tauri bundler auto-signs and notarizes](https://v2.tauri.app/distribute/sign/macos/) when the Apple env vars are set. Production walk-throughs from 2025/26 confirm this is a solved, documented path ([part 1](https://dev.to/tomtomdu73/ship-your-tauri-v2-app-like-a-pro-code-signing-for-macos-and-windows-part-12-3o9n), [part 2](https://dev.to/tomtomdu73/ship-your-tauri-v2-app-like-a-pro-github-actions-and-release-automation-part-22-2ef7)).
- **Version semantics:** the app's own semver is independent of the engine's; surface both ("Loredex Desktop 0.4.0 · engine 2.3.1") in About and in bug-report templates. Renovate/Dependabot on the `loredex` dependency turns engine upgrades into reviewable PRs.

---

## 4. Beta channels: GitHub pre-releases, not TestFlight

- **TestFlight for Mac exists but is App-Store-track only.** [Apple's TestFlight page](https://developer.apple.com/testflight/) confirms macOS support (100 internal / 10,000 external testers), but builds are managed through App Store Connect, pass beta app review, and — critically — Mac App Store rules require the **App Sandbox**. An app whose whole job is spawning `git`, watching arbitrary vault folders, and wiring MCP servers is a terrible sandbox citizen. TestFlight is therefore not available *in practice* for this app's direct-distribution model. This matches the broader guidance that non-App-Store macOS distribution runs on notarization + your own update channel ([Apple: distributing for beta testing and releases](https://developer.apple.com/documentation/xcode/distributing-your-app-for-beta-testing-and-releases)).
- **The OSS norm is GitHub pre-releases + an updater channel.**
  - Mark beta builds as "Pre-release" on GitHub Releases. Note that update.electronjs.org serves the latest **stable** release, so betas either sit outside auto-update (fine for an early beta cohort of CLI power users) or you run `electron-updater` (electron-builder's updater), which supports named channels (`latest`/`beta` channel files) against GitHub Releases.
  - Tauri equivalent: point beta builds at a different updater endpoint/`latest.json`.
  - If ever fully native: [Sparkle 2 has first-class channels, phased rollouts, and critical-update flags](https://sparkle-project.org/documentation/publishing/).
- **Homebrew comes after traction, via a personal tap first.** homebrew-cask's [acceptable-casks policy](https://docs.brew.sh/Acceptable-Casks) has notability thresholds — for **self-submitted** casks the bar is roughly ≥90 forks / 90 watchers / 225 stars — so plan on `brew install <org>/tap/loredex-desktop` from your own tap at launch and a main-repo cask PR once the repo clears the bar.
- **Beta recruiting is free here:** the CLI's existing users are the exact beta cohort. A pinned GitHub Discussion + a line in the CLI changelog reaches them without any new channel.

---

## 5. Crash reporting + telemetry: opt-in crashes, no metrics at launch, radical documentation

Two precedents bracket the acceptable range for this audience:

- **The floor (what not to do): Audacity 2021.** Even *disabled-by-default* telemetry using Google/Yandex endpoints triggered community revolt and hostile forks; the [resolution the community accepted](https://github.com/audacity/audacity/discussions/889) was: **self-hosted Sentry** (EU), a per-crash consent dialog with a "view the full report before sending" option, and equally prominent send/don't-send buttons ([ghacks summary](https://www.ghacks.net/2021/05/16/audacity-drops-plans-to-introduce-telemetry/)).
- **The ceiling (what dev tools get away with): Zed.** Zed ships [diagnostics (crash) + metrics (usage) telemetry](https://zed.dev/docs/telemetry) — on by default but surfaced on the first-run welcome screen with one-toggle opt-out, split into two switches, with a public docs page enumerating exactly what's sent, using Sentry for crashes. Dev audiences tolerate this because it's disclosed at first run, trivially disableable, and precisely documented.

**Recommendation for loredex-desktop** — be closer to the Audacity settlement than the Zed default, because the product's substance is a team's *private knowledge vault*, which raises the sensitivity bar:

1. **Crash reporting: opt-in at first run** (one screen: "Send crash reports? [view a sample report]"), via Sentry. Sentry's [sponsored OSS plan](https://sentry.io/for/open-source/) is free for MIT-licensed projects with generous limits (5M errors/month), so cost is zero. Scrub paths/hostnames in the SDK config; never attach vault content.
2. **Usage metrics: none at launch.** If ever added, use [Aptabase](https://github.com/aptabase/aptabase) (MIT, self-hostable, explicitly no device IDs / cookies / fingerprinting, Tauri and Electron SDKs) as opt-in — its model is the most defensible to this audience.
3. **Write a `TELEMETRY.md`** in the repo enumerating every event, Zed-style. The document is itself trust marketing for this audience.
4. **Never route any telemetry through the vault** — the vault is the team's data plane; mixing product telemetry into it would be both a privacy smell and an F4-style contamination bug.

---

## 6. Docs + landing page conventions

- **The repo README is the real landing page** for the launch channels that matter here — HN launch guides are explicit that ["your repo is the landing page"](https://business.daily.dev/resources/hacker-news-marketing-developer-tools-show-hn-launch-day-sustained-coverage/). Priority one: a README with a 20–30s screen capture of the killer loop (handoff arrives → native notification → open brief → consume → sender sees it), install one-liner, and a security/privacy paragraph ("plain markdown in your git repo; no server; telemetry policy →").
- **Docs site: Astro Starlight** is the current default pick for new dev-tool docs in 2025/26 — built-in search, fastest builds, zero-JS by default; Docusaurus only wins if you need versioned docs (you don't yet), VitePress if you're a Vue shop ([framework comparison, 2026](https://www.pkgpulse.com/guides/best-documentation-frameworks-2026); [Distr's Docusaurus→Starlight migration](https://distr.sh/blog/distr-docs/) is a representative data point of the direction of travel).
- **One docs site for the whole ecosystem.** CLI, desktop app, and Obsidian plugin are one product story; a single domain with `/docs` sections per surface beats three READMEs, and it's where the "app vs CLI vs plugin — which do I need?" page lives (a page this ecosystem now genuinely needs).
- Host on GitHub Pages or Cloudflare Pages; both are free and standard for this audience.

---

## 7. First-launch marketing channels (dev-tools audience)

Sequenced, cheapest-first:

1. **Existing CLI users (week 0).** Pinned GitHub Discussion + changelog entry + a mention in `loredex doctor` output (informational, not nagging — dev audiences punish ads inside CLIs). This is the beta cohort.
2. **Claude Code ecosystem (week 0–1).** The plugin already ships in the CLI repo; the [community marketplace `anthropics/claude-plugins-community`](https://code.claude.com/docs/en/discover-plugins) (automated validation/safety screening) plus the community directories that index it are direct pipes to exactly the users who generate the markdown loredex files. r/ClaudeAI and X/Twitter threads showing the agent→vault→desktop-notification loop are the demo format that travels.
3. **Obsidian community (week 1–2).** The [forum's Share & showcase category](https://forum.obsidian.md/c/share-showcase/9), r/ObsidianMD, and the Obsidian Discord. **Positioning caution:** in these venues, do not lead with "replaces Obsidian." Lead with "your vault stays a plain Obsidian-compatible vault; this app manages the loredex layer (handoffs, sync, receipts) that Obsidian doesn't." The vault remaining Obsidian-openable is a feature; replacement framing invites hostility in the one community with the highest density of target users.
4. **Show HN (when the 5-pillar MVP is solid).** The [markepear playbook](https://www.markepear.dev/blog/dev-tool-hacker-news-launch): write it as a genuine experiment report, not an announcement; Tue–Thu 9:00–12:00 ET; the first 30–60 minutes of author engagement decide the outcome; never solicit upvotes (detection → shadowban). Expected upside for OSS dev tools: 5k–50k visits and roughly [1.4 GitHub stars per upvote](https://business.daily.dev/resources/hacker-news-marketing-developer-tools-show-hn-launch-day-sustained-coverage/). The loredex story is unusually HN-shaped: "Show HN: our AI agents write markdown; this turns a git repo of it into a team's handoff system — no server."
5. **Product Hunt: optional, later.** Practitioner comparisons consistently find PH converts worse than HN for developer tools ([lessons launching on HN vs PH](https://medium.com/@baristaGeek/lessons-launching-a-developer-tool-on-hacker-news-vs-product-hunt-and-other-channels-27be8784338b)); treat it as a backlink, not a launch.

---

## Recommended shipping stack (one screen)

| Decision | Pick | Why |
|---|---|---|
| Repo | `loredex-desktop`, sibling repo, same org | Cadence + secrets isolation; sibling pattern already proven by loredex-obsidian; lib API is the split-brain fix |
| Framework | Electron (MIT) | The engine is Node; Obsidian plugin proves it embeds; Tauri would need a Node sidecar that negates its size win |
| License | MIT (match CLI) | Entire dependency chain is permissive; ship third-party notices (Zed `legal/` pattern) |
| Signing | Developer ID + notarization, $99/yr | Sequoia killed the Gatekeeper bypass; mandatory in practice |
| Versioning | release-please (already in use) + tag-triggered signed-build workflow | Changesets fights binary artifacts; consistency across repos |
| Updates | update.electronjs.org (free for OSS) stable; electron-updater beta channel later | Zero-cost, standard |
| Beta | GitHub pre-releases + CLI-user cohort; **not** TestFlight (App Store/sandbox-only track) | Sandbox is incompatible with a git-spawning vault manager |
| Telemetry | Opt-in Sentry crashes (sponsored OSS plan), no metrics at launch, TELEMETRY.md | Audacity floor + Zed documentation norm; vault products carry extra sensitivity |
| Docs | Starlight on one ecosystem docs site; README-as-landing-page first | 2025/26 default for dev-tool docs |
| Launch | CLI users → Claude Code channels → Obsidian Share & showcase → Show HN | Cheapest-first; HN is the main event |
| Homebrew | Personal tap at launch; main cask after ~225 stars | homebrew-cask notability thresholds for self-submitted apps |

## Risks

1. **Engine/app drift across sibling repos** recreates a soft version of F6 — mitigated only if the app pins the engine version, resolves config exactly once through the lib, and displays engine+vault identity in the chrome.
2. **update.electronjs.org requires a public repo and signed builds from day one** — if the app repo starts private during early development, auto-update can't be dogfooded until it flips public.
3. **No TestFlight means beta infra is entirely on you** — pre-release hygiene (marking releases, channel separation) is manual discipline for a solo maintainer.
4. **Telemetry missteps are existential with this audience** (Audacity forks); the opt-in-crashes/no-metrics stance costs product insight in exchange for trust.
5. **Apple pipeline fragility**: notarization service stalls (documented hour-long hangs in Tauri discussions) and annual cert renewal are single-maintainer bus-factor items; script and document the pipeline.
6. **Homebrew notability gate** delays the lowest-friction install path until the repo has stars — the personal-tap URL is uglier in launch posts.
7. **Electron's download size will draw HN snark**; the counter is honest framing (the audience already runs Obsidian/VS Code) — but if a Swift/native rewrite is ever on the table, Sparkle (MIT, channels, phased rollouts) keeps that door open.

## Sources

- [Zed repository — crates/ workspace structure](https://github.com/zed-industries/zed/tree/main/crates)
- [n8n-io/n8n-desktop-app (archived separate-repo desktop wrapper)](https://github.com/n8n-io/n8n-desktop-app)
- [gitbutlerapp/gitbutler — production Tauri app, internal monorepo](https://github.com/gitbutlerapp/gitbutler)
- [Tauri v2 vs Electron 2026 comparison](https://www.buildmvpfast.com/blog/tauri-v2-vs-electron-desktop-apps-2026)
- [Sparkle project — MIT-licensed macOS update framework, channels/phased rollouts](https://sparkle-project.org/documentation/publishing/) and [GitHub](https://github.com/sparkle-project/Sparkle)
- [Apple — TestFlight (macOS support, App Store Connect requirement, tester limits)](https://developer.apple.com/testflight/)
- [Apple — Distributing your app for beta testing and releases](https://developer.apple.com/documentation/xcode/distributing-your-app-for-beta-testing-and-releases)
- [Apple — Developer ID signing](https://developer.apple.com/developer-id/) and [Sequoia Gatekeeper changes](https://developer.apple.com/news/?id=saqachfa)
- [update.electronjs.org — free update service for open-source Electron apps](https://github.com/electron/update.electronjs.org) and [update-electron-app](https://github.com/electron/update-electron-app)
- [tauri-apps/tauri-action — build/sign/upload + updater latest.json](https://github.com/tauri-apps/tauri-action) and [Tauri macOS code signing docs](https://v2.tauri.app/distribute/sign/macos/)
- [Shipping a Tauri v2 app: signing (part 1)](https://dev.to/tomtomdu73/ship-your-tauri-v2-app-like-a-pro-code-signing-for-macos-and-windows-part-12-3o9n) and [release automation (part 2)](https://dev.to/tomtomdu73/ship-your-tauri-v2-app-like-a-pro-github-actions-and-release-automation-part-22-2ef7)
- [Changesets — binary artifact friction: discussion #1086](https://github.com/changesets/changesets/discussions/1086) and [#1503](https://github.com/changesets/changesets/discussions/1503)
- [release-please automation writeup](https://totaldebug.uk/posts/ditch-the-manual-chore-automating-releases-and-versions/)
- [Homebrew — Acceptable Casks (notability thresholds)](https://docs.brew.sh/Acceptable-Casks)
- [Zed telemetry docs (diagnostics vs metrics, first-run disclosure, Sentry)](https://zed.dev/docs/telemetry)
- [Audacity telemetry resolution — discussion #889](https://github.com/audacity/audacity/discussions/889) and [ghacks summary](https://www.ghacks.net/2021/05/16/audacity-drops-plans-to-introduce-telemetry/)
- [Sentry for Open Source (sponsored free plan)](https://sentry.io/for/open-source/)
- [Aptabase — open-source privacy-first app analytics (Tauri/Electron SDKs)](https://github.com/aptabase/aptabase)
- [Best documentation frameworks 2026 (Starlight vs Docusaurus vs VitePress)](https://www.pkgpulse.com/guides/best-documentation-frameworks-2026) and [Distr's move to Starlight](https://distr.sh/blog/distr-docs/)
- [How to launch a dev tool on Hacker News (markepear)](https://www.markepear.dev/blog/dev-tool-hacker-news-launch) and [daily.dev HN marketing guide](https://business.daily.dev/resources/hacker-news-marketing-developer-tools-show-hn-launch-day-sustained-coverage/)
- [HN vs Product Hunt for dev tools](https://medium.com/@baristaGeek/lessons-launching-a-developer-tool-on-hacker-news-vs-product-hunt-and-other-channels-27be8784338b)
- [Claude Code — discover and install plugins through marketplaces](https://code.claude.com/docs/en/discover-plugins)
- [Obsidian Forum — Share & showcase](https://forum.obsidian.md/c/share-showcase/9)
