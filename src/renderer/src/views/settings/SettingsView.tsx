/**
 * Settings (v3 parity slice C — reference screens 08–17): the two-pane IA.
 * Left: settings-nav (search filter · WORKSPACE·SHARED / PERSONAL·THIS
 * MACHINE / SYSTEM groups · h28 rows with live status dots on the SYSTEM
 * trio). Right: one section at a time, ~720px column. Every v2 capability
 * keeps a section (§5.1): identity, theme, typography, scope globs,
 * duplicates, contract roots+globs, MCP port + the new real switches,
 * sync health (the dissolved Sync view), GitHub auth, agent tokens.
 */
import { useEffect, useMemo, useState } from 'react'
import { invoke } from '../../api'
import { dotTone, useSync } from '../../stores/sync'
import { type SettingsSection, useSettingsTab } from '../../stores/settingsTab'
import { AgentTokensCard } from '../agents/AgentsView'
import { SyncPanel } from '../sync/SyncPanel'
import { ContractsSection } from './ContractsSection'
import { DuplicatesSection } from './DuplicatesSection'
import { GeneralSection } from './GeneralSection'
import { GitHubSection } from './GitHubSection'
import { IdentityForm } from './IdentityForm'
import { McpServerSection } from './McpServerSection'
import { ScopeSettings } from './ScopeSettings'
import { ShortcutsSection } from './ShortcutsSection'
import { ThemeSection } from './ThemeSection'
import { TypographySection } from './TypographySection'

interface Entry {
  id: SettingsSection
  label: string
}

const GROUPS: ReadonlyArray<{ label: string; entries: Entry[] }> = [
  {
    label: 'WORKSPACE · SHARED',
    entries: [
      { id: 'general', label: 'General' },
      { id: 'projects-contracts', label: 'Projects & contracts' },
      { id: 'members-agents', label: 'Members & agents' },
      { id: 'filing-rules', label: 'Filing rules' },
    ],
  },
  {
    label: 'PERSONAL · THIS MACHINE',
    entries: [
      { id: 'appearance', label: 'Appearance' },
      { id: 'typography', label: 'Typography' },
      { id: 'shortcuts', label: 'Shortcuts' },
    ],
  },
  {
    label: 'SYSTEM',
    entries: [
      { id: 'mcp-server', label: 'MCP server' },
      { id: 'sync-git', label: 'Sync & git' },
      { id: 'github', label: 'GitHub' },
    ],
  },
]

const TITLES: Record<SettingsSection, string> = {
  general: 'General',
  'projects-contracts': 'Projects & contracts',
  'members-agents': 'Members & agents',
  'filing-rules': 'Filing rules',
  appearance: 'Appearance',
  typography: 'Typography',
  shortcuts: 'Shortcuts',
  'mcp-server': 'MCP server',
  'sync-git': 'Sync & git',
  github: 'GitHub',
}

/** SYSTEM rows carry live dots: green healthy, rust broken, none elsewhere. */
function useSystemDots(): Partial<Record<SettingsSection, 'ok' | 'rust'>> {
  const health = useSync((s) => s.health)
  const mcp = useSync((s) => s.mcp)
  const [gh, setGh] = useState<'ok' | 'rust' | undefined>(undefined)
  useEffect(() => {
    void invoke('auth.status', undefined)
      .then((st) => setGh(st.signedIn ? 'ok' : 'rust'))
      .catch(() => setGh(undefined))
  }, [])
  return {
    'mcp-server': mcp?.state === 'running' ? 'ok' : mcp ? 'rust' : undefined,
    'sync-git': health ? (dotTone(health) === 'rust' ? 'rust' : 'ok') : undefined,
    github: gh,
  }
}

export function SettingsView(): React.JSX.Element {
  const section = useSettingsTab((s) => s.section)
  const setSection = useSettingsTab((s) => s.setSection)
  const [query, setQuery] = useState('')
  const dots = useSystemDots()
  const load = useSync((s) => s.load)
  const health = useSync((s) => s.health)

  useEffect(() => {
    if (!health) void load()
  }, [health, load])

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return GROUPS
    return GROUPS.map((g) => ({
      ...g,
      entries: g.entries.filter((e) => e.label.toLowerCase().includes(q)),
    })).filter((g) => g.entries.length > 0)
  }, [query])

  return (
    <div className="settings-v3">
      <div className="settings-nav" aria-label="Settings sections">
        <input
          className="settings-search"
          placeholder="search settings…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {groups.map((g) => (
          <div key={g.label} className="settings-group">
            <div className="label settings-group-label">{g.label}</div>
            {g.entries.map((e) => (
              <button
                key={e.id}
                type="button"
                className="settings-row-nav"
                aria-current={section === e.id ? 'page' : undefined}
                onClick={() => setSection(e.id)}
              >
                <span className="settings-row-label">{e.label}</span>
                {dots[e.id] && <span className={`settings-dot dot-${dots[e.id]}`} />}
              </button>
            ))}
          </div>
        ))}
      </div>
      <div className="settings-content" role="region" aria-label={TITLES[section]}>
        <h1 className="settings-h1">{TITLES[section]}</h1>
        {section === 'general' && <GeneralSection />}
        {section === 'projects-contracts' && <ContractsSection />}
        {section === 'members-agents' && (
          <>
            <IdentityForm />
            <AgentTokensCard />
            <p className="meta settings-foot">
              humans from git attribution · agents from MCP tokens — one roster
            </p>
          </>
        )}
        {section === 'filing-rules' && (
          <>
            <ScopeSettings />
            <DuplicatesSection />
          </>
        )}
        {section === 'appearance' && <ThemeSection />}
        {section === 'typography' && <TypographySection />}
        {section === 'shortcuts' && <ShortcutsSection />}
        {section === 'mcp-server' && <McpServerSection />}
        {section === 'sync-git' && <SyncPanel />}
        {section === 'github' && <GitHubSection />}
      </div>
    </div>
  )
}
