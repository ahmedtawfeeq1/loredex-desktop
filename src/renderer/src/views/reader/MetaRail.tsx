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
import type { SearchHit } from '../../../../shared/ipc-contract'
import { invoke } from '../../api'
import { ThreadRail } from '../handoffs/ThreadRail'
import { openBrief } from '../handoffs/open-brief'
import { qualifiedId } from '../../../../shared/handoff-lanes'
import { useHandoffs } from '../../stores/handoffs'
import { useReader } from '../../stores/reader'
import { useWork } from '../../stores/work'
import { PropertiesPanel } from './PropertiesPanel'

const STATUS_TONE: Record<string, string> = {
  todo: 'is-warn',
  backlog: 'is-mut',
  doing: 'is-ok',
  review: 'is-ok',
  done: 'is-mut',
  consumed: 'is-mut',
}

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
  const [showRaw, setShowRaw] = useState(false)
  const [backlinks, setBacklinks] = useState<SearchHit[] | null>(null)

  const name = noteName(selected)

  useEffect(() => {
    if (items === null) void useWork.getState().load()
  }, [items])

  useEffect(() => {
    setShowRaw(false)
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

  const filedBy = meta.agent ?? meta.author ?? meta.filed_by
  const rows: Array<[string, string]> = [
    ['type', String(meta.type ?? 'note')],
    ['filed', [filedBy, meta.date].filter(Boolean).join(' · ') || '—'],
    ['tags', Array.isArray(meta.tags) ? meta.tags.join(' · ') : String(meta.tags ?? '—')],
    ['origin', meta.loredex ? `routed · schema ${meta.loredex}` : 'unrouted'],
  ]

  return (
    <aside className="meta-rail" aria-label="Note metadata">
      <section>
        <div className="rail-label">USED BY WORK ITEMS</div>
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
            <div className="about-row" key={k}>
              <span className="about-key">{k}</span>
              <span className="about-val">{v}</span>
            </div>
          ))}
          <button
            type="button"
            className="about-raw"
            aria-expanded={showRaw}
            onClick={() => setShowRaw((v) => !v)}
          >
            Raw frontmatter {showRaw ? '▾' : '▸'}{' '}
            {Object.keys(meta).length > 0 ? Object.keys(meta).length : ''}
          </button>
        </div>
        {showRaw && <PropertiesPanel key={selected} meta={meta} path={selected} />}
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
    </aside>
  )
}
