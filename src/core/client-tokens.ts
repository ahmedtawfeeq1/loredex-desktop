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
 */
import { execFile } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { decryptCredString, encryptCredString } from './auth'

const execFileAsync = promisify(execFile)

const KEYCHAIN_SERVICE = 'loredex-client-mcp'
const CRED_DIR = join(homedir(), '.config', 'loredex')
const MAP_FILE = join(CRED_DIR, 'client-credentials')

function readMap(): Record<string, string> {
  try {
    if (!existsSync(MAP_FILE)) return {}
    const plain = decryptCredString(readFileSync(MAP_FILE))
    return plain ? (JSON.parse(plain) as Record<string, string>) : {}
  } catch {
    return {}
  }
}

function writeMap(map: Record<string, string>): void {
  mkdirSync(CRED_DIR, { recursive: true })
  writeFileSync(MAP_FILE, encryptCredString(JSON.stringify(map)), { mode: 0o600 })
  chmodSync(MAP_FILE, 0o600)
}

export async function storeClientToken(ref: string, token: string): Promise<void> {
  if (process.platform !== 'darwin') {
    writeMap({ ...readMap(), [ref]: token })
    return
  }
  await execFileAsync(
    'security',
    ['add-generic-password', '-U', '-s', KEYCHAIN_SERVICE, '-a', ref, '-w', token],
    { timeout: 5000 },
  )
}

export async function readClientToken(ref: string): Promise<string | null> {
  if (process.platform !== 'darwin') return readMap()[ref] ?? null
  try {
    const { stdout } = await execFileAsync(
      'security',
      ['find-generic-password', '-s', KEYCHAIN_SERVICE, '-a', ref, '-w'],
      { timeout: 5000 },
    )
    return stdout.trim() || null
  } catch {
    return null
  }
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
    const map = readMap()
    delete map[ref]
    writeMap(map)
    return
  }
  try {
    await execFileAsync(
      'security',
      ['delete-generic-password', '-s', KEYCHAIN_SERVICE, '-a', ref],
      { timeout: 5000 },
    )
  } catch {
    // nothing stored — delete is idempotent
  }
}
