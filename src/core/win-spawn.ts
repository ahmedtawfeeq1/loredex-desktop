/**
 * Windows command resolution for spawning npm-shim executables (`npx`, `npm`).
 *
 * Two distinct Windows problems stack here, and fixing only one leaves it broken:
 *
 * 1. **CVE-2024-27980.** Since April 2024 Node REFUSES to spawn a `.cmd`/`.bat`
 *    directly — it errors EINVAL unless `shell: true` is passed. `npx` on
 *    Windows *is* `npx.cmd`. The loredex lib already handles this by wrapping as
 *    `cmd /c npx …`, which is correct and avoids `shell: true` (whose argument
 *    quoting is the actual injection surface the CVE was about).
 *    https://nodejs.org/en/blog/vulnerability/april-2024-security-releases-2
 *
 * 2. **PATH.** The wrap only helps if `cmd` can then FIND `npx`. A GUI-launched
 *    app does not inherit a login shell's PATH, and a per-user Node install
 *    (nvm-windows, fnm, winget) puts node outside the machine PATH entirely.
 *    The result is cmd.exe's own message — "'npx' is not recognized as an
 *    internal or external command, operable program or batch file" — which reads
 *    like a broken app rather than a missing PATH entry.
 *
 * This module addresses (2): it widens PATH with the standard per-user Node
 * locations before spawning, and recognises the resulting error so the UI can
 * say what is actually wrong.
 */
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** Where Node/npm land on Windows when not on the machine PATH. */
function candidateDirs(home: string, env: NodeJS.ProcessEnv): string[] {
  const appData = env.APPDATA ?? join(home, 'AppData', 'Roaming')
  const localAppData = env.LOCALAPPDATA ?? join(home, 'AppData', 'Local')
  const programFiles = env.ProgramFiles ?? 'C:\\Program Files'
  return [
    join(appData, 'npm'), // npm global bin — where npx.cmd usually lives
    join(programFiles, 'nodejs'), // the MSI installer
    join(localAppData, 'Programs', 'nodejs'),
    join(localAppData, 'fnm_multishells'),
    join(home, 'scoop', 'shims'),
    join(localAppData, 'Volta', 'bin'),
  ]
}

/**
 * PATH widened with any Node location that actually exists on this machine.
 * Existing entries keep priority — we only ever APPEND, so a user's own PATH
 * ordering is never overridden.
 */
export function widenWindowsPath(
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform = process.platform,
  home: string = homedir(),
): NodeJS.ProcessEnv {
  if (platform !== 'win32') return env
  // the separator follows the TARGET platform, not the host: node:path's
  // `delimiter` is ':' when this runs on macOS/Linux, which would silently
  // corrupt a Windows PATH into one unusable entry
  const sep = ';'
  const current = env.PATH ?? env.Path ?? ''
  const have = new Set(current.split(sep).map((p) => p.toLowerCase()))
  const extra = candidateDirs(home, env).filter(
    (d) => !have.has(d.toLowerCase()) && existsSync(d),
  )
  if (extra.length === 0) return env
  return { ...env, PATH: [current, ...extra].filter(Boolean).join(sep) }
}

/** cmd.exe's "not recognized" message, in the forms it actually appears. */
export function isCommandNotFound(text: string): boolean {
  return /is not recognized as an internal or external command|operable program or batch file|ENOENT/i.test(
    text,
  )
}

/**
 * A diagnosis a user can act on. The old message blamed the token for EVERY
 * failure, which sent people re-pasting a perfectly good credential while the
 * real problem was that Node was not reachable from a GUI-launched app.
 */
export function explainSpawnFailure(
  text: string,
  command: string,
  platform: NodeJS.Platform = process.platform,
): string {
  if (!isCommandNotFound(text)) return text
  const where = platform === 'win32' ? 'Windows' : 'this machine'
  return (
    `\`${command}\` was not found on ${where} — this is a PATH problem, not a token problem. ` +
    'Node.js is either not installed or not visible to apps launched from the desktop. ' +
    'Install Node.js from nodejs.org (the machine-wide installer, not a per-user one), then restart Loredex.'
  )
}
