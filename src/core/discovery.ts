/**
 * ~/.loredex/desktop.json — how the CLI (`loredex mcp --via-desktop`, PR-9) and
 * `loredex doctor` (PR-10) find the app-hosted MCP server. Written chmod 600
 * after a successful listen, removed on clean shutdown (story 1.6).
 * Keep the JSON shape exactly {port, token, engineVersion, schemaVersion}.
 */
import { chmodSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export interface DiscoveryFile {
  port: number
  token: string
  engineVersion: string
  schemaVersion: number
}

export function discoveryPath(dir: string = join(homedir(), '.loredex')): string {
  return join(dir, 'desktop.json')
}

/** Write the discovery file with owner-only permissions; returns its path. */
export function writeDiscovery(file: DiscoveryFile, dir?: string): string {
  const path = discoveryPath(dir)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`, { mode: 0o600 })
  chmodSync(path, 0o600) // mode option is ignored when the file already exists
  return path
}

export function removeDiscovery(dir?: string): void {
  try {
    rmSync(discoveryPath(dir))
  } catch {
    // already gone — removal is idempotent
  }
}
