/**
 * loredex lib facade — the SOLE `import 'loredex'` site (anti-second-engine,
 * architecture.md#coding-standards #3). Config resolves exactly once per
 * core-host lifetime (F6 split-brain defense); a respawned host re-resolves.
 */
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import {
  type Config,
  type Doc,
  loadConfig,
  parseDoc,
  resolveNoteInsideVault,
  type SearchHit,
  searchVault,
} from 'loredex'
import { abbreviatePath } from '../shared/identity'
import { ipcError } from '../shared/ipc-contract'
import type { VaultIdentity } from '../shared/types'

/** undefined = not yet initialized; null = initialized, no config on disk. */
let config: Config | null | undefined
let configSource: VaultIdentity['configSource'] = 'loredex-config'

export function initEngine(vaultOverride?: string): Config | null {
  if (config !== undefined) {
    throw new Error('initEngine called twice — config resolves exactly once per core-host lifetime')
  }
  config = loadConfig()
  if (vaultOverride) {
    config = { ...(config ?? { sync: 'none' as const, projects: {} }), vaultPath: vaultOverride }
    configSource = 'vault-picker'
  }
  return config
}

export function getConfig(): Config {
  if (config === undefined) throw new Error('engine not initialized')
  if (config === null) {
    throw ipcError('NO_CONFIG', 'no loredex config resolved — pick a vault first (story 1.4)')
  }
  return config
}

export function readNote(path: string): Doc {
  const vault = getConfig().vaultPath
  const requested = isAbsolute(path) ? path : join(vault, path)
  const resolved = resolveNoteInsideVault(vault, requested)
  if (!resolved) {
    throw ipcError('VAULT_OUTSIDE_PATH', `not a markdown note inside the vault: ${path}`)
  }
  return parseDoc(readFileSync(resolved, 'utf8'))
}

export function search(q: string): SearchHit[] {
  return searchVault(getConfig().vaultPath, q)
}

/** Embedded engine version — read from the loredex package itself (F6 evidence). */
export function engineVersion(): string {
  const pkg = createRequire(import.meta.url)('loredex/package.json') as { version: string }
  return pkg.version
}

/** Read-only peek at <vault>/.git/config for the origin remote url (no git shell-out). */
function readOriginRemote(vaultPath: string): string | null {
  try {
    const raw = readFileSync(join(vaultPath, '.git', 'config'), 'utf8')
    const origin = /\[remote "origin"\][^[]*?url\s*=\s*(\S+)/.exec(raw)
    return origin?.[1] ?? null
  } catch {
    return null
  }
}

/** Vault identity for the chrome badge; later echoed by MCP responses (story 1.6). */
export function identity(): VaultIdentity {
  const { vaultPath } = getConfig()
  return {
    vaultPath,
    displayPath: abbreviatePath(vaultPath, homedir()),
    configSource,
    remote: readOriginRemote(vaultPath),
    engineVersion: engineVersion(),
  }
}
