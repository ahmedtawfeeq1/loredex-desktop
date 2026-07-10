/**
 * Dev-only ABI shim (story 15.1): better-sqlite3 is V8-native (non-N-API), so
 * one binary serves either plain node (vitest) or Electron — never both.
 * `scripts/prepare-electron-natives.mjs` (predev/postdist) stages an
 * Electron-ABI build OUTSIDE the module at
 * `node_modules/.loredex-natives/electron/better_sqlite3.node`; under Electron
 * the core host opens app.db through it, while `build/Release` stays
 * plain-node for the test runner.
 *
 * Packaged app: the staging dir is never shipped — existsSync misses →
 * undefined → better-sqlite3's default resolution finds the binary
 * electron-builder rebuilt into the bundle at dist time.
 */
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const requireModule = createRequire(import.meta.url)

export function electronNativeBinding(
  versions: NodeJS.ProcessVersions = process.versions,
  exists: (path: string) => boolean = existsSync,
): string | undefined {
  if (!versions.electron) return undefined
  let moduleDir: string
  try {
    moduleDir = dirname(requireModule.resolve('better-sqlite3/package.json'))
  } catch {
    return undefined // module not resolvable — let the default loader report it
  }
  const staged = join(moduleDir, '..', '.loredex-natives', 'electron', 'better_sqlite3.node')
  return exists(staged) ? staged : undefined
}
