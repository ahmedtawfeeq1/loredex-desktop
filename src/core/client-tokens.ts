/**
 * Per-client MCP token store (agent-ops Add-Client flow, docs/plan/
 * agent-ops-desktop-flow.md). Keyed by the `${VAR}` name a client's
 * workspace.yml declares (e.g. GENUDO_TOKEN_ACCEPTED) — the token itself
 * never enters the vault or a commit; materialize expands it into the
 * client's gitignored generated files.
 *
 * macOS: login Keychain via `security`, one generic-password entry per ref
 * (service loredex-client-mcp). Windows/Linux: the AUTH-GITHUB §2 sanctioned
 * fallback — an AES-256-GCM JSON map under ~/.config/loredex, machine-keyed,
 * chmod 0600 (crypto shared with auth.ts).
 *
 * The keychain + encrypted-map primitives below are shared: WP-D's client-login
 * credential store (client-credentials.ts) delegates to the SAME helpers so
 * there is one containment implementation and one mock surface.
 */
import { execFile } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { decryptCredString, encryptCredString } from './auth'

const execFileAsync = promisify(execFile)

const KEYCHAIN_SERVICE = 'loredex-client-mcp'
export const CRED_DIR = join(homedir(), '.config', 'loredex')
const MAP_FILE = join(CRED_DIR, 'client-credentials')

// ── shared primitives (darwin keychain + encrypted-file fallback) ────────────

/** Upsert one keychain generic-password (macOS `security`). */
export async function keychainSet(
  service: string,
  account: string,
  secret: string,
): Promise<void> {
  await execFileAsync(
    'security',
    ['add-generic-password', '-U', '-s', service, '-a', account, '-w', secret],
    { timeout: 5000 },
  )
}

/** Read one keychain secret, or null when absent/unreadable. */
export async function keychainGet(service: string, account: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      'security',
      ['find-generic-password', '-s', service, '-a', account, '-w'],
      { timeout: 5000 },
    )
    return stdout.trim() || null
  } catch {
    return null
  }
}

/** Delete one keychain secret (idempotent). */
export async function keychainDelete(service: string, account: string): Promise<void> {
  try {
    await execFileAsync('security', ['delete-generic-password', '-s', service, '-a', account], {
      timeout: 5000,
    })
  } catch {
    // nothing stored — delete is idempotent
  }
}

/** Read an AES-256-GCM JSON map file (the non-darwin secret fallback). */
export function readEncMap(file: string): Record<string, string> {
  try {
    if (!existsSync(file)) return {}
    const plain = decryptCredString(readFileSync(file))
    return plain ? (JSON.parse(plain) as Record<string, string>) : {}
  } catch {
    return {}
  }
}

/** Write an AES-256-GCM JSON map file, chmod 0600 (the non-darwin fallback). */
export function writeEncMap(file: string, map: Record<string, string>): void {
  mkdirSync(CRED_DIR, { recursive: true })
  writeFileSync(file, encryptCredString(JSON.stringify(map)), { mode: 0o600 })
  chmodSync(file, 0o600)
}

// ── the MCP-token store (unchanged contract — delegates to the primitives) ───

export async function storeClientToken(ref: string, token: string): Promise<void> {
  if (process.platform !== 'darwin') {
    writeEncMap(MAP_FILE, { ...readEncMap(MAP_FILE), [ref]: token })
    return
  }
  await keychainSet(KEYCHAIN_SERVICE, ref, token)
}

export async function readClientToken(ref: string): Promise<string | null> {
  if (process.platform !== 'darwin') return readEncMap(MAP_FILE)[ref] ?? null
  return keychainGet(KEYCHAIN_SERVICE, ref)
}

/** The subset of `refs` this machine holds, as an env-shaped record. */
export async function readClientTokens(refs: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  for (const ref of refs) {
    const token = await readClientToken(ref)
    if (token !== null) out[ref] = token
  }
  return out
}

export async function deleteClientToken(ref: string): Promise<void> {
  if (process.platform !== 'darwin') {
    const map = readEncMap(MAP_FILE)
    delete map[ref]
    writeEncMap(MAP_FILE, map)
    return
  }
  await keychainDelete(KEYCHAIN_SERVICE, ref)
}
