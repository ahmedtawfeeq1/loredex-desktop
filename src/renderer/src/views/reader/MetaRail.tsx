/**
 * Reader meta rail (v3 parity slice F — reference 04): the 224px right rail.
 *   USED BY WORK ITEMS — board items whose path is this note or whose
 *     handoff reading-order cites it (click → brief / note).
 *   ABOUT THIS NOTE — typed mono rows (type · filed · tags · origin) with
 *     "Raw frontmatter ▸" revealing the FULL editable PropertiesPanel
 *     (epic20 — every edit capability kept, re-homed here per §5.1).
 *   BACKLINKS — derived live from vault.search on the note's wikilink text
 *     (no index seam in the lib yet; the search IS the truth).
 *   THREAD — the handoff thread rail, re-homed (handoff notes only).
 */
import { useEffect, useState } from 'react'
import { create } from 'zustand'
import { effectiveIdentity, useIdentity } from '../../stores/identity'
import { useToasts } from '../../stores/toasts'
import type { SearchHit } from '../../../../shared/ipc-contract'
import { isErrEnvelope } from '../../../../shared/ipc-contract'
import { invoke } from '../../api'
import { ThreadRail } from '../handoffs/ThreadRail'
import { openBrief } from '../handoffs/open-brief'
import { qualifiedId } from '../../../../shared/handoff-lanes'
import { useHandoffs } from '../../stores/handoffs'
import { useReader } from '../../stores/reader'
import { useWork } from '../../stores/work'

const STATUS_TONE: Record<string, string> = {
  todo: 'is-warn',
  backlog: 'is-mut',
  doing: 'is-ok',
  review: 'is-ok',
  done: 'is-mut',
  consumed: 'is-mut',
}

/** meta-rail collapse — session state; full-width reading on demand.
 *  BL-17: collapsed by DEFAULT — you open a note to read it, not to read its
 *  metadata; the rail is one click away when you want it. */
export const useMetaRail = create<{ collapsed: boolean; toggle(): void }>((set) => ({
  collapsed: true,
  toggle: () => set((s) => ({ collapsed: !s.collapsed })),
}))

/** note name (wikilink target) from a vault-relative path */
export function noteName(path: string): string {
  const base = path.split('/').pop() ?? path
  return base.replace(/\.md$/i, '')
}

export function MetaRail({
  selected,
  meta,
}: {
  selected: string
  meta: Record<string, unknown>
}): React.JSX.Element {
  const items = useWork((s) => s.items)
  const cards = useHandoffs((s) => s.cards)
  const [backlinks, setBacklinks] = useState<SearchHit[] | null>(null)

  const name = noteName(selected)

  useEffect(() => {
    if (items === null) void useWork.getState().load()
  }, [items])

  useEffect(() => {
    setBacklinks(null)
    let stale = false
    void invoke('vault.search', { q: `[[${name}]]` })
      .then((hits) => {
        if (!stale) setBacklinks(hits.filter((h) => h.path !== selected).slice(0, 8))
      })
      .catch(() => {
        if (!stale) setBacklinks([])
      })
    return () => {
      stale = true
    }
  }, [selected, name])

  const citedBy = new Set(
    (cards ?? []).filter((c) => c.readingOrder.includes(name)).map((c) => c.id),
  )
  const usedBy = (items ?? []).filter(
    (i) => i.path === selected || citedBy.has(i.id),
  )
  const handoffRef = (cards ?? []).find((c) => c.id === name)

  // Quick facts only (user feedback 2026-07-17): a row earns its place when
  // the value FITS the 224px rail — long values (paths, hashes, tag piles)
  // stay in the note's Properties block. Every row tooltips its full value.
  const filedBy = meta.agent ?? meta.author ?? meta.filed_by
  const candidates: Array<[string, string]> = [
    ['type', String(meta.type ?? 'note')],
    ['filed', [filedBy, meta.date].filter(Boolean).join(' · ') || '—'],
    ['project', String(meta.project ?? '')],
    ['topic', String(meta.topic ?? '')],
    ['product', String(meta.product ?? '')],
    ['source', String(meta.source ?? '')],
    ['tags', Array.isArray(meta.tags) ? meta.tags.join(' · ') : String(meta.tags ?? '')],
    ['origin', meta.loredex ? String(meta.loredex) : ''],
    ['schema', meta.loredex_schema !== undefined ? String(meta.loredex_schema) : ''],
  ]
  const rows = candidates.filter(([, v]) => v && v !== 'undefined' && v.length <= 24)

  const collapsed = useMetaRail((s) => s.collapsed)
  if (collapsed) {
    return (
      <button
        type="button"
        className="meta-rail-reopen"
        title="Show the note rail"
        aria-label="Show the note rail"
        onClick={() => useMetaRail.getState().toggle()}
      >
        ‹
      </button>
    )
  }
  return (
    <aside className="meta-rail" aria-label="Note metadata">
      <section>
        <div className="rail-label rail-label-head">
          USED BY WORK ITEMS
          <button
            type="button"
            className="rail-collapse"
            title="Hide the rail — full-width note"
            aria-label="Hide the note rail"
            onClick={() => useMetaRail.getState().toggle()}
          >
            ›
          </button>
        </div>
        {usedBy.length === 0 ? (
          <div className="rail-empty">—</div>
        ) : (
          usedBy.slice(0, 5).map((i) => {
            const card = (cards ?? []).find((c) => c.id === i.id)
            return (
              <button
                key={`${i.kind}/${i.id}`}
                type="button"
                className="rail-work"
                onClick={() =>
                  card ? openBrief(card) : void useReader.getState().open(i.path)
                }
              >
                <span className="rail-work-id">{i.id}</span>
                <span className={`rail-work-status ${STATUS_TONE[i.status] ?? 'is-mut'}`}>
                  {i.status === 'todo' && i.kind !== 'task' ? 'open' : i.status}
                </span>
              </button>
            )
          })
        )}
      </section>

      <section>
        <div className="rail-label">ABOUT THIS NOTE</div>
        <div className="about-card">
          {rows.map(([k, v]) => (
            <div className="about-row" key={k} title={`${k}: ${v}`}>
              <span className="about-key">{k}</span>
              <span className="about-val">{v}</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="rail-label">
          BACKLINKS{backlinks !== null ? ` · ${backlinks.length}` : ''}
        </div>
        {backlinks === null ? (
          <div className="rail-empty">…</div>
        ) : backlinks.length === 0 ? (
          <div className="rail-empty">none yet</div>
        ) : (
          <div className="rail-links">
            {backlinks.map((h) => (
              <button
                key={h.path}
                type="button"
                className="rail-link"
                title={h.path}
                onClick={() => void useReader.getState().open(h.path)}
              >
                {noteName(h.path)}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* ThreadRail carries its own "Thread" heading */}
      {handoffRef && <ThreadRail id={qualifiedId(handoffRef)} />}

      <RemoveNote selected={selected} />
    </aside>
  )
}

/** Archive / delete the open note (user request 2026-07-17) — archive moves
 *  it to _archive/, delete removes it; both one attributed commit. Delete
 *  asks twice. */
function RemoveNote({ selected }: { selected: string }): React.JSX.Element | null {
  const identity = useIdentity((s) => effectiveIdentity(s))
  const [confirm, setConfirm] = useState(false)
  useEffect(() => setConfirm(false), [selected])
  if (!identity) return null

  const run = async (mode: 'delete' | 'archive' | 'unarchive'): Promise<void> => {
    try {
      await invoke('vault.removeNote', { path: selected, mode, identity })
      useToasts
        .getState()
        .push(
          mode === 'archive' ? 'Note archived' : mode === 'unarchive' ? 'Note restored' : 'Note deleted',
          `${noteName(selected)} · committed — will push on next sync`,
        )
      useReader.getState().reset()
      void useReader.getState().loadTree()
    } catch (e) {
      useToasts.getState().push('Could not remove note', isErrEnvelope(e) ? `${(e as { code: string }).code}: ${(e as { message: string }).message}` : String(e))
    }
  }

  const archived = /(^|\/)_archive\//.test(`/${selected}`)
  return (
    <section>
      <div className="rail-label">MANAGE</div>
      <div className="rail-manage">
        {archived ? (
          <button type="button" className="act-link" onClick={() => void run('unarchive')}>
            Unarchive note
          </button>
        ) : (
          <button type="button" className="act-link" onClick={() => void run('archive')}>
            Archive note
          </button>
        )}
        <button
          type="button"
          className="act-link is-danger"
          onClick={() => (confirm ? void run('delete') : setConfirm(true))}
        >
          {confirm ? 'Delete — click again to confirm' : 'Delete note'}
        </button>
      </div>
    </section>
  )
}
