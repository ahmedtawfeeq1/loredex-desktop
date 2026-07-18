/**
 * Per-provider adapter API keys (B1 login — the API-key auth method). Stored in
 * the OS keychain (client-tokens pattern) keyed by the billing env VAR each
 * adapter reads, and held in an in-memory cache the spawn path folds into the
 * adapter's OWN env at launch (acp-spawn.adapterEnv overlay — least-privilege
 * still applies, each adapter only ever receives its own key). The key is NEVER
 * put into the core host's broad process.env (so the embedded pty shell never
 * inherits it), the vault, a commit, a renderer payload, or a log — only
 * presence (hasKey) crosses the seam. No key set ⇒ subscription (CLI) login.
 */
import type { AcpAgent } from '../shared/ipc-contract'
import { deleteClientToken, readClientToken, storeClientToken } from './client-tokens'

/** The canonical billing env VAR per adapter (the first PROVIDER/BILLING key in
 *  acp-spawn). Setting it here is the "API key" auth path. */
const KEY_VAR: Record<AcpAgent, string> = {
  claude: 'ANTHROPIC_API_KEY',
  codex: 'OPENAI_API_KEY',
  gemini: 'GEMINI_API_KEY',
}
const AGENTS = Object.keys(KEY_VAR) as AcpAgent[]

/** Keychain account namespace so an adapter key never collides with a client
 *  MCP token sharing the same store (client-tokens). */
const keyRef = (agent: AcpAgent): string => `adapter-key/${KEY_VAR[agent]}`

/** VAR → key, in-memory only (never process.env). Empty until loadAgentKeys. */
const cache = new Map<string, string>()

export async function storeAgentKey(agent: AcpAgent, key: string): Promise<void> {
  await storeClientToken(keyRef(agent), key)
  cache.set(KEY_VAR[agent], key) // live for the next spawn — no restart
}

export async function clearAgentKey(agent: AcpAgent): Promise<void> {
  await deleteClientToken(keyRef(agent))
  cache.delete(KEY_VAR[agent])
}

/** Presence only (never the key) per provider — drives the Settings dots/masks. */
export function agentKeyStatus(): { agent: AcpAgent; hasKey: boolean }[] {
  return AGENTS.map((agent) => ({ agent, hasKey: cache.has(KEY_VAR[agent]) }))
}

/** The stored adapter keys as an env overlay (VAR → key), consumed by
 *  acp-spawn.adapterEnv at spawn. adapterEnv applies only the keys in the
 *  target agent's PROVIDER_KEYS, so cross-provider keys never leak. */
export function agentKeyEnv(): Record<string, string> {
  return Object.fromEntries(cache)
}

/** Startup (core/index.ts): fold keychain-stored adapter keys into the cache so
 *  the spawn path forwards them. Best-effort — a keychain miss just leaves the
 *  provider on subscription/unset; never blocks boot. */
export async function loadAgentKeys(): Promise<void> {
  for (const agent of AGENTS) {
    try {
      const key = await readClientToken(keyRef(agent))
      if (key) cache.set(KEY_VAR[agent], key)
    } catch {
      // keychain unavailable — skip this provider
    }
  }
}
