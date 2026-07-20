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
import { execFile } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { N8N_MCP_VERSION } from './n8n-install'

export const N8N_SKILLS_PLUGIN = 'n8n-mcp-skills'
export const N8N_SKILLS_COMMAND = '/plugin install czlonkowski/n8n-skills'

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

/** Is n8n-mcp registered with the user's own claude CLI? Fails closed. */
export async function hasTerminalN8nMcp(): Promise<boolean> {
  return await new Promise((resolve) => {
    execFile('claude', ['mcp', 'list'], { timeout: 10_000 }, (err, stdout) => {
      resolve(!err && stdout.includes('n8n-mcp'))
    })
  })
}
