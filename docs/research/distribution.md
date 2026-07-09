# macOS Distribution Outside the App Store — Loredex Desktop

Research date: 2026-07-09. Scope: everything needed to ship a signed, notarized, auto-updating macOS desktop app (Apple Silicon first) from GitHub Releases + Homebrew, where the app reads arbitrary user folders (the vault, registered repos), shells out to git, and binds a localhost HTTP port (the embedded loredex MCP server, as the Obsidian plugin already does).

**Bottom line up front:** budget $99/year for the Apple Developer Program, sign with a Developer ID Application certificate + hardened runtime, notarize with `notarytool` in CI, ship a **stapled DMG as the human download** (plus a ZIP if the update framework needs one), go **arm64-only** (macOS 26 "Tahoe" is the last Intel release and only 4 Intel Macs run it), and automate the whole pipeline on GitHub Actions `macos-latest` (arm64) runners. None of the app's three sensitive behaviors (folder reads, git subprocess, localhost port) needs a restricted entitlement in a non-sandboxed app — they need TCC-consent UX design instead.

---

## 1. Apple Developer Program: the non-negotiable $99/year

- Distributing outside the Mac App Store still requires a paid [Apple Developer Program](https://developer.apple.com/programs/) membership: **USD 99/year** (fee waivers exist only for nonprofits/edu/government). This is what unlocks the **Developer ID Application** certificate.
- [Developer ID](https://developer.apple.com/developer-id/) is the signing identity Gatekeeper trusts for apps downloaded from the web. Notarization itself is **free** — no per-submission cost ([Apple: Notarizing macOS software before distribution](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)).
- Practical org note: Developer ID certificates can only be created by the **Account Holder** role. For an OSS project, decide early whether the cert belongs to a personal account or an org account — the team name is what users see in the Gatekeeper dialog ("Loredex" vs a person's legal name).
- **Why you can't skip it in 2025/26:** macOS 15 Sequoia (Sept 2024) **removed the Control-click → Open bypass** for unsigned/un-notarized apps. Users must now dig into System Settings → Privacy & Security → "Open Anyway" per app ([AppleInsider](https://appleinsider.com/articles/24/08/06/apple-removes-control-click-option-for-skipping-gatekeeper-in-macos-sequoia), [Michael Tsai](https://mjtsai.com/blog/2024/07/05/sequoia-removes-gatekeeper-contextual-menu-override/)). For a team-onboarding product whose whole pitch is "the DevOps lead rolls this out to 12 engineers," an unsigned build is dead on arrival. Homebrew's main cask repo also **rejects apps that fail with Gatekeeper enabled** ([Acceptable Casks](https://docs.brew.sh/Acceptable-Casks)) — see §7.

## 2. Code signing with Developer ID

Ground rules that survive cross-checking (Apple docs + [rsms's distribution guide](https://gist.github.com/rsms/929c9c2fec231f0cf843a1a746a416f5) + Electron/Tauri tooling docs):

- Sign with the **Developer ID Application** certificate (`security find-identity -v -p codesigning` to list), with a **secure timestamp** (`--timestamp`) and **hardened runtime** (`--options runtime`) — both are notarization prerequisites.
- **Sign inside-out (bottom-up), never `--deep`.** Every nested Mach-O — helpers, frameworks, `.node` native modules, bundled CLI binaries (git, node, ripgrep, whatever) — must be individually signed *first*, then the outer `.app` last. `codesign --deep` is officially discouraged and produces cryptic notarization failures; Apple's own guidance is "sign each code item separately" ([Resolving common notarization issues](https://developer.apple.com/documentation/security/resolving-common-notarization-issues)). Electron/Tauri bundlers do the inside-out walk for you for binaries they know about, but **not** for arbitrary files you drop into `Resources/`.
- Executables must live in the right bundle locations (`Contents/MacOS`, `Contents/Frameworks`, `Contents/Helpers`) — a Mach-O hiding in `Contents/Resources` is a classic notarization rejection.
- Verify locally with `codesign -vvv --deep --strict Loredex.app` and `spctl -a -vv Loredex.app` before ever submitting (`--deep` is fine for *verification*, just not signing).

## 3. Notarization: notarytool + hardened runtime + stapling

- **Tooling:** `xcrun notarytool` is the only supported CLI since `altool` was shut down (Nov 2023). Store credentials once — `xcrun notarytool store-credentials <profile> --apple-id <email> --team-id <TEAM> --password <app-specific-password>` — or use an App Store Connect **API key** (better for CI; no password rotation). Submit with `xcrun notarytool submit Loredex.dmg --keychain-profile <profile> --wait` ([Apple docs](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution), [notarytool guide](https://tonygo.tech/blog/2023/notarization-for-macos-app-with-notarytool)).
- **Requirements:** Developer ID signature on *all* nested code, hardened runtime on every executable, secure timestamps, no `get-task-allow`. Missing hardened runtime fails with "The executable does not have the hardened runtime enabled."
- **What you can submit:** `.zip`, `.dmg`, or `.pkg`. Typical turnaround is 2–5 minutes, occasionally 15–20 ([Tauri shipping guide](https://dev.to/tomtomdu73/ship-your-tauri-v2-app-like-a-pro-github-actions-and-release-automation-part-22-2ef7)) — CI must poll with a generous timeout.
- **Stapling:** `xcrun stapler staple Loredex.app` / `... Loredex.dmg` attaches the ticket so Gatekeeper passes **offline**. Two gotchas:
  - **You cannot staple a ZIP.** Notarize the zip, then staple the `.app` inside it, then **re-zip for distribution** ([Apple Developer Forums](https://developer.apple.com/forums/thread/115670), [Omnis technote](https://www.technotes.omnis.net/Technical%20Notes/Deployment/macOS%20notarization/3.Stapling%20notarised%20app.html)). DMGs staple directly — one more reason DMG is the primary artifact.
  - **Zip with `ditto -c -k --keepParent`, never `zip -qr`.** macOS `zip` normalizes UTF-8 NFD→NFC filenames, which desyncs the archive from the signed bundle and yields "The signature of the binary is invalid" ([christarnowski.com](https://christarnowski.com/making-notarization-work-on-macos-for-electron-apps-built-with-electron-builder/), [electron/notarize#97](https://github.com/electron/notarize/issues/97)).
- Also noted in [rsms's guide](https://gist.github.com/rsms/929c9c2fec231f0cf843a1a746a416f5): `notarytool` has been observed exiting 0 on some failures — parse the submission status ("Accepted"), don't trust the exit code alone; on rejection pull the log with `notarytool log <submission-id>`.

## 4. Entitlements for what Loredex Desktop actually does

Assume a **non-sandboxed** app (App Sandbox is optional outside the App Store, and a vault manager that reads arbitrary repos + runs git is a poor sandbox fit). Then:

| Need | Entitlement required? | What actually gates it |
|---|---|---|
| Read/write arbitrary user folders (vault, repos) | **None** | **TCC prompts**, not entitlements. Desktop/Documents/Downloads, iCloud Drive, network volumes and removable media are TCC-protected; first access triggers a per-app consent dialog, recorded per location ([Eclectic Light on TCC](https://eclecticlight.co/2025/11/08/explainer-permissions-privacy-and-tcc/)). Add the polite `NS*FolderUsageDescription` strings (Documents/Desktop/Downloads) to Info.plist so prompts carry your reason. Best practice: make the user pick the vault folder via `NSOpenPanel` (open/save panels grant access without a TCC prompt) and store a bookmark; do **not** tell users to grant Full Disk Access ([Files & Folders vs FDA](https://eclecticlight.co/2026/04/08/privacy-files-folders-or-full-disk-access/)). |
| Spawn git / node subprocesses | **None** for a non-sandboxed app | Child processes inherit the app's TCC identity (the "responsible process"), so git touching `~/Documents` prompts *as Loredex* — good. If you **bundle** a git or node binary, it must be signed + hardened-runtime like everything else (§2). Shelling to the system git (`/usr/bin/git`, Xcode CLT) avoids that but adds an install dependency; libgit2/isomorphic-git avoids the subprocess entirely. |
| Bind a localhost HTTP port (MCP server) | **None** | `com.apple.security.network.server` is a *sandbox* entitlement — irrelevant unsandboxed. macOS 15+'s **Local Network** privacy prompt targets LAN traffic, not loopback; binding/serving on 127.0.0.1 should not trigger it, though buggy prompts on localhost were widely reported in early Sequoia ([Michael Tsai roundup](https://mjtsai.com/blog/2024/10/02/local-network-privacy-on-sequoia/)). Bind explicitly to `127.0.0.1` (not `0.0.0.0`) — avoids the prompt class entirely and is the right security posture for an MCP endpoint anyway. |
| JS runtime (hardened runtime exceptions) | **Depends on stack** | Electron: `com.apple.security.cs.allow-jit` is required for V8; `allow-unsigned-executable-memory` is legacy (Electron ≤11) and should be dropped on modern Electron ([electron-builder notarization docs](https://www.electron.build/docs/features/code-signing/notarization/), [Electron Forge signing guide](https://www.electronforge.io/guides/code-signing/code-signing-macos)). A **bare Node binary sidecar** (e.g., Tauri + node) needs `allow-jit` *and* `allow-unsigned-executable-memory` signed onto the node binary itself, plus `disable-library-validation` if it loads unsigned `.node` addons. Pure Tauri/Swift with no JS engine: **zero** extra entitlements. |

Keep the entitlements file minimal — every `com.apple.security.cs.*` exception widens the attack surface and gets scrutinized in security reviews of an OSS repo.

## 5. arm64-only vs universal2 in mid-2026: Intel is no longer worth shipping

The question is effectively settled by Apple's 2025–2026 announcements:

- **macOS 26 "Tahoe" (2025) is the final macOS for Intel**, and it supports only **four** Intel models (2019 Mac Pro, 2019 16" MBP, 2020 13" MBP 4×TB3, 2020 27" iMac). macOS 27 (announced for late 2026) is Apple Silicon-only ([Wikipedia: macOS Tahoe](https://en.wikipedia.org/wiki/MacOS_Tahoe), [TechPowerUp](https://www.techpowerup.com/348408/end-of-an-era-macos-27-drops-support-for-intel-based-macs)).
- **Rosetta 2 itself sunsets after macOS 27** — Apple said at WWDC25 it remains available only through macOS 27 ([Production Expert](https://www.production-expert.com/production-expert-1/intel-mac-users-apple-gives-12-month-countdown)).
- **GitHub retired Intel CI**: `macos-13` died Dec 4 2025; `macos-15-intel` is the *last* x86_64 image and disappears **August 2027** ([GitHub Changelog](https://github.blog/changelog/2025-09-19-github-actions-macos-13-runner-image-is-closing-down/), [runner-images #13045](https://github.com/actions/runner-images/issues/13045)).
- Universal binaries roughly **double the app size** (two slices of Electron/Chromium is brutal — even with `@electron/universal`'s `mergeASARs` you carry two native runtimes) ([electron/universal](https://github.com/electron/universal), [electron-builder arch docs](https://www.electron.build/docs/architecture/)).

**Recommendation:** ship **arm64-only**, exactly as the product intent states. Every Mac sold since late 2020 is Apple Silicon; the residual Intel audience for a *new developer tool launching in 2026* is a rounding error, and its OS is already in security-updates-only mode. Declare `LSArchitecturePriority`/min macOS accordingly (macOS 13 or 14 minimum is reasonable and covers all Apple Silicon machines). If an Intel request ever materializes, a separate x64 build via `macos-15-intel` remains possible until Aug 2027 — don't pay the universal2 tax by default.

## 6. Packaging: DMG vs ZIP, quarantine, and App Translocation

- Anything downloaded by a browser gets the **`com.apple.quarantine` xattr**; quarantine propagates from a zip to its extracted contents and (for unstapled apps) forces an online Gatekeeper check on first launch. `xattr -l` / `xattr -d com.apple.quarantine` to inspect/clear locally ([rsms guide](https://gist.github.com/rsms/929c9c2fec231f0cf843a1a746a416f5)).
- **App Translocation** (Gatekeeper Path Randomization): a quarantined app launched from ~Downloads or straight out of a mounted DMG runs from a **randomized read-only path**. Consequences: relative-path assumptions break, and **self-update frameworks like Sparkle cannot update the app** ([lapcatsoftware: App Translocation](https://lapcatsoftware.com/articles/app-translocation.html), [Sparkle #1012](https://github.com/sparkle-project/Sparkle/issues/1012)). Translocation is lifted only when the user **moves the app with Finder** (e.g., drag to /Applications) or the quarantine xattr is gone.
- **Therefore:** ship a **DMG with the classic drag-to-/Applications layout** as the primary human artifact — it nudges the exact action that defeats translocation, it can be signed *and stapled directly*, and it's what Homebrew casks handle natively. Detect translocation at first launch (`bundlePath` contains `/AppTranslocation/`) and offer "Move to Applications" — a standard pattern (LetsMove et al.).
- Keep a **ZIP artifact too**: it's required by electron-updater/Squirrel.Mac (§7), it's what Sparkle appcasts usually point at, and it's `brew`-consumable. Remember the staple-then-re-zip dance (§3).

## 7. Auto-update options (by stack)

| Stack | Mechanism | Key facts |
|---|---|---|
| **Native (Swift/AppKit) or any non-Electron bundle** | [Sparkle 2](https://sparkle-project.org/) | The de-facto OSS standard, actively maintained (2.x line, 2.9 current-ish in 2025; DSA-only signing removed — **EdDSA (ed25519) signatures required** on update archives, layered on top of Apple code signing). RSS-style `appcast.xml` you can host on GitHub Pages/Releases; `generate_appcast` builds signatures **and binary delta updates** automatically ([docs](https://sparkle-project.org/documentation/), [GitHub](https://github.com/sparkle-project/Sparkle)). Works fine with sandboxing (XPC installer) but simplest unsandboxed. Requires the app not be translocated (§6). |
| **Electron** | [electron-updater](https://www.electron.build/docs/features/auto-update/) (electron-builder) wrapping **Squirrel.Mac** | Needs the **zip** target published alongside the DMG or `latest-mac.yml` isn't generated and updates fail; electron-builder's macOS default is `dmg+zip` for this reason. electron-updater downloads the zip, serves it to Squirrel.Mac over a loopback HTTP server, Squirrel swaps the bundle. Everything must be signed + notarized or macOS kills the swapped app. GitHub Releases is a first-class publish provider ([MacUpdater source](https://github.com/electron-userland/electron-builder/blob/master/packages/electron-updater/src/MacUpdater.ts), [CodeJam guide](https://www.codejam.info/2024/05/how-to-use-electron-auto-updater.html)). |
| **Tauri v2** | [tauri-plugin-updater](https://v2.tauri.app/plugin/updater/) | Set `createUpdaterArtifacts: true` → build emits `.app.tar.gz` + `.sig` (**minisign ed25519**, same idea as Sparkle's EdDSA). App checks a static `latest.json` (host on GitHub Releases; `tauri-action` generates it) listing per-platform `url` + `signature`; public key pinned in `tauri.conf.json` ([guide](https://thatgurjot.com/til/tauri-auto-updater/)). Smallest moving parts of the three. |

Cross-cutting: all three verify updates with an **author-held ed25519 key independent of Apple's chain** — generate it once, store it only in CI secrets (leaking it = update-channel compromise). All three need the *updated* bundle to be Developer ID-signed + notarized, or the relaunch dies at Gatekeeper.

## 8. Homebrew cask distribution

- Target `brew install --cask loredex` via the main [homebrew-cask](https://github.com/Homebrew/homebrew-cask) tap. Acceptance gates ([Acceptable Casks](https://docs.brew.sh/Acceptable-Casks)):
  - **Notability check** (automated by `brew audit`): a GitHub-hosted app is "too obscure" under 30 forks / 30 watchers / 75 stars — and **self-submitted casks (you own the repo) face 3× thresholds: 90 forks / 90 watchers / 225 stars**. Plan: launch via GitHub Releases + a **personal tap** (`loredex/homebrew-tap`, zero requirements, works day one), submit to homebrew-cask once the repo crosses the notability bar or a third-party contributor submits it.
  - **Gatekeeper must pass** — un-notarized apps are rejected outright. (Signing/notarization is therefore also your Homebrew ticket.)
  - Stable versioned download URLs (GitHub Releases assets are ideal) + sha256; `livecheck`/autobump keeps the cask current from your releases.
- Cask + Sparkle/updater coexist fine (the cask installs; the app self-updates; `brew upgrade` catches up via livecheck). Homebrew does **not** strip quarantine by default (`--no-quarantine` is a user opt-out), so notarization still matters for brew users.

## 9. GitHub Actions CI: build → sign → notarize → release (arm64)

Runner landscape (2026): `macos-latest` = **macOS 15 on arm64 (M-series)**; `macos-26` (Tahoe, arm64) went GA Feb 2026 ([GitHub Changelog](https://github.blog/changelog/2026-02-26-macos-26-is-now-generally-available-for-github-hosted-runners/)); Intel only via `macos-15-intel` until Aug 2027. Native arm64 runners build arm64 apps with no cross-compilation.

Proven recipe ([Federico Terzi's walkthrough](https://federicoterzi.com/blog/automatic-code-signing-and-notarization-for-macos-apps-using-github-actions/), [Tauri part 2 guide](https://dev.to/tomtomdu73/ship-your-tauri-v2-app-like-a-pro-github-actions-and-release-automation-part-22-2ef7)):

1. **Secrets:** base64 of the Developer ID Application `.p12` + its password; Apple ID + **app-specific password** + Team ID (or an App Store Connect API key — preferred, revocable, no 2FA edge cases); the updater's ed25519 private key.
2. **Ephemeral keychain step:** `security create-keychain` → `security import cert.p12 -T /usr/bin/codesign` → `security set-key-partition-list -S apple-tool:,apple:` → set as default and unlock. (Or use [Apple-Actions/import-codesign-certs](https://github.com/Apple-Actions/import-codesign-certs).) The partition-list step is the one everyone forgets; without it codesign hangs waiting for a UI prompt that never comes — the classic "GitHub Action hangs at signing" failure ([CodeJam post-mortem](https://www.codejam.info/2025/06/github-action-hanging-macos-app-code-signing.html)).
3. **Build + sign** (electron-builder / `tauri-action` / xcodebuild do inside-out signing given `CSC_LINK`/`APPLE_CERTIFICATE` env vars). Pre-sign any hand-bundled sidecar binaries (node, git) yourself — bundlers only sign what they know about ([Tauri #11992](https://github.com/tauri-apps/tauri/issues/11992)).
4. **Notarize** with `notarytool submit --wait` (electron-builder ≥26 and tauri-action run this natively when `APPLE_ID`/`APPLE_API_KEY` env vars are present). Allow 20+ min timeout; check for "Accepted", fetch `notarytool log` on failure.
5. **Staple** the DMG (and the .app inside the zip, then re-`ditto`).
6. **Release:** upload DMG + ZIP + appcast/`latest.json`/`latest-mac.yml` to the GitHub Release; bump the Homebrew tap (a `brew bump-cask-pr`-style job or a tap-repo dispatch).
7. Sanity job: `spctl -a -vv` and `stapler validate` on the artifacts before publishing.

Cost note: macOS runner minutes bill at **10×** Linux on private repos, but Loredex is public OSS → **free** on GitHub-hosted runners.

## 10. Gotcha checklist (the ones that burn people)

1. **Nested Node/It's-a-binary-in-Resources failures** — every Mach-O in the bundle (node sidecar, git, `.node` addons under `app.asar.unpacked`) must be individually Developer-ID-signed with hardened runtime, in a proper code location; `asarUnpack` any native modules ([electron-builder docs](https://www.electron.build/docs/features/code-signing/notarization/), [Apple: resolving notarization issues](https://developer.apple.com/documentation/security/resolving-common-notarization-issues)).
2. **A bare node binary needs its own entitlements** (`allow-jit` + `allow-unsigned-executable-memory`) signed onto *that binary*, not just the app.
3. **`--deep` signing** — verification yes, signing never.
4. **`zip` vs `ditto`** — NFD/NFC filename normalization breaks signatures; always `ditto -c -k --keepParent`.
5. **Can't staple a zip** — staple the app, re-zip; staple the DMG directly.
6. **App Translocation silently breaks Sparkle/self-update** when users run from Downloads/DMG — ship drag-to-Applications DMG + "Move to Applications" prompt.
7. **`set-key-partition-list` omitted** → CI hangs forever at codesign.
8. **notarytool exit code 0 ≠ accepted** — assert on status text.
9. **First-launch TCC ambush** — the app will hit Desktop/Documents prompts the moment it scans repos; front-load a folder-picker onboarding (grants access silently) instead of cold-scanning, or the 12-engineer rollout starts with 12 confused permission dialogs. (Directly relevant to the F7 onboarding wizard.)
10. **Sequoia's localhost-adjacent Local Network prompts** — bind the MCP server to `127.0.0.1` explicitly.
11. **Updater key ≠ Apple key** — the Sparkle/Tauri ed25519 private key is a separate single point of failure; CI-secret it, never commit, plan rotation.
12. **Homebrew notability wall for self-submission (225 stars)** — own tap first, main cask later.

---

## Sources

- [Apple Developer Program](https://developer.apple.com/programs/) — membership, $99/yr
- [Signing Mac Software with Developer ID — Apple](https://developer.apple.com/developer-id/)
- [Notarizing macOS software before distribution — Apple](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)
- [Resolving common notarization issues — Apple](https://developer.apple.com/documentation/security/resolving-common-notarization-issues)
- [rsms — macOS distribution: signing, notarization, quarantine (gist)](https://gist.github.com/rsms/929c9c2fec231f0cf843a1a746a416f5)
- [Complete guide to notarizing with notarytool — tonygo.tech](https://tonygo.tech/blog/2023/notarization-for-macos-app-with-notarytool)
- [AppleInsider — Sequoia removes Control-click Gatekeeper bypass](https://appleinsider.com/articles/24/08/06/apple-removes-control-click-option-for-skipping-gatekeeper-in-macos-sequoia) / [Michael Tsai roundup](https://mjtsai.com/blog/2024/07/05/sequoia-removes-gatekeeper-contextual-menu-override/)
- [Wikipedia — macOS Tahoe (last Intel release)](https://en.wikipedia.org/wiki/MacOS_Tahoe) / [TechPowerUp — macOS 27 drops Intel](https://www.techpowerup.com/348408/end-of-an-era-macos-27-drops-support-for-intel-based-macs) / [Production Expert — Rosetta timeline](https://www.production-expert.com/production-expert-1/intel-mac-users-apple-gives-12-month-countdown)
- [GitHub Changelog — macOS 13 runner image closing down](https://github.blog/changelog/2025-09-19-github-actions-macos-13-runner-image-is-closing-down/) / [macos-26 GA](https://github.blog/changelog/2026-02-26-macos-26-is-now-generally-available-for-github-hosted-runners/) / [runner-images #13045 — macos-15-intel until Aug 2027](https://github.com/actions/runner-images/issues/13045)
- [Sparkle project](https://sparkle-project.org/) / [docs](https://sparkle-project.org/documentation/) / [GitHub](https://github.com/sparkle-project/Sparkle) / [Sparkle #1012 — translocation vs updates](https://github.com/sparkle-project/Sparkle/issues/1012)
- [electron-builder — Auto Update](https://www.electron.build/docs/features/auto-update/) / [macOS notarization](https://www.electron.build/docs/features/code-signing/notarization/) / [architecture/universal](https://www.electron.build/docs/architecture/) / [electron/universal](https://github.com/electron/universal)
- [Electron Forge — Signing a macOS app](https://www.electronforge.io/guides/code-signing/code-signing-macos) / [electron/notarize](https://github.com/electron/notarize) / [electron/notarize#97 — invalid signature via zip](https://github.com/electron/notarize/issues/97)
- [Chris Tarnowski — Making notarization work for Electron apps](https://christarnowski.com/making-notarization-work-on-macos-for-electron-apps-built-with-electron-builder/)
- [Tauri v2 — Updater plugin](https://v2.tauri.app/plugin/updater/) / [macOS code signing](https://v2.tauri.app/distribute/sign/macos/) / [tauri#11992 — ExternalBin signing](https://github.com/tauri-apps/tauri/issues/11992) / [Tauri v2 auto-updater guide](https://thatgurjot.com/til/tauri-auto-updater/) / [Ship Tauri v2 like a pro, part 2 (CI)](https://dev.to/tomtomdu73/ship-your-tauri-v2-app-like-a-pro-github-actions-and-release-automation-part-22-2ef7)
- [Homebrew — Acceptable Casks](https://docs.brew.sh/Acceptable-Casks) / [homebrew-cask](https://github.com/Homebrew/homebrew-cask)
- [Federico Terzi — Automatic code-signing & notarization on GitHub Actions](https://federicoterzi.com/blog/automatic-code-signing-and-notarization-for-macos-apps-using-github-actions/) / [Apple-Actions/import-codesign-certs](https://github.com/Apple-Actions/import-codesign-certs) / [CodeJam — GH Action hanging on codesign](https://www.codejam.info/2025/06/github-action-hanging-macos-app-code-signing.html)
- [lapcatsoftware — App Translocation](https://lapcatsoftware.com/articles/app-translocation.html) / [Eclectic Light — What causes App Translocation](https://eclecticlight.co/2023/05/09/what-causes-app-translocation/)
- [Eclectic Light — Explainer: Permissions, privacy and TCC](https://eclecticlight.co/2025/11/08/explainer-permissions-privacy-and-tcc/) / [Files & Folders or Full Disk Access?](https://eclecticlight.co/2026/04/08/privacy-files-folders-or-full-disk-access/)
- [Michael Tsai — Local Network Privacy on Sequoia](https://mjtsai.com/blog/2024/10/02/local-network-privacy-on-sequoia/)
- [Apple Developer Forums — stapler error 65 / can't staple zips](https://developer.apple.com/forums/thread/115670) / [Omnis technote — stapling notarized apps](https://www.technotes.omnis.net/Technical%20Notes/Deployment/macOS%20notarization/3.Stapling%20notarised%20app.html)
