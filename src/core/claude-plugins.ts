/**
 * Claude Code plugin detection. `/plugin install` is a TUI command inside a
 * running `claude` session — loredex cannot invoke it, so it verifies instead
 * and shows the user the command to run (the button + command + Verify pattern).
 *
 * Registry: ~/.claude/plugins/installed_plugins.json, shape
 *   {"version":2,"plugins":{"<plugin>@<marketplace>":[{...}]}}
 * Keys are `<plugin>@<marketplace>`, so the match is on the part before '@' —
 * the same plugin may come from different marketplaces.
 *
 * Every failure path returns FALSE. A false green here would tell the user their
 * skills are active when they are not.
 */
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { N8N_MCP_VERSION } from './n8n-install'

export const N8N_SKILLS_PLUGIN = 'n8n-mcp-skills'
/**
 * TWO commands, in order, inside a running `claude` session.
 *
 * The repo README's "recommended" one-liner `/plugin install czlonkowski/
 * n8n-skills` DOES NOT WORK — Claude Code reads the argument as
 * `<plugin>@<marketplace>`, so it reports `Marketplace "czlonkowski/n8n-skills"
 * not found`. The marketplace has to be registered first, and its name is
 * `n8n-mcp-skills` (from the repo's .claude-plugin/marketplace.json), not the
 * GitHub path. Verified against the live repo 2026-07-20.
 */
export const N8N_SKILLS_COMMAND =
  '/plugin marketplace add czlonkowski/n8n-skills\n/plugin install n8n-mcp-skills@n8n-mcp-skills'

/** The shell command that OPENS the session those slash commands need. They are
 *  claude slash commands, not shell commands — typed at a zsh prompt they just
 *  produce `zsh: no such file or directory: /plugin`. */
export const CLAUDE_LAUNCH_COMMAND = 'claude'

/** The server name `claude mcp add n8n-mcp …` registers under. */
export const N8N_MCP_SERVER_NAME = 'n8n-mcp'

export function hasPluginInstalled(pluginName: string, home: string = homedir()): boolean {
  try {
    const raw = readFileSync(join(home, '.claude', 'plugins', 'installed_plugins.json'), 'utf8')
    const parsed = JSON.parse(raw) as { plugins?: Record<string, unknown> }
    const plugins = parsed.plugins
    if (!plugins || typeof plugins !== 'object') return false
    // key is `<plugin>@<marketplace>` — split rather than substring-match, so
    // "not-n8n-mcp-skills@x" does not count as a hit
    return Object.keys(plugins).some((k) => k.split('@')[0] === pluginName)
  } catch {
    return false // missing, unreadable, or a format we no longer understand
  }
}

/**
 * The command that gives TERMINAL-run `claude` the n8n server.
 *
 * SECURITY: the API key is a PLACEHOLDER, never the real key. Interpolating the
 * stored key here would carry it across the IPC seam to the renderer — the one
 * thing every credential path in this app refuses to do. The URL is not secret,
 * so it is filled in; the user pastes their own key.
 *
 * NOTE this is `npx`, not our resolved entry: the command runs in the USER's
 * shell under their own node, where npx is the documented invocation. Our
 * in-app injection still uses the resolved path and never touches npx.
 */
export function terminalN8nCommand(url: string | null): string {
  return [
    'claude mcp add n8n-mcp',
    '-e MCP_MODE=stdio',
    '-e LOG_LEVEL=error',
    '-e DISABLE_CONSOLE_OUTPUT=true',
    `-e N8N_API_URL=${url ?? '<your-n8n-url>'}`,
    '-e N8N_API_KEY=<paste-your-n8n-api-key>',
    `-- npx n8n-mcp@${N8N_MCP_VERSION}`,
  ].join(' ')
}

/**
 * Is n8n-mcp registered with the user's own claude CLI?
 *
 * READS ~/.claude.json directly rather than shelling out to `claude mcp list`.
 * Three reasons, all learned the hard way:
 *   1. `claude mcp list` HEALTH-CHECKS every configured server — ~12s on a
 *      populated machine, and it grows with each server added. This question is
 *      one file read.
 *   2. `claude mcp add` defaults to LOCAL (project) scope, so the entry lands in
 *      `projects["<cwd>"].mcpServers`, not the global map. A `claude mcp list`
 *      run from anywhere else could never see it — which is exactly what made
 *      the card spin forever after a successful add.
 *   3. The core host may not even have `claude` on its PATH (a GUI-launched app
 *      does not inherit a login shell's PATH).
 *
 * `vaultPath` is where the user was told to run the command, so it is the scope
 * to check; the global map is checked too, for a `--scope user` install.
 * Fails closed: missing, unreadable or unexpected shape → false.
 */
export function hasTerminalN8nMcp(vaultPath?: string | null, home: string = homedir()): boolean {
  try {
    const raw = readFileSync(join(home, '.claude.json'), 'utf8')
    const cfg = JSON.parse(raw) as {
      mcpServers?: Record<string, unknown>
      projects?: Record<string, { mcpServers?: Record<string, unknown> }>
    }
    if (cfg.mcpServers && N8N_MCP_SERVER_NAME in cfg.mcpServers) return true
    if (!vaultPath) return false
    const project = cfg.projects?.[vaultPath]
    return Boolean(project?.mcpServers && N8N_MCP_SERVER_NAME in project.mcpServers)
  } catch {
    return false
  }
}
