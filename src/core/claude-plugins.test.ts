/**
 * `/plugin install` only runs inside a claude TUI session, so loredex cannot
 * perform it — it can only VERIFY it. The check must fail CLOSED: a missing or
 * malformed registry is "not installed", never an optimistic green, and never a
 * throw that would take the Settings page down.
 *
 * Registry shape verified on a real machine 2026-07-20:
 *   {"version":2,"plugins":{"<plugin>@<marketplace>":[{...}]}}
 */
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  N8N_SKILLS_COMMAND,
  N8N_SKILLS_PLUGIN,
  hasPluginInstalled,
  hasTerminalN8nMcp,
  terminalN8nCommand,
} from './claude-plugins'

function homeWith(contents: string | null): string {
  const home = mkdtempSync(join(tmpdir(), 'loredex-claude-home-'))
  if (contents !== null) {
    mkdirSync(join(home, '.claude', 'plugins'), { recursive: true })
    writeFileSync(join(home, '.claude', 'plugins', 'installed_plugins.json'), contents)
  }
  return home
}

describe('hasPluginInstalled', () => {
  it('finds the plugin regardless of which marketplace it came from', () => {
    const home = homeWith(
      JSON.stringify({ version: 2, plugins: { 'n8n-mcp-skills@czlonkowski': [{ scope: 'user' }] } }),
    )
    expect(hasPluginInstalled(N8N_SKILLS_PLUGIN, home)).toBe(true)
  })

  it('is false when a different plugin is installed', () => {
    const home = homeWith(
      JSON.stringify({ version: 2, plugins: { 'code-review@claude-plugins-official': [{}] } }),
    )
    expect(hasPluginInstalled(N8N_SKILLS_PLUGIN, home)).toBe(false)
  })

  it('does not match a plugin whose name merely CONTAINS the target', () => {
    const home = homeWith(JSON.stringify({ version: 2, plugins: { 'not-n8n-mcp-skills@x': [{}] } }))
    expect(hasPluginInstalled(N8N_SKILLS_PLUGIN, home)).toBe(false)
  })

  it('fails closed on a missing registry', () => {
    expect(hasPluginInstalled(N8N_SKILLS_PLUGIN, homeWith(null))).toBe(false)
  })

  it('fails closed on a malformed registry rather than throwing', () => {
    expect(hasPluginInstalled(N8N_SKILLS_PLUGIN, homeWith('{not json'))).toBe(false)
    expect(hasPluginInstalled(N8N_SKILLS_PLUGIN, homeWith('{"version":2}'))).toBe(false)
  })
})

describe('N8N_SKILLS_COMMAND', () => {
  /**
   * The repo README's one-liner is wrong: Claude Code parses the argument as
   * `<plugin>@<marketplace>` and answers `Marketplace "czlonkowski/n8n-skills"
   * not found`. The marketplace must be added first, under the name from
   * marketplace.json (`n8n-mcp-skills`), not the GitHub path.
   */
  it('adds the marketplace before installing, and installs by marketplace name', () => {
    const [add, install] = N8N_SKILLS_COMMAND.split('\n')
    expect(add).toBe('/plugin marketplace add czlonkowski/n8n-skills')
    expect(install).toBe('/plugin install n8n-mcp-skills@n8n-mcp-skills')
  })

  it('never uses the README one-liner that fails', () => {
    expect(N8N_SKILLS_COMMAND).not.toContain('/plugin install czlonkowski/n8n-skills')
  })
})

describe('hasTerminalN8nMcp', () => {
  /**
   * `claude mcp add` defaults to LOCAL (project) scope, so the entry lands under
   * projects["<cwd>"].mcpServers — NOT the global map. Checking only the global
   * map (or running `claude mcp list` from the wrong directory) reports "not
   * installed" for a server that is installed and working. Shape below is taken
   * from a real ~/.claude.json after a successful add.
   */
  function homeWithClaudeJson(contents: string | null): string {
    const home = mkdtempSync(join(tmpdir(), 'loredex-claude-cfg-'))
    if (contents !== null) writeFileSync(join(home, '.claude.json'), contents)
    return home
  }

  const VAULT = '/Users/x/Business/clients_work'

  it('finds a PROJECT-scoped server under the vault path', () => {
    const home = homeWithClaudeJson(
      JSON.stringify({ projects: { [VAULT]: { mcpServers: { 'n8n-mcp': {} } } } }),
    )
    expect(hasTerminalN8nMcp(VAULT, home)).toBe(true)
  })

  it('finds a user-scoped server in the global map', () => {
    const home = homeWithClaudeJson(JSON.stringify({ mcpServers: { 'n8n-mcp': {} } }))
    expect(hasTerminalN8nMcp(null, home)).toBe(true)
  })

  it('does not report a server registered under a DIFFERENT project', () => {
    const home = homeWithClaudeJson(
      JSON.stringify({ projects: { '/some/other/dir': { mcpServers: { 'n8n-mcp': {} } } } }),
    )
    expect(hasTerminalN8nMcp(VAULT, home)).toBe(false)
  })

  it('is false when only other servers are registered', () => {
    const home = homeWithClaudeJson(
      JSON.stringify({ mcpServers: { atlassian: {}, ticktick: {} }, projects: {} }),
    )
    expect(hasTerminalN8nMcp(VAULT, home)).toBe(false)
  })

  it('fails closed on a missing or malformed config', () => {
    expect(hasTerminalN8nMcp(VAULT, homeWithClaudeJson(null))).toBe(false)
    expect(hasTerminalN8nMcp(VAULT, homeWithClaudeJson('{not json'))).toBe(false)
  })
})

describe('terminalN8nCommand', () => {
  it('NEVER contains a real key — only a placeholder', () => {
    const cmd = terminalN8nCommand('https://n8n.example.com')
    expect(cmd).toContain('<paste-your-n8n-api-key>')
    expect(cmd).toContain('https://n8n.example.com')
    expect(cmd).toContain('n8n-mcp')
  })

  it('falls back to a url placeholder when none is configured', () => {
    expect(terminalN8nCommand(null)).toContain('<your-n8n-url>')
  })

  /**
   * USER scope, not the default. `claude mcp add` defaults to local/project
   * scope, keyed by the cwd — the vault. The agent panel's sessions run there
   * too, so the adapter would load that entry ON TOP of the server loredex
   * already injects: two n8n servers and 48 duplicate tools in one session.
   */
  it('registers at USER scope so it cannot duplicate the injected server', () => {
    expect(terminalN8nCommand('https://n8n.example.com')).toContain('--scope user')
  })
})
