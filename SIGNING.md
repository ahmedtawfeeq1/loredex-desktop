# Code signing & notarization

Releases are **unsigned** today, so every downloader hits a one-time OS warning
("damaged" on macOS, SmartScreen on Windows) and has to clear it manually (see
the [README install section](README.md#install)). Signing + notarizing removes
that wall — users double-click and it just opens.

The release workflow ([`.github/workflows/release.yml`](.github/workflows/release.yml))
is **already wired**: it passes signing credentials to `electron-builder` from
repo secrets. While the secrets are unset, builds stay unsigned exactly as now.
Add the secrets and the **next tag** signs automatically — no workflow edit.

---

## macOS — Developer ID + notarization

Requires a paid **Apple Developer Program** membership ($99/yr).

### 1. Get a Developer ID Application certificate
- Xcode → Settings → Accounts → your team → **Manage Certificates** → **+** →
  **Developer ID Application**. (Or create it in the Apple Developer portal.)
- Export it from **Keychain Access** as a `.p12` (right-click the cert →
  Export), set an export password — you'll need it as `CSC_KEY_PASSWORD`.

### 2. Base64-encode the .p12 for the secret
```sh
base64 -i DeveloperID.p12 | pbcopy   # now on your clipboard
```

### 3. Create an app-specific password for notarization
- <https://appleid.apple.com> → Sign-In & Security → **App-Specific Passwords**
  → generate one (label it "loredex notarize").
- Find your **Team ID**: Apple Developer portal → Membership (a 10-char code).

### 4. Add the repo secrets
`Settings → Secrets and variables → Actions → New repository secret`:

| Secret | Value |
|--------|-------|
| `CSC_LINK` | the base64 string from step 2 |
| `CSC_KEY_PASSWORD` | the `.p12` export password |
| `APPLE_ID` | your Apple ID email |
| `APPLE_APP_SPECIFIC_PASSWORD` | the app-specific password from step 3 |
| `APPLE_TEAM_ID` | your 10-char Team ID |

### 5. Enable notarization in electron-builder
Add to the `mac:` block of [`electron-builder.yml`](electron-builder.yml):
```yaml
mac:
  hardenedRuntime: true
  gatekeeperAssess: false
  notarize:
    teamId: ${env.APPLE_TEAM_ID}
```
`hardenedRuntime` is required for notarization; electron-builder submits to
Apple's `notarytool` and staples the ticket when the `APPLE_*` env is present.

Tag a release (`git tag vX.Y.Z && git push origin vX.Y.Z`) → the mac build is
signed + notarized. Verify on the downloaded app:
```sh
codesign -dv --verbose=4 /Applications/Loredex.app     # Authority: Developer ID Application
spctl -a -vvv /Applications/Loredex.app                # accepted, source=Notarized Developer ID
```

---

## Windows — OV/EV code signing

Requires an **Organization Validation (OV)** or **Extended Validation (EV)**
code-signing certificate from a CA (DigiCert, Sectigo, SSL.com…). EV clears
SmartScreen immediately; OV builds reputation over time.

1. Export the cert as `.pfx`, base64-encode it (`base64 -i cert.pfx`).
2. Add secrets: `WIN_CSC_LINK` (the base64) and `WIN_CSC_KEY_PASSWORD` (the pfx
   password). The workflow already passes these on the Windows runner.
3. Next tag → the `.exe` is signed. (EV certs on a hardware token can't sign in
   plain CI — use the CA's cloud-signing option, e.g. Azure Trusted Signing or
   SSL.com eSigner, and swap the env accordingly.)

---

## Linux
AppImage/deb need no signing to run — no Gatekeeper equivalent. `chmod +x` the
AppImage and go. (Optionally GPG-sign the deb for apt repos; not required.)

---

## Until then
Point users at the [README install steps](README.md#install) — the one-time
`xattr -cr` + `codesign --force --deep --sign -` on macOS, "Run anyway" on
Windows. Fine for testers; sign before any public/non-technical distribution.
