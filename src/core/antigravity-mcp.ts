/**
 * Antigravity CLI (`agy`) MCP synchronization.
 *
 * Claude Code discovers MCP servers by scanning the current directory's `./.mcp.json`.
 * Antigravity CLI (`agy`) does NOT read `.mcp.json`; it reads `~/.gemini/config/mcp_config.json`
 * and expects remote HTTP/SSE endpoints to declare `serverUrl` instead of `url`.
 *
 * This module ensures:
 * 1. Any client MCP server (like `genudo`) from `.mcp.json` or `workspace.yml` is converted
 *    to Antigravity schema (`serverUrl`).
 * 2. Client workspace files (`.agents/mcp_config.json` and `.gemini/settings.json`) are written.
 * 3. The global `~/.gemini/config/mcp_config.json` is safely merged so that running `agy`
 *    in the terminal immediately has access to all client tools without manual configuration.
 * 4. Dropped servers (specifically `genudo-old-platform`) are proactively purged.
 * 5. Test runs never mutate user's global ~/.gemini/config/mcp_config.json.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import { ensureGenudoPluginInstalled } from './genudo-plugin-bundle'

/** Servers that are permanently dropped and must never be synced. */
export const DROPPED_MCP_SERVERS = new Set(['genudo-old-platform'])

/** Default path to global Antigravity MCP configuration. */
export function defaultGlobalConfigPath(): string {
  return join(homedir(), '.gemini', 'config', 'mcp_config.json')
}

/** Convert a single server entry (from .mcp.json format) to Antigravity schema. */
export function toAntigravityServer(server: unknown): Record<string, unknown> {
  if (!server || typeof server !== 'object') return {}
  const raw = server as Record<string, unknown>
  const out: Record<string, unknown> = { ...raw }

  // Antigravity expects `serverUrl` for remote HTTP / SSE servers
  if (typeof raw.url === 'string' && !raw.serverUrl) {
    out.serverUrl = raw.url
  }
  return out
}

/** Convert a dictionary of MCP servers to Antigravity schema, filtering dropped servers. */
export function toAntigravityServers(
  servers: Record<string, unknown>,
): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {}
  for (const [name, cfg] of Object.entries(servers)) {
    if (DROPPED_MCP_SERVERS.has(name)) continue
    if (cfg && typeof cfg === 'object') {
      out[name] = toAntigravityServer(cfg)
    }
  }
  return out
}

/**
 * Merge servers into the global Antigravity configuration file (`~/.gemini/config/mcp_config.json`).
 * Existing servers (e.g. user-configured Supabase, LangSmith) are preserved.
 * Dropped servers are purged.
 */
export function syncGlobalAntigravityMcp(
  servers: Record<string, unknown>,
  configPath: string = defaultGlobalConfigPath(),
): void {
  try {
    // In test environment, never mutate user's default global config
    const isDefault = configPath === defaultGlobalConfigPath()
    if ((process.env.NODE_ENV === 'test' || process.env.VITEST) && isDefault) {
      return
    }

    const agyServers = toAntigravityServers(servers)

    let current: { mcpServers?: Record<string, unknown> } = {}
    if (existsSync(configPath)) {
      try {
        current = JSON.parse(readFileSync(configPath, 'utf8')) as {
          mcpServers?: Record<string, unknown>
        }
      } catch {
        current = {}
      }
    }
    current.mcpServers ??= {}

    // Scrub dropped servers
    for (const dropped of DROPPED_MCP_SERVERS) {
      if (dropped in current.mcpServers) {
        delete current.mcpServers[dropped]
      }
    }

    for (const [name, cfg] of Object.entries(agyServers)) {
      if (!DROPPED_MCP_SERVERS.has(name)) {
        current.mcpServers[name] = cfg
      }
    }

    const dir = dirname(configPath)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    writeFileSync(configPath, JSON.stringify(current, null, 2) + '\n')
  } catch {
    // Non-blocking best-effort write
  }
}

/**
 * Ensure `.agents/` and `.gemini/` are added to a client's `.gitignore` so
 * local generated MCP configurations and tokens are never committed to Git.
 */
export function ensureClientGitignore(clientDir: string): void {
  try {
    const gitignorePath = join(clientDir, '.gitignore')
    const needed = ['.agents/', '.gemini/']
    let content = ''
    if (existsSync(gitignorePath)) {
      content = readFileSync(gitignorePath, 'utf8')
    }
    const lines = content.split('\n').map((l) => l.trim())
    const missing = needed.filter(
      (entry) => !lines.includes(entry) && !lines.includes(entry.replace(/\/$/, '')),
    )
    if (missing.length > 0) {
      const prefix = content.length === 0 || content.endsWith('\n') ? '' : '\n'
      writeFileSync(gitignorePath, content + prefix + missing.join('\n') + '\n')
    }
  } catch {
    // Non-blocking best-effort
  }
}

/**
 * Synchronize a client's MCP servers to:
 * 1. `clientDir/.agents/mcp_config.json` (for project-level Antigravity IDE / agents)
 * 2. `clientDir/.gemini/settings.json` (for Gemini CLI)
 * 3. `~/.gemini/config/mcp_config.json` (for global Antigravity CLI `agy`)
 */
export function syncClientWorkspaceMcp(
  clientDir: string,
  mcpServers?: Record<string, unknown>,
  globalConfigPath?: string,
  syncGlobal = true,
): void {
  try {
    ensureClientGitignore(clientDir)
    let servers = mcpServers
    const mcpJsonPath = join(clientDir, '.mcp.json')
    if (existsSync(mcpJsonPath)) {
      try {
        const parsed = JSON.parse(readFileSync(mcpJsonPath, 'utf8')) as {
          mcpServers?: Record<string, unknown>
        }
        if (parsed.mcpServers) {
          let dirty = false
          for (const dropped of DROPPED_MCP_SERVERS) {
            if (dropped in parsed.mcpServers) {
              delete parsed.mcpServers[dropped]
              dirty = true
            }
          }
          if (dirty) {
            writeFileSync(mcpJsonPath, JSON.stringify(parsed, null, 2) + '\n')
          }
        }
        if (!servers) {
          servers = parsed.mcpServers
        }
      } catch {
        // ignore malformed .mcp.json
      }
    }

    if (servers) {
      const agyServers = toAntigravityServers(servers)
      syncDirSettings(join(clientDir, '.agents'), 'mcp_config.json', agyServers)
      syncDirSettings(join(clientDir, '.gemini'), 'settings.json', agyServers)
      if (syncGlobal) {
        syncGlobalAntigravityMcp(servers, globalConfigPath)
      }
    }
  } catch {
    // Non-blocking best-effort write
  }
}

function syncDirSettings(dir: string, file: string, mcpServers?: Record<string, unknown>): void {
  try {
    const filePath = join(dir, file)
    if (!mcpServers || Object.keys(mcpServers).length === 0) {
      if (existsSync(filePath)) {
        let current: { mcpServers?: Record<string, unknown> } = {}
        try {
          current = JSON.parse(readFileSync(filePath, 'utf8')) as {
            mcpServers?: Record<string, unknown>
          }
        } catch {
          return
        }
        delete current.mcpServers
        writeFileSync(filePath, JSON.stringify(current, null, 2) + '\n')
      }
      return
    }
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    let current: { mcpServers?: Record<string, unknown> } = {}
    if (existsSync(filePath)) {
      try {
        current = JSON.parse(readFileSync(filePath, 'utf8')) as {
          mcpServers?: Record<string, unknown>
        }
      } catch {
        current = {}
      }
    }
    current.mcpServers = mcpServers
    writeFileSync(filePath, JSON.stringify(current, null, 2) + '\n')
  } catch {
    // Non-blocking best-effort write
  }
}

/**
 * Scan all projects in the vault and sync any client that has a `.mcp.json`
 * into Antigravity global & local configurations.
 */
export function syncAllFleetToAntigravity(vaultPath: string, globalConfigPath?: string): void {
  try {
    ensureGenudoPluginInstalled()
    const projectsDir = join(vaultPath, 'projects')
    if (!existsSync(projectsDir)) return
    const entries = readdirSync(projectsDir)
    for (const name of entries) {
      const clientDir = join(projectsDir, name)
      try {
        if (!statSync(clientDir).isDirectory()) continue
        syncClientWorkspaceMcp(clientDir, undefined, globalConfigPath)
      } catch {
        // continue scanning other clients
      }
    }
  } catch {
    // Non-blocking best-effort scan
  }
}
