/**
 * GitHub auth (DESIGN v3 §9 + handoff/AUTH-GITHUB.md, story 26.7).
 * Principles: no loredex server ever; login is OPTIONAL (SSH dexes need
 * none); GitHub is identity + storage; least scopes; token never in the
 * dex repo, app.db, logs, or the MCP surface.
 *
 * Approaches, in spec order:
 *   A) reuse a `gh` CLI session (auto-detected, token read live — never copied)
 *   B) OAuth device flow — implemented, gated on the registered public
 *      client_id (empty until the OAuth app exists; UI hides the door)
 *   C) paste a PAT — validated via GET /user, stored per-OS
 *
 * Token store (macOS): the login Keychain via `security`, service `loredex`,
 * account `github.com` — one shared entry the CLI reads too. Other OSes fall
 * back to nothing here (encrypted-file fallback tracked in the story) — auth
 * degrades to gh reuse.
 */
import { execFile } from 'node:child_process'
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, hostname, userInfo } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { AuthStatus, DeviceCode, DexRepo } from '../shared/types'

const execFileAsync = promisify(execFile)

/** The registered Loredex OAuth app's public client id (AUTH-GITHUB §1B) —
 *  public by design, no secret ever ships in this binary. Device flow only. */
export const GITHUB_CLIENT_ID = 'Ov23li2lIaJzy9DFjm1K'

export const DEVICE_FLOW_SCOPES = 'repo read:org'

const KEYCHAIN_SERVICE = 'loredex'
const KEYCHAIN_ACCOUNT = 'github.com'

// ── token store (AUTH-GITHUB §2) ────────────────────────────────────────────
// macOS: the login Keychain via `security` — the one entry the CLI shares.
// Windows/Linux (story 26.9): the spec's sanctioned fallback — an AES-256-GCM
// file under ~/.config/loredex/credentials, keyed off a machine-local scrypt
// (hostname + user), chmod 0600, flagged honestly in Settings. Upgrades to
// Credential Manager / libsecret when a native module is worth its weight.

const CRED_DIR = join(homedir(), '.config', 'loredex')
const CRED_FILE = join(CRED_DIR, 'credentials')

function machineKey(): Buffer {
  return scryptSync(`loredex:${hostname()}:${userInfo().username}`, 'loredex-cred-v1', 32)
}

function readEncryptedFile(): string | null {
  try {
    if (!existsSync(CRED_FILE)) return null
    const raw = readFileSync(CRED_FILE)
    const iv = raw.subarray(0, 12)
    const tag = raw.subarray(12, 28)
    const data = raw.subarray(28)
    const d = createDecipheriv('aes-256-gcm', machineKey(), iv)
    d.setAuthTag(tag)
    return Buffer.concat([d.update(data), d.final()]).toString('utf8') || null
  } catch {
    return null
  }
}

function writeEncryptedFile(token: string): void {
  mkdirSync(CRED_DIR, { recursive: true })
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', machineKey(), iv)
  const data = Buffer.concat([c.update(token, 'utf8'), c.final()])
  writeFileSync(CRED_FILE, Buffer.concat([iv, c.getAuthTag(), data]), { mode: 0o600 })
  chmodSync(CRED_FILE, 0o600)
}

export type TokenStore = 'keychain' | 'encrypted-file'

export async function storedToken(): Promise<string | null> {
  if (process.platform !== 'darwin') return readEncryptedFile()
  try {
    const { stdout } = await execFileAsync(
      'security',
      ['find-generic-password', '-s', KEYCHAIN_SERVICE, '-a', KEYCHAIN_ACCOUNT, '-w'],
      { timeout: 5000 },
    )
    return stdout.trim() || null
  } catch {
    return null
  }
}

export async function storeToken(token: string): Promise<TokenStore | null> {
  if (process.platform !== 'darwin') {
    writeEncryptedFile(token)
    return 'encrypted-file'
  }
  await execFileAsync(
    'security',
    ['add-generic-password', '-U', '-s', KEYCHAIN_SERVICE, '-a', KEYCHAIN_ACCOUNT, '-w', token],
    { timeout: 5000 },
  )
  return 'keychain'
}

export async function deleteToken(): Promise<void> {
  if (process.platform !== 'darwin') {
    try {
      rmSync(CRED_FILE, { force: true })
    } catch {
      // nothing stored — logout is idempotent
    }
    return
  }
  try {
    await execFileAsync(
      'security',
      ['delete-generic-password', '-s', KEYCHAIN_SERVICE, '-a', KEYCHAIN_ACCOUNT],
      { timeout: 5000 },
    )
  } catch {
    // nothing stored — logout is idempotent
  }
}

const PLATFORM_STORE: TokenStore = process.platform === 'darwin' ? 'keychain' : 'encrypted-file'

// ── approach A: live gh session (never copied into our store) ──────────────

export async function ghToken(): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('gh', ['auth', 'token'], { timeout: 5000 })
    return stdout.trim() || null
  } catch {
    return null
  }
}

// ── GitHub API (fetch seam for tests) ───────────────────────────────────────

export type Fetcher = typeof fetch

function ghHeaders(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

export async function validateToken(
  token: string,
  fetcher: Fetcher = fetch,
): Promise<{ login: string; scopes: string[] } | null> {
  const res = await fetcher('https://api.github.com/user', { headers: ghHeaders(token) })
  if (!res.ok) return null
  const user = (await res.json()) as { login?: string }
  if (typeof user.login !== 'string') return null
  const scopes = (res.headers.get('x-oauth-scopes') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return { login: user.login, scopes }
}

/** The auth picture, spec order: stored token first (explicit sign-in wins),
 *  then a live gh session; masked account only — the token never leaves. */
export async function authStatus(fetcher: Fetcher = fetch): Promise<AuthStatus> {
  const stored = await storedToken()
  if (stored) {
    const user = await validateToken(stored, fetcher)
    if (user)
      return {
        signedIn: true,
        account: user.login,
        source: 'stored',
        store: PLATFORM_STORE,
        scopes: user.scopes,
        tokenMask: maskToken(stored),
      }
    // revoked (AUTH-GITHUB §5): report honestly, keep the entry for re-auth UX
    return { signedIn: false, account: null, source: 'revoked', store: PLATFORM_STORE, scopes: [], tokenMask: maskToken(stored) }
  }
  const gh = await ghToken()
  if (gh) {
    const user = await validateToken(gh, fetcher)
    if (user)
      return {
        signedIn: true,
        account: user.login,
        source: 'gh',
        store: 'gh',
        scopes: user.scopes,
        tokenMask: maskToken(gh),
      }
  }
  return { signedIn: false, account: null, source: null, store: null, scopes: [], tokenMask: null }
}

export function maskToken(token: string): string {
  return token.length <= 8 ? '…' : `${token.slice(0, 4)}…${token.slice(-4)}`
}

/** Whichever token is live (stored wins, then gh) — internal to the core,
 *  NEVER exposed over IPC or MCP (AUTH-GITHUB §6). */
export async function liveToken(): Promise<string | null> {
  return (await storedToken()) ?? (await ghToken())
}

// ── device flow (AUTH-GITHUB §1B) — gated on GITHUB_CLIENT_ID ───────────────

export async function deviceFlowStart(fetcher: Fetcher = fetch): Promise<DeviceCode> {
  if (!GITHUB_CLIENT_ID) throw new Error('DEVICE_FLOW_UNCONFIGURED')
  const res = await fetcher('https://github.com/login/device/code', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: GITHUB_CLIENT_ID, scope: DEVICE_FLOW_SCOPES }),
  })
  const body = (await res.json()) as Record<string, unknown>
  return {
    deviceCode: String(body.device_code ?? ''),
    userCode: String(body.user_code ?? ''),
    verificationUri: String(body.verification_uri ?? 'https://github.com/login/device'),
    intervalSeconds: Number(body.interval ?? 5),
    expiresInSeconds: Number(body.expires_in ?? 900),
  }
}

export type DevicePollResult =
  | { state: 'authorized'; token: string }
  | { state: 'pending' | 'slow_down' | 'expired' | 'denied' }

/** One poll of the token endpoint — the §5 state machine, one honest state
 *  per outcome. The caller owns pacing (+5 s on slow_down). */
export async function deviceFlowPoll(
  deviceCode: string,
  fetcher: Fetcher = fetch,
): Promise<DevicePollResult> {
  const res = await fetcher('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: GITHUB_CLIENT_ID,
      device_code: deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    }),
  })
  const body = (await res.json()) as Record<string, unknown>
  if (typeof body.access_token === 'string') return { state: 'authorized', token: body.access_token }
  switch (body.error) {
    case 'authorization_pending':
      return { state: 'pending' }
    case 'slow_down':
      return { state: 'slow_down' }
    case 'expired_token':
      return { state: 'expired' }
    default:
      return { state: 'denied' }
  }
}

// ── dex registry (AUTH-GITHUB §3): repos carrying the loredex-dex topic ─────

export const DEX_TOPIC = 'loredex-dex'

interface RepoJson {
  name?: string
  full_name?: string
  private?: boolean
  topics?: string[]
  clone_url?: string
  ssh_url?: string
  pushed_at?: string
  owner?: { login?: string }
}

export function toDexRepo(r: RepoJson): DexRepo | null {
  if (!r.full_name || !Array.isArray(r.topics) || !r.topics.includes(DEX_TOPIC)) return null
  return {
    fullName: r.full_name,
    owner: r.owner?.login ?? r.full_name.split('/')[0] ?? '',
    name: r.name ?? r.full_name.split('/')[1] ?? '',
    isPrivate: r.private === true,
    cloneUrl: r.clone_url ?? `https://github.com/${r.full_name}.git`,
    sshUrl: r.ssh_url ?? `git@github.com:${r.full_name}.git`,
    pushedAt: r.pushed_at ?? '',
  }
}

/** Every loredex-dex repo the signed-in account can see (affiliation covers
 *  personal + org membership); paginated to 300, honest on rate limits. */
export async function listDexRepos(fetcher: Fetcher = fetch): Promise<DexRepo[]> {
  const token = await liveToken()
  if (!token) throw new Error('NOT_SIGNED_IN')
  const out: DexRepo[] = []
  for (let page = 1; page <= 3; page++) {
    const res = await fetcher(
      `https://api.github.com/user/repos?per_page=100&page=${page}&sort=pushed`,
      { headers: ghHeaders(token) },
    )
    if (res.status === 403) throw new Error('RATE_LIMITED')
    if (!res.ok) throw new Error(`GITHUB_${res.status}`)
    const repos = (await res.json()) as RepoJson[]
    for (const r of repos) {
      const dex = toDexRepo(r)
      if (dex) out.push(dex)
    }
    if (repos.length < 100) break
  }
  return out
}

/** Create a dex: new repo + the loredex-dex topic (AUTH-GITHUB §3). */
export async function createDexRepo(
  name: string,
  isPrivate: boolean,
  fetcher: Fetcher = fetch,
): Promise<DexRepo> {
  const token = await liveToken()
  if (!token) throw new Error('NOT_SIGNED_IN')
  const res = await fetcher('https://api.github.com/user/repos', {
    method: 'POST',
    headers: { ...ghHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, private: isPrivate, description: 'loredex dex — one per product' }),
  })
  if (!res.ok) throw new Error(`GITHUB_${res.status}`)
  const repo = (await res.json()) as RepoJson
  const fullName = repo.full_name ?? ''
  await fetcher(`https://api.github.com/repos/${fullName}/topics`, {
    method: 'PUT',
    headers: { ...ghHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify({ names: [DEX_TOPIC] }),
  })
  return (
    toDexRepo({ ...repo, topics: [DEX_TOPIC] }) ?? {
      fullName,
      owner: fullName.split('/')[0] ?? '',
      name: repo.name ?? '',
      isPrivate,
      cloneUrl: repo.clone_url ?? `https://github.com/${fullName}.git`,
      sshUrl: repo.ssh_url ?? `git@github.com:${fullName}.git`,
      pushedAt: '',
    }
  )
}
