/**
 * Command resolution for spawning npm-shim executables (`npx`, `npm`) from a
 * GUI-launched desktop app, on every platform.
 *
 * The root problem is shared: a Finder/Explorer-launched app does NOT inherit a
 * login shell's PATH, and a per-user Node install (nvm, fnm, volta, homebrew,
 * winget) lives outside the bare PATH the OS hands a GUI process. On macOS that
 * bare PATH is `/usr/bin:/bin:/usr/sbin:/sbin` — nvm/homebrew are simply absent
 * — so `execFile('npx', …)` fails with ENOENT even though Node is installed.
 *
 * Windows stacks a second problem on top: since April 2024 (CVE-2024-27980)
 * Node REFUSES to spawn a `.cmd`/`.bat` directly (EINVAL unless `shell: true`),
 * and `npx` on Windows *is* `npx.cmd`. The lib wraps it as `cmd /c npx …`, which
 * is correct and avoids `shell: true` (the quoting surface the CVE was about) —
 * but the wrap only helps if cmd can then FIND `npx`, so the PATH problem above
 * still bites, surfacing as cmd's own "'npx' is not recognized …".
 *
 * This module addresses PATH on every platform: it widens PATH with the
 * standard Node locations and, better, resolves `npx` to an absolute path so the
 * spawn does not depend on PATH at all — then recognises the residual error so
 * the UI can say what is actually wrong (a PATH problem, never the credential).
 */
import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** Existing nvm node bin dirs, newest version first (empty when nvm absent).
 *  ponytail: newest-first is a heuristic, not nvm's `default` alias — enough to
 *  find *an* npx; resolve the alias only if a user reports the wrong version. */
function nvmBins(home: string): string[] {
  const root = join(home, '.nvm', 'versions', 'node')
  let versions: string[]
  try {
    versions = readdirSync(root)
  } catch {
    return [] // no nvm on this machine
  }
  return versions
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))
    .map((v) => join(root, v, 'bin'))
    .filter((d) => existsSync(d))
}

/** Where Node/npm land when a GUI-launched app's PATH cannot see them.
 *  Windows: the per-user installers. POSIX: a Finder-launched app inherits only
 *  the launchd PATH (`/usr/bin:/bin:/usr/sbin:/sbin`), so homebrew, the
 *  nodejs.org prefix, and the version managers (nvm/volta/asdf) — all added by a
 *  login shell, never by launchd — are invisible until we add them back. */
function candidateDirs(home: string, env: NodeJS.ProcessEnv, platform: NodeJS.Platform): string[] {
  if (platform !== 'win32') {
    return [
      ...nvmBins(home).slice(0, 1), // newest nvm node
      '/opt/homebrew/bin', // Apple-Silicon homebrew
      '/usr/local/bin', // Intel homebrew + the nodejs.org installer
      join(home, '.volta', 'bin'),
      join(home, '.asdf', 'shims'),
      join(home, '.local', 'bin'),
    ]
  }
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

/** PATH separator for the TARGET platform (';' on Windows, ':' on POSIX), not
 *  the host — node:path's `delimiter` follows the host and would corrupt the
 *  other platform's PATH into one unusable entry. */
const sepFor = (platform: NodeJS.Platform): string => (platform === 'win32' ? ';' : ':')

/** Windows spells it `Path`; POSIX spells it `PATH`. Find whichever is there. */
function pathKeyOf(env: NodeJS.ProcessEnv): string | null {
  return Object.keys(env).find((k) => k.toLowerCase() === 'path') ?? null
}

/**
 * PATH widened with any Node location that actually exists on this machine, for
 * the target platform. Existing entries keep priority — we only ever APPEND, so
 * a user's own ordering (a deliberate nvm/fnm selection) is never overridden.
 *
 * On Windows the key's ORIGINAL casing is reused and any other case-variant is
 * dropped: `process.env` there enumerates `Path`, and leaving both `Path` and
 * `PATH` on the object handed to CreateProcess let the un-widened one win — the
 * widening then did nothing, on exactly the machines that needed it. POSIX PATH
 * is case-sensitive and always `PATH`, so the fold is a no-op there.
 */
export function widenNodePath(
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform = process.platform,
  home: string = homedir(),
): NodeJS.ProcessEnv {
  const sep = sepFor(platform)
  const fold = (p: string): string => (platform === 'win32' ? p.toLowerCase() : p)
  const key = pathKeyOf(env)
  const current = (key ? env[key] : '') ?? ''
  const have = new Set(current.split(sep).map(fold))
  const extra = candidateDirs(home, env, platform).filter((d) => !have.has(fold(d)) && existsSync(d))
  if (extra.length === 0) return env

  const out: NodeJS.ProcessEnv = {}
  for (const [k, v] of Object.entries(env)) {
    if (k.toLowerCase() !== 'path') out[k] = v
  }
  out[key ?? (platform === 'win32' ? 'Path' : 'PATH')] = [current, ...extra]
    .filter(Boolean)
    .join(sep)
  return out
}

/**
 * The absolute path to `npx` (`npx.cmd` on Windows), or null when Node is
 * genuinely not installed anywhere we look. Handing spawn an absolute path takes
 * PATH out of the equation for the common case where Node IS present — which,
 * for a GUI-launched app with a stripped PATH, is most of them. Null is then a
 * real answer ("install Node"), not a lookup failure.
 *
 * Directories already on PATH are checked first, so a deliberate nvm/fnm
 * selection wins over a stale global install.
 */
export function resolveNpx(
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform = process.platform,
  home: string = homedir(),
): string | null {
  const bin = platform === 'win32' ? 'npx.cmd' : 'npx'
  const key = pathKeyOf(env)
  const onPath = ((key ? env[key] : '') ?? '').split(sepFor(platform)).filter(Boolean)
  for (const dir of [...onPath, ...candidateDirs(home, env, platform)]) {
    const candidate = join(dir, bin)
    if (existsSync(candidate)) return candidate
  }
  return null
}

/**
 * Point an npx invocation at the absolute `npx`/`npx.cmd` when one exists, so
 * the spawn does not depend on the GUI-launched app's stripped PATH.
 *
 * Windows: `windowsSafeCommand` produces `cmd /c npx -y <pkg>` (CVE-2024-27980),
 * and cmd still has to FIND `npx` — we swap the `npx` ARG for its absolute path.
 * POSIX: the command IS `npx` — we swap the COMMAND itself. Unchanged when
 * nothing is found, so the caller still gets the real ENOENT and the
 * "install Node" diagnosis rather than a silent no-op.
 */
export function withResolvedNpx(
  safe: { command: string; args: string[] },
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform = process.platform,
  home: string = homedir(),
): { command: string; args: string[] } {
  if (platform === 'win32') {
    if (safe.command !== 'cmd') return safe
    const i = safe.args.indexOf('npx')
    if (i === -1) return safe
    const abs = resolveNpx(env, platform, home)
    if (!abs) return safe
    const args = [...safe.args]
    args[i] = abs
    return { command: safe.command, args }
  }
  // POSIX: `{ command: 'npx', args: […] }`
  if (safe.command !== 'npx') return safe
  const abs = resolveNpx(env, platform, home)
  if (!abs) return safe
  return { command: abs, args: safe.args }
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
    // Distinguish "Node is genuinely absent" from "it's installed via nvm/
    // homebrew but the GUI launch stripped it off PATH" — different fixes. The
    // word "token" is deliberately avoided: the failure is never the credential,
    // and the client card keys its "re-paste token" hint off that word.
    const found = resolveNpx(env, platform, home)
    if (found) {
      return (
        `\`${command}\` exists at ${found} but the app could not reach it — a PATH problem, not a credentials problem. ` +
        'Quit Loredex fully and reopen it. If it persists, launch the binary directly from a terminal so it ' +
        'inherits your shell PATH: `/Applications/Loredex.app/Contents/MacOS/Loredex` (`open -a` will not — it ' +
        'goes through LaunchServices, which hands the app launchd’s environment, not your shell’s).'
      )
    }
    return (
      `\`${command}\` (Node.js) was not found in any of the usual locations — a PATH problem, not a credentials problem. ` +
      'Install Node.js from nodejs.org or your version manager, then fully quit and reopen Loredex.'
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
