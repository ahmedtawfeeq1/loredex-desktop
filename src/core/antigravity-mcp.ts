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
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

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

/** Convert a dictionary of MCP servers to Antigravity schema. */
export function toAntigravityServers(
  servers: Record<string, unknown>,
): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {}
  for (const [name, cfg] of Object.entries(servers)) {
    if (cfg && typeof cfg === 'object') {
      out[name] = toAntigravityServer(cfg)
    }
  }
  return out
}

/**
 * Merge servers into the global Antigravity configuration file (`~/.gemini/config/mcp_config.json`).
 * Existing servers (e.g. user-configured Supabase, TickTick, Cal.com) are preserved.
 */
export function syncGlobalAntigravityMcp(
  servers: Record<string, unknown>,
  configPath: string = defaultGlobalConfigPath(),
): void {
  try {
    const agyServers = toAntigravityServers(servers)
    if (Object.keys(agyServers).length === 0) return

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

    for (const [name, cfg] of Object.entries(agyServers)) {
      current.mcpServers[name] = cfg
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
 * Synchronize a client's MCP servers to:
 * 1. `clientDir/.agents/mcp_config.json` (for project-level Antigravity IDE / agents)
 * 2. `clientDir/.gemini/settings.json` (for Gemini CLI)
 * 3. `~/.gemini/config/mcp_config.json` (for global Antigravity CLI `agy`)
 */
export function syncClientWorkspaceMcp(
  clientDir: string,
  mcpServers?: Record<string, unknown>,
  globalConfigPath?: string,
): void {
  try {
    let servers = mcpServers
    if (!servers) {
      const mcpJsonPath = join(clientDir, '.mcp.json')
      if (existsSync(mcpJsonPath)) {
        try {
          const parsed = JSON.parse(readFileSync(mcpJsonPath, 'utf8')) as {
            mcpServers?: Record<string, unknown>
          }
          servers = parsed.mcpServers
        } catch {
          // ignore malformed .mcp.json
        }
      }
    }

    if (servers && Object.keys(servers).length > 0) {
      const agyServers = toAntigravityServers(servers)
      syncDirSettings(join(clientDir, '.agents'), 'mcp_config.json', agyServers)
      syncDirSettings(join(clientDir, '.gemini'), 'settings.json', agyServers)
      syncGlobalAntigravityMcp(servers, globalConfigPath)
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
