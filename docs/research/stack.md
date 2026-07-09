# Framework Choice for Loredex Desktop (macOS, Apple Silicon)

**Research date:** 2026-07-09. Lens: which desktop framework best ships a native-feeling macOS (arm64-first) app whose core logic is the existing TypeScript npm library `loredex` v2.0.0 — a Node-only library (`node:fs`, `node:child_process` for git, `gray-matter`; ESM, `engines: node >= 20`) that is **not** browser-safe. Candidates compared: Electron, Tauri v2, Swift/SwiftUI (+ JS core), Flutter desktop.

**TL;DR ranked recommendation:**

1. **Electron** — recommended. The loredex core runs unmodified in the main process; every MVP pillar maps to a first-class Electron API; solo-maintainer velocity is unmatched; Obsidian (the app being replaced), Linear, and Claude Desktop all validate the choice. The cost is footprint (~200–250 MB installed, 2–3× Tauri's RAM) — acceptable for an app whose users' current baseline *is* Electron (Obsidian).
2. **Tauri v2** — strong second. Wins decisively on footprint and native WKWebView, but the Node-only core forces a Node sidecar: a two-runtime architecture (Rust host + packaged Node binary + webview) with real packaging friction, and the ~90 MB Node runtime erases most of Tauri's headline size advantage for *this* codebase.
3. **Swift/SwiftUI + Node sidecar** — best possible native feel (the Raycast path), but it doubles the codebase in a second language for a solo maintainer and reuses none of the web-rendering work; JavaScriptCore cannot host the core at all.
4. **Flutter desktop** — eliminated. Zero leverage of the TS core, weakest macOS webview/markdown story (Google discontinued `flutter_markdown`), custom-rendered non-native UI.

---

## 1. The deciding constraint: the core is a Node library, not a JS library

This decision is not "Electron vs Tauri in general." It is: *where does `loredex`'s ~23-function lib surface (createLoredexMcpServer, buildDashboard, gitPullPush, routing, search, handoffs) execute?* The library shells out to git via `node:child_process`, walks vaults via `node:fs`, and parses frontmatter with `gray-matter`. It needs a real Node runtime.

The simulation adds a product-level constraint on top: **F6 (MCP-vs-CLI vault split-brain) was called "the single most dangerous failure mode observed."** `DESKTOP-APP-FEATURES.md` open question #5 concludes the app must be "a single shared engine with the config resolution done exactly once." So the app shouldn't shell out to the CLI — it should *embed the library* and ideally host the same MCP server the loredex-obsidian plugin already hosts over Streamable HTTP (which proves the core embeds cleanly inside another app's process today).

How each framework satisfies "embed a Node core":

| Framework | Node core placement | Integration cost |
|---|---|---|
| **Electron** | In-process: the main process **is** Node (Electron 43.x ships Node 24.x, [releases.electronjs.org](https://releases.electronjs.org/)); `utilityProcess` available if isolation is wanted | `import { createLoredexMcpServer } from "loredex"` — zero packaging work, full `node:*` support, ESM fine |
| **Tauri v2** | Out-of-process **sidecar binary**: Tauri "doesn't embed any node runtime; your only solution would be to package your node app with pkg or something similar and then use it as a sidecar" ([Tauri discussion #7037](https://github.com/tauri-apps/tauri/discussions/7037); official guide: [Node.js as a sidecar](https://v2.tauri.app/learn/sidecar-nodejs/)) | Compile loredex + a small RPC/HTTP server into a self-contained binary, name it per target triple (`…-aarch64-apple-darwin`), talk to it over stdio or localhost HTTP ([Embedding External Binaries](https://v2.tauri.app/develop/sidecar/)) |
| **Swift/SwiftUI** | Same sidecar approach, but hand-rolled: launch via `Process`, manage lifecycle, RPC yourself. **JavaScriptCore is not an option**: it "provides no webpage, UI or DOM" and no Node APIs — it only runs browserified/pure-JS bundles ([Douglas Hill](https://douglashill.co/javascript-in-swift/), [Apple dev forums](https://developer.apple.com/forums/thread/697301)); `node:fs`/`child_process` code cannot be browserified | Highest: sidecar plumbing *plus* an entire second-language UI codebase |
| **Flutter** | Same hand-rolled sidecar via `Process.start` | Same as Swift, plus Dart |

**Sidecar packaging reality (matters for Tauri/Swift/Flutter):** the classic tool `vercel/pkg` is archived/deprecated; the maintained path is the `@yao-pkg/pkg` fork or Node's built-in **Single Executable Applications**. SEA is finally getting first-class treatment — the build process moved into Node core with a `--build-sea` flag ([Joyee Cheung, Jan 2026](https://joyeecheung.github.io/blog/2026/01/26/improving-single-executable-application-building-for-node-js/); [Node SEA docs](https://nodejs.org/api/single-executable-applications.html)) — but the injected main script **must be CommonJS**, so ESM-only loredex (`"type": "module"`, tsup `format: esm`) needs an extra esbuild-to-CJS bundling step, and the resulting arm64 binary carries the full Node runtime (~85–110 MB uncompressed). The Tauri docs themselves concede the embedded-runtime route "ships the JavaScript content as readable-ish files and the runtime is usually larger than a pkg packaged application" ([Tauri Node sidecar guide](https://v2.tauri.app/learn/sidecar-nodejs/)). Evil Martians' Tauri+sidecar writeup shows the pattern works well in production, but as a deliberate architecture with an IPC seam, not a free lunch ([Evil Martians](https://evilmartians.com/chronicles/making-desktop-apps-with-revved-up-potential-rust-tauri-sidecar)).

**Consequence:** Tauri's famous "2–10 MB app" number does not apply here. A Tauri loredex app is *Tauri (~8 MB) + Node sidecar (~90 MB) + IPC layer*, i.e. a ~100 MB app with two runtimes and a process boundary through the middle of every feature — while Electron is a ~250 MB app with **one** runtime and zero boundary.

---

## 2. Footprint on Apple Silicon (honest numbers)

Best current measured comparison (Hopp's April 2025 benchmark, identical app both ways, [gethopp.app](https://www.gethopp.app/blog/tauri-vs-electron)):

- **Bundle:** Tauri 8.6 MiB vs Electron 244 MiB
- **Memory (6 windows):** Tauri ~172 MB vs Electron ~409 MB
- **Startup:** negligible difference — "basing a framework decision solely on startup time is likely overthinking it"
- **Dev build time:** Electron ~16 s vs Tauri ~81 s (Rust compilation)

Corroborating real-world migration: Hoppscotch went Electron → Tauri, 165 MB → 8 MB bundle, ~70 % less memory ([thinkthroo Hoppscotch analysis](https://thinkthroo.com/blog/tauri-in-hoppscotch-codebase); aggregate 2026 comparisons: [PkgPulse](https://www.pkgpulse.com/guides/electron-vs-tauri-2026)). Note Hoppscotch's core is browser-safe web code — the case where Tauri shines and the opposite of loredex's situation.

arm64 maturity is a non-issue for either: Electron has shipped native Apple Silicon builds since v11 (2020) and universal binaries via electron-builder; Tauri targets `aarch64-apple-darwin` natively and its ecosystem (v2.11.5 as of July 2026, [Tauri releases](https://v2.tauri.app/release/)) is stable. Swift is trivially native; Flutter macOS arm64 is stable.

**Is ~400 MB RAM disqualifying?** For this product, no: the app replaces **Obsidian, itself an Electron app** — the target user's current memory baseline. Loredex Desktop is a persistent workspace (vault browser, inbox, activity feed), not a 50-ms-latency launcher. Where footprint genuinely stings is the *menu-bar-extra always-running* pattern; mitigation is keeping one window + tray rather than many windows, or (later) a tiny separate helper.

---

## 3. Native look-and-feel on macOS

What the MVP needs: traffic lights on a custom-styled window, vibrancy/translucency, a menu bar extra (tray) with badge counts, and **native notifications** (two of the five MVP pillars — new-handoff and consumed-handoff notifications — are notification features).

- **Electron:** all first-class: `titleBarStyle: 'hiddenInset'` for inset traffic lights, `vibrancy`/`backgroundMaterial` on `BrowserWindow`, `Tray` for the menu bar extra, `Notification` bridging to UNUserNotificationCenter (needs signing to display — see §4). Linear and Obsidian demonstrate the achievable polish ceiling; the [May 2026 audit of famous Electron apps](https://codenote.net/en/posts/famous-electron-apps-2026-research/) confirms VS Code, Slack, Discord, Notion, Obsidian, **Linear**, Figma Desktop, ChatGPT-for-Windows, Codex Desktop and **Claude Desktop** all still ship Electron, with the stated rationale (Anthropic's Boris Cherny): "sharing code so we're guaranteed that features across web and desktop have the same look and feel."
- **Tauri v2:** achievable but more assembly: `TrayIconBuilder` + `tauri-plugin-positioner` for the menu bar app, the `window-vibrancy` crate (requires the `macos-private-api` feature flag for some materials), notification plugin, and traffic-light inset positioning still needs community plugins or raw `objc2` code ([menu-bar guide](https://dev.to/hiyoyok/complete-guide-to-building-a-macos-menu-bar-app-with-tauri-v2-aji), [tauri#4789](https://github.com/tauri-apps/tauri/issues/4789), [window customization docs](https://v2.tauri.app/learn/window-customization/)). Upside: WKWebView renders with macOS-native text/scrolling physics and no bundled Chromium.
- **SwiftUI:** the ceiling. Raycast's deep dive explains why they went native Swift/AppKit — global hotkeys, non-activating floating panels, accessibility APIs, "control of every part of the stack" — and notes they evaluated Tauri and found it "too young… giving less control on the native side"; notably even Raycast renders extensions with a **shared React frontend in a web view** ([Raycast blog](https://www.raycast.com/blog/a-technical-deep-dive-into-the-new-raycast)). But loredex Desktop needs none of Raycast's exotic native surface (no global overlay panels, no accessibility hooks) — the MVP's hard UI problems (rendered markdown, resolved wikilinks, diff views, graphs, faceted search) are *web-rendering* problems.
- **Flutter:** weakest fit. Everything is Skia/Impeller-custom-rendered, so "native feel" must be imitated; menu bar/tray via third-party packages; and the markdown story regressed — Google **discontinued `flutter_markdown`**, now community-maintained as `flutter_markdown_plus` ([pub.dev](https://pub.dev/packages/flutter_markdown_plus)); desktop webview coverage on macOS is patchy ([Flutter desktop docs](https://docs.flutter.dev/platform-integration/desktop)). Flutter desktop's sweet spot is "you already have a Flutter mobile codebase" — loredex has a TS codebase instead. (The Android companion in the feature spec is v-later, read-only, and explicitly a thin client over MCP — it does not justify Flutter on desktop.)

---

## 4. Signing, notarization, updates (solo OSS maintainer)

Both leading options are solved; Tauri's is slightly more turnkey, Electron's is more documented.

- **Electron:** electron-builder handles Developer ID signing with `hardenedRuntime: true` + entitlements and notarizes in CI ([electron-builder notarization](https://www.electron.build/docs/notarization/), [Electron code-signing tutorial](https://www.electronjs.org/docs/latest/tutorial/code-signing)). Auto-update via `electron-updater` against plain GitHub Releases, or Electron's free `update.electron.app` service for public repos; signing is mandatory for updates on macOS.
- **Tauri v2:** `tauri build` signs and **notarizes automatically** given env-var credentials ([macOS signing docs](https://v2.tauri.app/distribute/sign/macos/)); the updater plugin uses a mandatory minisign-style keypair and works off a static `latest.json` on GitHub Releases ([updater plugin](https://v2.tauri.app/plugin/updater/)) — an excellent zero-infra story for OSS. Caveat for this project: the updater updates the *app bundle*; the Node sidecar rides along inside it, so every core bugfix ships a full ~100 MB update.
- **Swift:** manual — Xcode signing + [Sparkle](https://sparkle-project.org/) for updates; well-trodden but all hand-assembled.
- **Flutter:** no first-party desktop updater; you integrate Sparkle yourself.

Apple Developer Program ($99/yr) is required in all four cases.

---

## 5. Developer velocity for a solo OSS maintainer

- **Electron:** one language (TypeScript), one package manager, one test runner (vitest already in loredex), instant `import` of the core, shared types end-to-end (`dist/lib.d.ts` flows into the renderer via typed IPC), fast iteration via electron-vite HMR. The UI layer could even share components with the loredex-obsidian plugin's web surface. Risk budget: keeping up with Electron's 8-week major cadence and Chromium security patches — routine, automatable with dependabot.
- **Tauri v2:** Rust host code is thin if all logic stays in the sidecar, but the maintainer now owns: a Rust toolchain, tauri.conf capabilities/permissions, sidecar build pipeline (esbuild → CJS → SEA/pkg per-arch), an RPC protocol between three contexts (webview ↔ Rust ↔ Node), and WKWebView quirks (Safari-not-Chromium rendering — the [Hopp post](https://www.gethopp.app/blog/tauri-vs-electron) flags cross-webview inconsistencies as the main DX tax). Each MVP feature (route receipt, consume action, sync health) crosses the process boundary twice.
- **Swift:** two full codebases (SwiftUI app + Node sidecar), two languages, no shared types without codegen. For a solo maintainer also shipping the CLI, npm lib, and Obsidian plugin, this is the velocity worst case with the highest polish ceiling.
- **Flutter:** two languages *and* the weakest ecosystem fit; nothing about this project plays to Flutter's strengths.

---

## 6. What comparable products chose

| Product | Stack | Relevance |
|---|---|---|
| **Obsidian** | Electron | The app loredex Desktop replaces; proves Electron handles a markdown-vault workspace at scale ([codenote audit, May 2026](https://codenote.net/en/posts/famous-electron-apps-2026-research/)) |
| **Linear** | Electron | The polish bar for "native-feeling" dev-tool Electron apps |
| **Claude Desktop / Codex Desktop / ChatGPT-for-Windows** | Electron | 2025–26-era AI desktop apps still choosing Electron for web/desktop code sharing |
| **VS Code, Slack, Discord, Notion, Figma Desktop** | Electron | Staying, with published optimization patterns (V8 snapshots, process consolidation) |
| **Hoppscotch, AppFlowy, Spacedrive, Padloc** | Tauri v2 | Tauri is production-proven — when the core is browser-safe web code or Rust ([awesome-tauri](https://github.com/tauri-apps/awesome-tauri)) |
| **Raycast** | Native Swift/AppKit (+ React in a webview for extensions) | Chose native for launcher-class OS integration loredex doesn't need; explicitly rejected Tauri as immature for their control needs ([Raycast blog](https://www.raycast.com/blog/a-technical-deep-dive-into-the-new-raycast)) |
| **Zed** | Rust + custom GPUI | The other end of the spectrum: latency-obsessed editor, VC-funded team — not a solo-maintainer pattern |
| **Microsoft Teams** | Left Electron → WebView2 (134 MiB → ~12 MiB installer) | The credible "leaving Electron" story is Windows-specific (WebView2) and team-sized |

Pattern: teams whose value lives in web-rendered content and shared TS code stay on (or choose) Electron; teams whose core is Rust/browser-safe pick Tauri; teams selling OS-integration-as-the-product go native.

---

## 7. Feature-by-feature sanity check against the MVP cut line

| MVP pillar (DESKTOP-APP-FEATURES.md) | Electron | Tauri v2 |
|---|---|---|
| Vault reader: rendered markdown, wikilinks, faceted search | Chromium + loredex search in-process | WKWebView + search calls over sidecar RPC |
| Handoff inbox/outbox + consume with identity | lib calls in main process; typed IPC | sidecar RPC |
| Native notifications (new/consumed handoff) | `new Notification()` (signed app) | notifications plugin |
| Route receipts, drift badges, never-route globs | `fs.watch`/chokidar + lib, same process | file-watcher plugin in Rust **or** watcher in sidecar — split-brain risk reappears |
| Create-or-join wizard + GitHub OAuth + sync health | `child_process` git via lib; OAuth in main | git must run in sidecar (Rust `git2` would fork the logic — avoid) |
| Vault identity badge / single-engine guarantee (F6) | one process, one config resolution, can host the same Streamable-HTTP MCP server the Obsidian plugin proved | achievable, but engine state lives across a process boundary from the UI |
| Activity feed from vault git history | lib + `git log` in-process | sidecar RPC |

Every row is "direct call" on Electron and "RPC to sidecar" on Tauri. None is impossible on Tauri; all are slower to build and debug.

---

## 8. Recommendation

**Build Loredex Desktop on Electron (electron-vite + electron-builder, universal or arm64-first binaries), with the loredex library imported directly in the main process and the MCP server optionally hosted in-process over Streamable HTTP — making the app the single engine that kills F6 by construction.**

Ranked:

1. **Electron** — only option where the existing core is a zero-cost dependency; one-language velocity for a solo maintainer; every MVP pillar first-class; the replaced incumbent (Obsidian) and the polish benchmark (Linear) prove the category. Accept the ~250 MB / ~2.5× RAM tax and mitigate (single window + tray, lazy renderer views, V8 snapshots later if needed).
2. **Tauri v2** — revisit if (a) the core ever gets a Rust or browser-safe port, or (b) a standalone lightweight menu-bar companion is split out later; Tauri would be ideal for *that* smaller artifact. As the main app today it means two runtimes, a packaging pipeline for an ESM-only core that SEA doesn't natively accept, and an IPC seam through every feature.
3. **Swift/SwiftUI + Node sidecar** — the right call only if macOS-native fidelity becomes the product's differentiator and the project gains contributors; today it doubles the surface area for one person.
4. **Flutter desktop** — no reuse, discontinued first-party markdown renderer, non-native rendering; eliminated.

**Decision triggers to re-evaluate:** loredex core rewritten browser-safe or in Rust; user complaints about memory from the always-on tray presence; the Android companion graduating from v-later (it would be a thin MCP client, buildable in anything — still not a reason to pick Flutter on desktop).

---

## Sources

1. [Node.js as a sidecar — Tauri v2 official docs](https://v2.tauri.app/learn/sidecar-nodejs/)
2. [Embedding External Binaries — Tauri v2 official docs](https://v2.tauri.app/develop/sidecar/)
3. [Can Node be used in Tauri — tauri-apps discussion #7037](https://github.com/tauri-apps/tauri/discussions/7037)
4. [Tauri vs. Electron: performance, bundle size, and the real trade-offs — Hopp engineering blog (Apr 2025, measured benchmark)](https://www.gethopp.app/blog/tauri-vs-electron)
5. [A 2026 Audit of Famous Electron Apps — codenote.net (May 2026)](https://codenote.net/en/posts/famous-electron-apps-2026-research/)
6. [A Technical Deep Dive Into the New Raycast — Raycast blog](https://www.raycast.com/blog/a-technical-deep-dive-into-the-new-raycast)
7. [Improving Single Executable Application Building for Node.js — Joyee Cheung (Jan 2026)](https://joyeecheung.github.io/blog/2026/01/26/improving-single-executable-application-building-for-node-js/)
8. [Single executable applications — Node.js official docs](https://nodejs.org/api/single-executable-applications.html)
9. [Making desktop apps with Rust + Tauri + sidecar — Evil Martians](https://evilmartians.com/chronicles/making-desktop-apps-with-revved-up-potential-rust-tauri-sidecar)
10. [Updater plugin — Tauri v2 official docs](https://v2.tauri.app/plugin/updater/)
11. [macOS Code Signing — Tauri v2 official docs](https://v2.tauri.app/distribute/sign/macos/)
12. [macOS Notarization — electron-builder docs](https://www.electron.build/docs/notarization/)
13. [Code Signing — Electron official tutorial](https://www.electronjs.org/docs/latest/tutorial/code-signing)
14. [Electron Releases (v43.x, July 2026; Node 24.x, Chromium 150)](https://releases.electronjs.org/)
15. [Tauri Core Ecosystem Releases (2.11.5, July 2026)](https://v2.tauri.app/release/)
16. [Tauri in Hoppscotch codebase (165 MB → 8 MB migration) — thinkthroo](https://thinkthroo.com/blog/tauri-in-hoppscotch-codebase)
17. [awesome-tauri — production Tauri apps list](https://github.com/tauri-apps/awesome-tauri)
18. [Complete Guide to Building a macOS Menu Bar App with Tauri v2 — dev.to](https://dev.to/hiyoyok/complete-guide-to-building-a-macos-menu-bar-app-with-tauri-v2-aji)
19. [Native inset traffic lights on NSWindow — tauri#4789](https://github.com/tauri-apps/tauri/issues/4789)
20. [Window Customization — Tauri v2 docs](https://v2.tauri.app/learn/window-customization/)
21. [Electron vs Tauri 2026: Bundle Size, RAM, Security and Team Fit — PkgPulse](https://www.pkgpulse.com/guides/electron-vs-tauri-2026)
22. [Desktop support for Flutter — official docs](https://docs.flutter.dev/platform-integration/desktop)
23. [flutter_markdown_plus (community continuation of discontinued Google package) — pub.dev](https://pub.dev/packages/flutter_markdown_plus)
24. [Using JavaScript in a Swift app (JavaScriptCore limits) — Douglas Hill](https://douglashill.co/javascript-in-swift/)
25. [Using an npm package via JavaScriptCore — Apple Developer Forums](https://developer.apple.com/forums/thread/697301)
