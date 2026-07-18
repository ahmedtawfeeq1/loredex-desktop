/**
 * ACP adapter process plumbing (acp blueprint 2026-07-18). Resolution, env
 * and spawn for the pinned claude/codex ACP adapters — a dependency on disk,
 * never npx/PATH. SECURITY: adapter stdout is the ACP wire — NEVER log it;
 * stderr may carry tokens/URLs — it lives ONLY in the bounded StderrRing and
 * surfaces as a 4-line tail on error, never wholesale.
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import type { AcpAgent } from '../shared/ipc-contract'

const ADAPTER_PKG: Record<AcpAgent, string> = {
  claude: '@agentclientprotocol/claude-agent-acp',
  codex: '@agentclientprotocol/codex-acp',
}

/** Resolve the adapter's bin entry (dist/index.js for both, verified against
 *  the published 0.59.0 / 1.1.4 tarballs — a version bump must re-verify)
 *  from OUR node_modules. require.resolve of package.json dodges "main" vs
 *  "bin" drift (claude's main is dist/lib.js; the bin is dist/index.js). */
export function adapterEntry(agent: AcpAgent): string {
  const pkgJson = createRequire(import.meta.url).resolve(`${ADAPTER_PKG[agent]}/package.json`)
  return join(dirname(pkgJson), 'dist/index.js')
}

/** Env keys forwarded ONLY when already present in our own env. */
const PASSTHROUGH = [
  'ANTHROPIC_API_KEY',
  'CLAUDE_CODE_EXECUTABLE',
  'CODEX_API_KEY',
  'OPENAI_API_KEY',
  'CODEX_PATH',
] as const

/** Explicit env allowlist — the OPPOSITE of the pty's full inherit
 *  (terminals.ts:78 is the user's own shell; an adapter gets only what it
 *  needs). HOME is the credential root (keychain / ~/.claude / ~/.codex),
 *  PATH for the agent's own subprocesses, the rest is shell hygiene.
 *  ELECTRON_RUN_AS_NODE makes process.execPath behave as plain node — the
 *  claude adapter needs node ≥22 and Electron 43 embeds Node 24; the user's
 *  system node is never relied on. */
export function adapterEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ELECTRON_RUN_AS_NODE: '1' }
  for (const key of ['HOME', 'PATH', 'USER', 'LOGNAME', 'SHELL', 'TMPDIR', 'LANG', ...PASSTHROUGH]) {
    const v = process.env[key]
    if (v !== undefined) env[key] = v
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

/** execFile-style argv, no shell ever. cwd is validated by the caller. */
export function spawnAdapter(agent: AcpAgent, cwd: string): ChildProcessWithoutNullStreams {
  return spawn(process.execPath, [adapterEntry(agent)], {
    cwd,
    env: adapterEnv(),
    stdio: ['pipe', 'pipe', 'pipe'],
  })
}
