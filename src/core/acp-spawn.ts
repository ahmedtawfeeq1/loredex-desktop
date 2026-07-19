/**
 * ACP adapter process plumbing (acp blueprint 2026-07-18). Resolution, env
 * and spawn for the pinned claude/codex ACP adapters — a dependency on disk,
 * never npx/PATH. SECURITY: adapter stdout is the ACP wire — NEVER log it;
 * stderr may carry tokens/URLs — it lives ONLY in the bounded StderrRing and
 * surfaces as a 4-line tail on error, never wholesale.
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, sep } from 'node:path'
import type { AcpAgent } from '../shared/ipc-contract'

/** How an adapter process comes to exist. `node-module` adapters ship in OUR
 *  node_modules (claude, codex) and run their resolved dist/index.js under
 *  this Electron binary as plain node; a `user-binary` adapter (gemini) is the
 *  user's own CLI on PATH — never installed by us — invoked with its ACP flag.
 *  Adding a provider = one row here (+ the AcpAgent union), no new spawn code. */
type AdapterSpawn =
  | { kind: 'node-module'; pkg: string }
  | { kind: 'user-binary'; bin: string; args: string[] }

const ADAPTER: Record<AcpAgent, AdapterSpawn> = {
  claude: { kind: 'node-module', pkg: '@agentclientprotocol/claude-agent-acp' },
  codex: { kind: 'node-module', pkg: '@agentclientprotocol/codex-acp' },
  // gemini rides the user's own `@google/gemini-cli` on PATH (ARCHITECT-ONLY
  // this round: not installed, not live-tested; a missing binary surfaces a
  // clean ENOENT hint via spawnErrorDetail, never a crash).
  gemini: { kind: 'user-binary', bin: 'gemini', args: ['--experimental-acp'] },
}

/** Resolve a node-module adapter's bin entry (dist/index.js for both, verified
 *  against the published 0.59.0 / 1.1.4 tarballs — a version bump must
 *  re-verify) from OUR node_modules. require.resolve of package.json dodges
 *  "main" vs "bin" drift (claude's main is dist/lib.js; the bin is
 *  dist/index.js). Only meaningful for node-module adapters. */
export function adapterEntry(agent: AcpAgent): string {
  const spec = ADAPTER[agent]
  if (spec.kind !== 'node-module') throw new Error(`${agent} is not a node-module adapter`)
  const pkgJson = createRequire(import.meta.url).resolve(`${spec.pkg}/package.json`)
  const entry = join(dirname(pkgJson), 'dist/index.js')
  // Packaged: the resolver hands back an app.asar path, but the adapter + its
  // native-binary deps are asarUnpacked. Run the entry from the UNPACKED tree so
  // the adapter's OWN require.resolve stays under app.asar.unpacked — otherwise
  // the claude/codex runtime it spawns resolves to a path INSIDE app.asar, which
  // is not a real directory and cannot be exec'd ("Internal error" / -32603, the
  // v0.9.1–0.9.2 packaged-provider failure). No-op in dev (no asar segment).
  const unpacked = entry.replace(`${sep}app.asar${sep}`, `${sep}app.asar.unpacked${sep}`)
  return unpacked !== entry && existsSync(unpacked) ? unpacked : entry
}

/** Shell-hygiene + credential-root keys every adapter needs. HOME is the
 *  credential root (keychain / ~/.claude / ~/.codex), PATH for the agent's own
 *  subprocesses, the rest is shell hygiene. Forwarded ONLY when already set. */
const SHARED = ['HOME', 'PATH', 'USER', 'LOGNAME', 'SHELL', 'TMPDIR', 'LANG'] as const

/** Provider credentials scoped PER agent — least privilege: a Codex adapter
 *  must never receive ANTHROPIC_API_KEY, nor a Claude adapter the user's
 *  OPENAI_API_KEY/CODEX_API_KEY. Each is forwarded only when already set. */
const PROVIDER_KEYS: Record<AcpAgent, readonly string[]> = {
  claude: ['ANTHROPIC_API_KEY', 'CLAUDE_CODE_EXECUTABLE'],
  codex: ['OPENAI_API_KEY', 'CODEX_API_KEY', 'CODEX_PATH'],
  gemini: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
}

/** The BILLING credentials only (not executable-path hints). Presence of one
 *  means the adapter authenticates by API key (pay-per-token); absence means it
 *  falls back to the CLI subscription login (~/.claude, ~/.codex — plan quota).
 *  Drives the usage meter's "plan quota" vs "API" tag so the cost figure reads
 *  as an estimate, not a bill, on a subscription. */
const BILLING_KEYS: Record<AcpAgent, readonly string[]> = {
  claude: ['ANTHROPIC_API_KEY'],
  codex: ['OPENAI_API_KEY', 'CODEX_API_KEY'],
  gemini: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'],
}

/** How THIS process would authenticate the given adapter, from the env it will
 *  forward. Computed at spawn/ready and surfaced per session. `overlay` carries
 *  keychain-stored keys (agent-keys) that aren't in process.env — a stored
 *  billing key still counts as 'api'. */
export function authMode(
  agent: AcpAgent,
  overlay?: Record<string, string>,
): 'api' | 'subscription' {
  return BILLING_KEYS[agent].some((k) => (overlay?.[k] ?? process.env[k]) !== undefined)
    ? 'api'
    : 'subscription'
}

/** Explicit env allowlist — the OPPOSITE of the pty's full inherit
 *  (terminals.ts:78 is the user's own shell; an adapter gets only what it
 *  needs). ELECTRON_RUN_AS_NODE makes process.execPath behave as plain node —
 *  the claude adapter needs node ≥22 and Electron 43 embeds Node 24; the
 *  user's system node is never relied on. */
export function adapterEnv(agent: AcpAgent, overlay?: Record<string, string>): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ELECTRON_RUN_AS_NODE: '1' }
  for (const key of [...SHARED, ...PROVIDER_KEYS[agent]]) {
    const v = process.env[key]
    if (v !== undefined) env[key] = v
  }
  // keychain-stored keys (agent-keys, B1 Settings) win over ambient env, but
  // ONLY for THIS agent's provider keys — least-privilege holds, a claude
  // adapter never receives a stored OPENAI_API_KEY.
  if (overlay) {
    for (const key of PROVIDER_KEYS[agent]) {
      if (overlay[key] !== undefined) env[key] = overlay[key]
    }
  }
  return env
}

/** Bounded stderr tail for error surfacing (engine.ts stderr-tail pattern):
 *  keep the last `cap` bytes only, expose the last 4 non-empty lines. */
export class StderrRing {
  private buf = ''
  constructor(private readonly cap: number = 4096) {}

  push(chunk: Buffer | string): void {
    this.buf += chunk.toString()
    if (this.buf.length > this.cap) this.buf = this.buf.slice(this.buf.length - this.cap)
  }

  /** last 4 non-empty lines, joined — the acp.session error detail */
  tail(): string {
    return this.buf
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
      .slice(-4)
      .join('\n')
  }
}

/** execFile-style argv, no shell ever. cwd is validated by the caller. A
 *  node-module adapter runs its resolved entry under process.execPath (plain
 *  node via ELECTRON_RUN_AS_NODE); a user-binary adapter (gemini) spawns its
 *  CLI off PATH with its ACP flag. A missing PATH binary fails asynchronously
 *  via the child's 'error' event (ENOENT) — boot maps it through
 *  spawnErrorDetail, never a synchronous throw / crash. */
export function spawnAdapter(
  agent: AcpAgent,
  cwd: string,
  overlay?: Record<string, string>,
): ChildProcessWithoutNullStreams {
  const spec = ADAPTER[agent]
  const env = adapterEnv(agent, overlay)
  if (spec.kind === 'user-binary') {
    return spawn(spec.bin, spec.args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] })
  }
  return spawn(process.execPath, [adapterEntry(agent)], {
    cwd,
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
}

/** Friendly, bounded detail for a spawn failure ('error' event). A user-binary
 *  adapter that isn't on PATH fires ENOENT — surface an actionable install hint
 *  instead of the raw "spawn gemini ENOENT". Everything else: first line only.
 *  gemini is the sole user-binary, so the package name is fixed; a second such
 *  adapter would move the hint into the descriptor. */
export function spawnErrorDetail(agent: AcpAgent, err: unknown): string {
  const spec = ADAPTER[agent]
  const code = (err as NodeJS.ErrnoException | null)?.code
  if (spec.kind === 'user-binary' && code === 'ENOENT') {
    return `${spec.bin} CLI not found — install @google/gemini-cli`
  }
  return (err instanceof Error ? err.message : String(err)).split('\n')[0]
}
