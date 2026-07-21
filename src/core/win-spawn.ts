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

/** The separator follows the TARGET platform, not the host: node:path's
 *  `delimiter` is ':' when this runs on macOS/Linux, which would silently
 *  corrupt a Windows PATH into one unusable entry. */
const WIN_SEP = ';'

/** Windows spells it `Path`; POSIX spells it `PATH`. Find whichever is there. */
function pathKeyOf(env: NodeJS.ProcessEnv): string | null {
  return Object.keys(env).find((k) => k.toLowerCase() === 'path') ?? null
}

/**
 * PATH widened with any Node location that actually exists on this machine.
 * Existing entries keep priority — we only ever APPEND, so a user's own PATH
 * ordering is never overridden.
 *
 * The key's ORIGINAL casing is reused, and any other case-variant is dropped.
 * `process.env` on Windows is a case-insensitive proxy, but spreading it yields
 * a plain object whose key is whatever Windows stored — `Path`. Writing `PATH`
 * onto that left the object holding BOTH, so the environment block handed to
 * CreateProcess had two PATH entries and the un-widened one could win. The
 * widening then did nothing, on exactly the machines that needed it.
 */
export function widenWindowsPath(
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform = process.platform,
  home: string = homedir(),
): NodeJS.ProcessEnv {
  if (platform !== 'win32') return env
  const key = pathKeyOf(env)
  const current = (key ? env[key] : '') ?? ''
  const have = new Set(current.split(WIN_SEP).map((p) => p.toLowerCase()))
  const extra = candidateDirs(home, env).filter((d) => !have.has(d.toLowerCase()) && existsSync(d))
  if (extra.length === 0) return env

  const out: NodeJS.ProcessEnv = {}
  for (const [k, v] of Object.entries(env)) {
    if (k.toLowerCase() !== 'path') out[k] = v
  }
  out[key ?? 'Path'] = [current, ...extra].filter(Boolean).join(WIN_SEP)
  return out
}

/**
 * The absolute path to `npx.cmd`, or null when Node is genuinely not installed.
 *
 * Widening PATH only helps if cmd.exe then performs the lookup we expect, and
 * that depends on how the process was launched and which shell profile ran.
 * Handing cmd an absolute path takes PATH out of the equation entirely for the
 * case where Node IS present — which is most of them. Null is then a real
 * answer, not a lookup failure: nothing on this machine has npx, so the UI can
 * say "install Node" and mean it.
 *
 * Directories already on PATH are checked first, so a deliberate nvm/fnm
 * selection wins over a stale global install.
 */
export function resolveNpx(
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform = process.platform,
  home: string = homedir(),
): string | null {
  if (platform !== 'win32') return null
  const key = pathKeyOf(env)
  const onPath = ((key ? env[key] : '') ?? '').split(WIN_SEP).filter(Boolean)
  for (const dir of [...onPath, ...candidateDirs(home, env)]) {
    const candidate = join(dir, 'npx.cmd')
    if (existsSync(candidate)) return candidate
  }
  return null
}

/**
 * Point a `cmd /c npx …` invocation at the absolute `npx.cmd` when one exists.
 *
 * `windowsSafeCommand` produces `cmd /c npx -y <pkg>` to satisfy
 * CVE-2024-27980. That still leaves cmd.exe to FIND `npx`, which is the step
 * that fails on a GUI-launched app. Substituting the absolute path removes the
 * lookup; unchanged when nothing is found, so the caller still gets cmd's own
 * error and the "install Node" diagnosis rather than a silent no-op.
 */
export function withResolvedNpx(
  safe: { command: string; args: string[] },
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform = process.platform,
  home: string = homedir(),
): { command: string; args: string[] } {
  if (platform !== 'win32' || safe.command !== 'cmd') return safe
  const i = safe.args.indexOf('npx')
  if (i === -1) return safe
  const abs = resolveNpx(env, platform, home)
  if (!abs) return safe
  const args = [...safe.args]
  args[i] = abs
  return { command: safe.command, args }
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
  home: string = homedir(),
  env: NodeJS.ProcessEnv = process.env,
): string {
  if (!isCommandNotFound(text)) return text
  if (platform !== 'win32') {
    return (
      `\`${command}\` was not found on this machine — this is a PATH problem, not a token problem. ` +
      'Install Node.js from nodejs.org, then restart Loredex.'
    )
  }
  // We searched for it ourselves, so we can tell these two apart instead of
  // offering one paragraph that covers both and helps with neither.
  const found = resolveNpx(env, platform, home)
  if (!found) {
    return (
      `Node.js is not installed on this computer — \`${command}\` does not exist anywhere Loredex can see. ` +
      'This is not a token problem; the token is fine. ' +
      'Install Node.js LTS from nodejs.org (choose the Windows Installer .msi, and keep "Add to PATH" ticked), ' +
      'then fully quit and reopen Loredex.'
    )
  }
  return (
    `\`${command}\` exists at ${found} but could not be started. ` +
    'This is not a token problem. Reopen Loredex so it picks up a current PATH; ' +
    'if it persists, reinstall Node.js LTS from nodejs.org with "Add to PATH" ticked.'
  )
}
