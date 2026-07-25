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
  LANGSMITH_SKILLS_COMMAND,
  N8N_SKILLS_COMMAND,
  N8N_SKILLS_PLUGIN,
  hasPluginInstalled,
  hasTerminalMcp,
  hasTerminalN8nMcp,
  terminalLangsmithCommand,
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
  it('adds the marketplace, RELOADS, installs, then RELOADS again', () => {
    const [add, reload, install, apply] = N8N_SKILLS_COMMAND.split('\n')
    expect(add).toBe('/plugin marketplace add czlonkowski/n8n-skills')
    // observed 2026-07-23: a marketplace added this session is invisible to
    // `/plugin install` until reloaded — the install fails with
    // "not found in configuration", listing only pre-session marketplaces
    expect(reload).toBe('/reload-plugins')
    expect(install).toBe('/plugin install n8n-mcp-skills@n8n-mcp-skills')
    // …and the install itself asks for one: "✓ Installed. Run /reload-plugins
    // to apply." Without it the plugin is on disk but not live in this session.
    expect(apply).toBe('/reload-plugins')
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

describe('LangSmith commands (2026-07-23)', () => {
  it('the terminal MCP command carries a placeholder key, never a stored one', () => {
    const cmd = terminalLangsmithCommand('https://api.smith.langchain.com')
    expect(cmd).toContain('<paste-your-langsmith-api-key>')
    expect(cmd).not.toMatch(/lsv2_[a-z]+_[A-Za-z0-9]/)
  })

  it('uses the http transport — LangSmith is a REMOTE server, nothing to run', () => {
    expect(terminalLangsmithCommand('https://api.smith.langchain.com')).toContain(
      '--transport http',
    )
  })

  it('points at <endpoint>/mcp, trailing slash or not', () => {
    expect(terminalLangsmithCommand('https://eu.api.smith.langchain.com/')).toContain(
      'https://eu.api.smith.langchain.com/mcp',
    )
  })

  it('registers at USER scope, for the same duplicate-server reason as n8n', () => {
    expect(terminalLangsmithCommand('https://api.smith.langchain.com')).toContain('--scope user')
  })

  /** Both verified against each repo's .claude-plugin/marketplace.json — the
   *  `<plugin>@<marketplace>` form is what Claude Code parses, and a GitHub
   *  path in that slot fails with "Marketplace not found" (the n8n lesson). */
  it('plugin install commands use <plugin>@<marketplace>, after adding the marketplace', () => {
    expect(LANGSMITH_SKILLS_COMMAND).toContain(
      '/plugin marketplace add langchain-ai/langsmith-skills',
    )
    expect(LANGSMITH_SKILLS_COMMAND).toContain('/plugin install langsmith-skills@langsmith-skills')
  })

  it('hasTerminalMcp answers for an arbitrary server name, user or project scope', () => {
    const home = mkdtempSync(join(tmpdir(), 'ls-home-'))
    writeFileSync(
      join(home, '.claude.json'),
      JSON.stringify({ projects: { '/vault': { mcpServers: { langsmith: {} } } } }),
    )
    expect(hasTerminalMcp('langsmith', '/vault', home)).toBe(true)
    expect(hasTerminalMcp('langsmith', '/elsewhere', home)).toBe(false)
    expect(hasTerminalMcp('nope', '/vault', home)).toBe(false)
  })
})

/**
 * Reported 2026-07-23 with a terminal transcript: `marketplace add` reported
 * "Successfully added marketplace: langsmith-claude-code-plugins", and the very
 * next `install` answered "Couldn't load marketplace … not found in
 * configuration", listing only marketplaces registered before the session began.
 * The footer said "Plugins changed. Run /reload-plugins to activate." — after
 * the install had already failed.
 */
describe('every plugin command reloads between add/install AND after install', () => {
  for (const [name, cmd] of [
    ['n8n skills', N8N_SKILLS_COMMAND],
    ['langsmith skills', LANGSMITH_SKILLS_COMMAND],
  ] as const) {
    it(`${name}: add → /reload-plugins → install → /reload-plugins`, () => {
      const steps = cmd.split('\n')
      expect(steps).toHaveLength(4)
      expect(steps[0]).toMatch(/^\/plugin marketplace add /)
      expect(steps[1]).toBe('/reload-plugins')
      expect(steps[2]).toMatch(/^\/plugin install \S+@\S+$/)
      // the LAST step, not just somewhere in the middle
      expect(steps[3]).toBe('/reload-plugins')
    })
  }
})
