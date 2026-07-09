/**
 * loredex lib facade — the SOLE `import 'loredex'` site (anti-second-engine,
 * architecture.md#coding-standards #3). Config resolves exactly once per
 * core-host lifetime (F6 split-brain defense); a respawned host re-resolves.
 */
import { readFileSync } from 'node:fs'
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
import { ipcError } from '../shared/ipc-contract'

/** undefined = not yet initialized; null = initialized, no config on disk. */
let config: Config | null | undefined

export function initEngine(vaultOverride?: string): Config | null {
  if (config !== undefined) {
    throw new Error('initEngine called twice — config resolves exactly once per core-host lifetime')
  }
  config = loadConfig()
  if (vaultOverride) {
    config = { ...(config ?? { sync: 'none' as const, projects: {} }), vaultPath: vaultOverride }
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
