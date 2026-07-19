/**
 * Clients view (agent-ops epic): the fleet, grouped by Manager, each client a
 * health card (pattern: ProjectLauncher/ops-health) with tag chips + inbox
 * badge; click drills to the ClientPage. Hidden from nav on research dexes.
 */
import { useEffect, useMemo, useState } from 'react'
import type { ClientInfo } from '../../../../shared/ipc-contract'
import { invoke } from '../../api'
import { useDex } from '../../stores/dex'
import { effectiveIdentity, useIdentity } from '../../stores/identity'
import { sectionTint } from '../reader/sectionTint'
import { AddClientModal } from './AddClientModal'
import { ClientPage } from './ClientPage'

const CLIENTS_CSS = `
.clients-view { padding: 24px 32px; overflow-y: auto; width: 100%; }
.clients-head { display: flex; align-items: baseline; gap: 12px; margin-bottom: 18px; }
.clients-view .cp-back { font-size: 12px; color: var(--text-2); margin-bottom: 10px; }
.clients-title { font-family: var(--font-ui); font-size: 24px; color: var(--text-1); }
.clients-count { font-size: 12px; color: var(--text-2); }
.clients-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 16px; }
.client-tag-chip {
  font-size: 11px; font-weight: 600; color: var(--text-2);
  border: 1px solid var(--hairline); border-radius: 12px; padding: 2px 10px;
}
.client-tag-chip[aria-pressed='true'] { color: var(--text-1); background: var(--bg-inset); border-color: var(--text-2); }
.clients-manager { margin: 18px 0 8px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-2); }
.clients-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 12px; }
.client-card {
  display: flex; flex-direction: column; gap: 6px; text-align: left;
  padding: 12px 14px; background: var(--bg-card); border: 1px solid var(--hairline);
  border-radius: 10px; cursor: pointer;
}
.client-card:hover { border-color: var(--text-2); }
.client-card-head { display: flex; align-items: center; gap: 8px; }
.client-card-dot { width: 9px; height: 9px; border-radius: 50%; background: var(--section-color); }
.client-card-name { font-weight: 600; color: var(--text-1); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.client-card-inbox {
  font-size: 11px; font-weight: 700; color: var(--accent-ink);
  background: var(--accent); border-radius: 10px; padding: 0 7px;
}
.client-card-meta { font-size: 12px; color: var(--text-2); }
.client-card-tags { display: flex; flex-wrap: wrap; gap: 4px; }
.client-card-tags .client-tag-chip { padding: 1px 8px; }
.client-card-errors { font-size: 11px; color: var(--rust, #a33f2e); font-weight: 600; }
.clients-empty { color: var(--text-2); padding: 40px 0; }
.clients-repair-msg { font-size: 12.5px; color: var(--text-2); margin: -6px 0 14px; }
`

function ClientCard({ info, onOpen }: { info: ClientInfo; onOpen: () => void }): React.JSX.Element {
  const errors = useDex(
    (s) => (s.lints ?? []).filter((f) => f.client === info.slug && f.level === 'error').length,
  )
  return (
    <button
      type="button"
      className="client-card"
      style={{ '--section-color': sectionTint(info.slug) } as React.CSSProperties}
      onClick={onOpen}
    >
      <span className="client-card-head">
        <span className="client-card-dot" aria-hidden />
        <span className="client-card-name">{info.slug}</span>
        {info.inboxCount > 0 && (
          <span className="client-card-inbox" title={`${info.inboxCount} inbox item(s) pending`}>
            {info.inboxCount}
          </span>
        )}
      </span>
      <span className="client-card-meta">
        {info.pipelines.length} pipeline{info.pipelines.length === 1 ? '' : 's'} ·{' '}
        {info.agents.length} agent{info.agents.length === 1 ? '' : 's'} ·{' '}
        {info.knowledgeTables.length} table{info.knowledgeTables.length === 1 ? '' : 's'}
      </span>
      {info.tags.length > 0 && (
        <span className="client-card-tags">
          {info.tags.map((tag) => (
            <span key={tag} className="client-tag-chip">
              #{tag}
            </span>
          ))}
        </span>
      )}
      {errors > 0 && <span className="client-card-errors">{errors} schema problem(s)</span>}
    </button>
  )
}

export function ClientsView(): React.JSX.Element {
  const fleet = useDex((s) => s.fleet)
  const selected = useDex((s) => s.selectedClient)
  const selectClient = useDex((s) => s.selectClient)
  const refreshFleet = useDex((s) => s.refreshFleet)
  // manager scope (sidebar product-page drill): show only this manager's clients
  const managerScope = useDex((s) => s.selectedManager)
  const selectManager = useDex((s) => s.selectManager)
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [normalizing, setNormalizing] = useState(false)
  const [repairMsg, setRepairMsg] = useState<string | null>(null)
  const identity = useIdentity((s) => effectiveIdentity(s))

  async function normalizeFleet(): Promise<void> {
    if (identity === null) {
      setRepairMsg('Set your name and email in Settings first.')
      return
    }
    setNormalizing(true)
    setRepairMsg(null)
    try {
      const { normalized } = await invoke('clients.normalize', { identity })
      await refreshFleet()
      setRepairMsg(
        normalized === 0
          ? 'Every client already has the canonical structure.'
          : `Repaired ${normalized} client${normalized === 1 ? '' : 's'}.`,
      )
    } catch (e) {
      setRepairMsg(String((e as { message?: string }).message ?? e))
    } finally {
      setNormalizing(false)
    }
  }

  useEffect(() => {
    if (fleet === null) void refreshFleet()
  }, [fleet, refreshFleet])

  const scoped = useMemo(
    () => (fleet ?? []).filter((c) => !managerScope || c.manager === managerScope),
    [fleet, managerScope],
  )
  const allTags = useMemo(() => [...new Set(scoped.flatMap((c) => c.tags))].sort(), [scoped])
  const visible = scoped.filter((c) => !tagFilter || c.tags.includes(tagFilter))
  const byManager = new Map<string, ClientInfo[]>()
  for (const client of visible) {
    const key = client.manager ?? ''
    byManager.set(key, [...(byManager.get(key) ?? []), client])
  }
  const managers = [...byManager.keys()].sort((a, b) =>
    a === '' ? 1 : b === '' ? -1 : a.localeCompare(b),
  )

  const open = selected ? (fleet ?? []).find((c) => c.slug === selected) : undefined
  if (open) return <ClientPage info={open} onBack={() => selectClient(null)} />

  return (
    <div className="clients-view">
      <style>{CLIENTS_CSS}</style>
      {managerScope && (
        <button type="button" className="cp-back button-quiet" onClick={() => selectManager(null)}>
          ← All managers
        </button>
      )}
      <div className="clients-head">
        <span className="clients-title">{managerScope ?? 'Clients'}</span>
        <span className="clients-count">
          {visible.length} client{visible.length === 1 ? '' : 's'}
        </span>
        <span style={{ flex: 1 }} />
        <button
          type="button"
          className="button-secondary"
          disabled={normalizing}
          title="Ensure every client has the same folder structure (folders, starter pipeline/stage/agent)"
          onClick={() => void normalizeFleet()}
        >
          {normalizing ? 'Repairing…' : 'Repair structure'}
        </button>
        <button type="button" className="button-emphasis" onClick={() => setAdding(true)}>
          ＋ Add client
        </button>
      </div>
      {adding && <AddClientModal onClose={() => setAdding(false)} />}
      {repairMsg && <div className="clients-repair-msg">{repairMsg}</div>}
      {allTags.length > 0 && (
        <div className="clients-tags" role="group" aria-label="Filter by tag">
          {allTags.map((tag) => (
            <button
              key={tag}
              type="button"
              className="client-tag-chip"
              aria-pressed={tagFilter === tag}
              onClick={() => setTagFilter(tagFilter === tag ? null : tag)}
            >
              #{tag}
            </button>
          ))}
        </div>
      )}
      {visible.length === 0 ? (
        <div className="clients-empty">
          No clients yet — scaffold one with{' '}
          <code>loredex new client &lt;name&gt; --manager &lt;m&gt;</code>.
        </div>
      ) : (
        managers.map((manager) => (
          <section key={manager || '_unassigned'}>
            {!managerScope && <div className="clients-manager">{manager || 'Unassigned'}</div>}
            <div className="clients-grid">
              {(byManager.get(manager) ?? []).map((info) => (
                <ClientCard key={info.slug} info={info} onOpen={() => selectClient(info.slug)} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  )
}
