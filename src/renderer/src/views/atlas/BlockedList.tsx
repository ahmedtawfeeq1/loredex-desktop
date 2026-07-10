/**
 * Blocked-on side list (story 10.6 AC4) — the PM screen: blocking handoffs
 * OLDEST-FIRST, each row stating who is blocked on whom, resolving to the
 * handoff board card. Rides the blocked preset; replaces the superseded
 * blocked-on list view.
 */
import { useEffect, useMemo } from 'react'
import { blockedRows } from '../../../../shared/blocked'
import { useApp } from '../../stores/app'
import { useAtlas } from '../../stores/atlas'
import { useHandoffs } from '../../stores/handoffs'
import { performResolution } from './resolve'

export function BlockedList(): React.JSX.Element {
  const cards = useHandoffs((s) => s.cards)
  const loadCards = useHandoffs((s) => s.load)
  const vaultPath = useApp((s) => s.identity?.vaultPath ?? '')
  const setPanel = useAtlas((s) => s.setPanel)
  const filters = useAtlas((s) => s.filters)
  const toggleBlocked = useAtlas((s) => s.toggleBlocked)

  useEffect(() => {
    if (cards === null) void loadCards()
  }, [cards, loadCards])

  const rows = useMemo(() => blockedRows(cards ?? [], vaultPath), [cards, vaultPath])

  return (
    <aside className="atlas-side" aria-label="Blocked on">
      <div className="atlas-side-head">
        <span className="atlas-side-title">Blocked on</span>
        <button type="button" className="atlas-side-close" onClick={() => setPanel(null)} aria-label="Close panel">
          ×
        </button>
      </div>
      {!filters.blocked && (
        <button type="button" className="atlas-tool" onClick={toggleBlocked}>
          Isolate blocking chains on the canvas
        </button>
      )}
      {cards === null ? (
        <p className="atlas-side-empty">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="atlas-side-empty">Nothing is blocked — every request is answered.</p>
      ) : (
        <ol className="atlas-blocked-list" aria-label="Blocking handoffs, oldest first">
          {rows.map((row) => (
            <li key={row.relPath}>
              <button
                type="button"
                className="atlas-blocked-row"
                title="Open the handoff card"
                onClick={() => performResolution({ kind: 'handoff-card', path: row.relPath })}
              >
                <span className="atlas-blocked-sentence">{row.sentence}</span>
                <span className="atlas-blocked-objective">{row.objective}</span>
                <span className="atlas-blocked-meta">
                  {row.date} · {row.id}
                </span>
              </button>
            </li>
          ))}
        </ol>
      )}
    </aside>
  )
}
