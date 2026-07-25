/**
 * Where the core host may write machine-local, non-vault data. `--user-data` is
 * passed by main at spawn; a bare test host has none, so every path accessor
 * fails loudly rather than silently writing somewhere unexpected.
 */
import { join } from 'node:path'

let userDataDir: string | null = null

export function setUserDataDir(dir: string | undefined): void {
  userDataDir = dir ?? null
}

export function getUserDataDir(): string | null {
  return userDataDir
}

/**
 * An on-demand MCP server's install root — beside app.db, so it survives the app
 * bundle being replaced (the same reason app.db lives there).
 */
export function mcpInstallDir(id: string): string {
  if (!userDataDir) throw new Error('no user-data directory — cannot install an MCP server')
  return join(userDataDir, 'mcp', id)
}

/**
 * Scratch space for data fetched from someone else's system — LangSmith traces
 * today. Deliberately NOT the vault: it is a working copy, not a note, and must
 * never be routed into the dex or reach a commit.
 */
export function scratchDir(id: string): string {
  if (!userDataDir) throw new Error(`no user-data directory — cannot write ${id}`)
  return join(userDataDir, id)
}
