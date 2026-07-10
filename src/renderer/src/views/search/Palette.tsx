/**
 * Cmd+K palette (story 2.4): Linear-style single overlay on --bg-raised, the
 * same vault.search backend as the search view, keyboard-first. Empty query
 * falls back to recent notes. Built as a generic command list — search is the
 * first provider; M2 actions slot in as more item sources.
 */
import { useEffect, useRef, useState } from 'react'
import { useApp } from '../../stores/app'
import { useAtlas } from '../../stores/atlas'
import { useHandoffs } from '../../stores/handoffs'
import { useReader } from '../../stores/reader'
import { useRoute } from '../../stores/route'
import { openSearchResult, useSearch } from '../../stores/search'
import { activateNode } from '../atlas/resolve'
import { handoffRefFromNote } from '../handoffs/compose-form'
import { clampSelection, moveSelection } from './palette-nav'

interface PaletteItem {
  key: string
  title: string
  meta: string
  path: string
  /** action items (M2): run instead of opening a note */
  run?: () => void
}

const titleOf = (path: string): string => (path.split('/').pop() ?? path).replace(/\.md$/, '')

/** M2 action provider: every write flow is ⌘K-reachable (stories 7.2-7.4). */
function actionItems(q: string): PaletteItem[] {
  const actions: Array<{ key: string; title: string; run: () => void }> = [
    {
      key: 'action:new-handoff',
      title: 'New handoff…',
      run: () => {
        useApp.getState().setView('handoffs')
        useHandoffs.getState().openCompose()
      },
    },
    {
      key: 'action:route-note',
      title: 'Route a note…',
      run: () => void useRoute.getState().start(),
    },
    // story 10.2: the Atlas is ⌘K-reachable like every view-level action
    {
      key: 'action:vault-atlas',
      title: 'Vault Atlas',
      run: () => useApp.getState().setView('atlas'),
    },
  ]
  // story 10.3: every atlas navigation action is ⌘K-listed while it's open
  if (useApp.getState().view === 'atlas') {
    const atlas = useAtlas.getState()
    // story 10.4 AC5: the selected node's resolution is keyboard-reachable here
    const selected = atlas.graph?.nodes.find((n) => n.id === atlas.selectedId)
    if (selected) {
      actions.push({
        key: 'action:atlas-open-selection',
        title: `Atlas: open ${selected.type} “${selected.label}”`,
        run: () => void activateNode(selected),
      })
    }
    actions.push({
      key: 'action:atlas-overview',
      title: 'Atlas: Overview',
      run: () => void atlas.navigate('overview', {}),
    })
    if (atlas.scope.project) {
      actions.push(
        {
          key: 'action:atlas-learn',
          title: `Atlas: Learn — ${atlas.scope.project}`,
          run: () => void atlas.navigate('learn', { project: atlas.scope.project as string }),
        },
        {
          key: 'action:atlas-deep',
          title: 'Atlas: Deep Dive (current scope)',
          run: () => void atlas.navigate('deep', atlas.scope),
        },
      )
    }
    // story 10.5: tours are ⌘K-reachable — the panel, and playback while active
    actions.push({
      key: 'action:atlas-tours',
      title: 'Atlas: Tours…',
      run: () => atlas.setPanel('tour'),
    })
    // story 10.6: filters, path trace, blocked preset, focus — all ⌘K-listed
    actions.push(
      {
        key: 'action:atlas-filters',
        title: 'Atlas: Filters…',
        run: () => atlas.setPanel('filters'),
      },
      {
        key: 'action:atlas-path',
        title: 'Atlas: Trace a path…',
        run: () => atlas.setPanel('path'),
      },
      {
        key: 'action:atlas-blocked',
        title: atlas.filters.blocked
          ? 'Atlas: Blocked on — show everything again'
          : 'Atlas: Blocked on — isolate blocking chains',
        run: () => atlas.toggleBlocked(),
      },
    )
    if (selected) {
      actions.push(
        {
          key: 'action:atlas-focus',
          title:
            atlas.focusId === selected.id
              ? `Atlas: unfocus “${selected.label}”`
              : `Atlas: focus “${selected.label}” (1-hop)`,
          run: () => atlas.setFocus(atlas.focusId === selected.id ? null : selected.id),
        },
        {
          key: 'action:atlas-path-from',
          title: `Atlas: path FROM “${selected.label}”`,
          run: () => {
            atlas.setPathEnd('from', selected.id)
            atlas.setPanel('path')
          },
        },
        {
          key: 'action:atlas-path-to',
          title: `Atlas: path TO “${selected.label}”`,
          run: () => {
            atlas.setPathEnd('to', selected.id)
            atlas.setPanel('path')
          },
        },
      )
    } else if (atlas.focusId) {
      actions.push({
        key: 'action:atlas-focus-clear',
        title: 'Atlas: exit focus mode',
        run: () => atlas.setFocus(null),
      })
    }
    if (atlas.activeTour) {
      actions.push(
        {
          key: 'action:atlas-tour-next',
          title: 'Atlas: Tour — next step',
          run: () => void atlas.nextTourStep(),
        },
        {
          key: 'action:atlas-tour-prev',
          title: 'Atlas: Tour — previous step',
          run: () => void atlas.prevTourStep(),
        },
        {
          key: 'action:atlas-tour-end',
          title: 'Atlas: End tour',
          run: () => atlas.endTour(),
        },
      )
    }
    if (atlas.historyIndex > 0) {
      actions.push({
        key: 'action:atlas-back',
        title: 'Atlas: Back (⌘[)',
        run: () => void atlas.back(),
      })
    }
    if (atlas.historyIndex < atlas.history.length - 1) {
      actions.push({
        key: 'action:atlas-forward',
        title: 'Atlas: Forward (⌘])',
        run: () => void atlas.forward(),
      })
    }
  }
  // reply/comment target the open reader note when it is a handoff (story 7.3)
  const { selected, doc } = useReader.getState()
  const ref = selected && doc ? handoffRefFromNote(selected, doc.meta as Record<string, unknown>) : null
  if (ref) {
    actions.push(
      {
        key: 'action:reply-handoff',
        title: `Reply to “${ref.objective || ref.id}”…`,
        run: () => useHandoffs.getState().openCompose(ref),
      },
      {
        key: 'action:comment-handoff',
        title: `Comment on “${ref.objective || ref.id}”…`,
        run: () => useHandoffs.getState().openAnnotate(ref),
      },
    )
  }
  const needle = q.trim().toLowerCase()
  return actions
    .filter((a) => !needle || a.title.toLowerCase().includes(needle))
    .map((a) => ({ ...a, meta: 'action', path: '' }))
}

export function Palette(): React.JSX.Element | null {
  const open = useSearch((s) => s.paletteOpen)
  const q = useSearch((s) => s.q)
  const hits = useSearch((s) => s.hits)
  const recents = useSearch((s) => s.recents)
  const setQuery = useSearch((s) => s.setQuery)
  const setPaletteOpen = useSearch((s) => s.setPaletteOpen)
  const [sel, setSel] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setSel(0)
      inputRef.current?.focus()
    }
  }, [open])

  if (!open) return null

  const noteItems: PaletteItem[] = q.trim()
    ? (hits ?? []).map((h) => ({
        key: h.path,
        title: h.name,
        meta: `${h.project || 'product'} · ${h.kind}${h.date ? ` · ${h.date}` : ''}`,
        path: h.path,
      }))
    : recents.map((p) => ({ key: p, title: titleOf(p), meta: p, path: p }))
  const items: PaletteItem[] = [...actionItems(q), ...noteItems]

  const selected = clampSelection(sel, items.length)

  function pick(item: PaletteItem): void {
    if (item.run) {
      setPaletteOpen(false)
      item.run()
    } else {
      openSearchResult(item.path)
    }
  }

  function onKeyDown(e: React.KeyboardEvent): void {
    if (e.key === 'Escape') {
      setPaletteOpen(false)
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setSel(moveSelection(selected, items.length, e.key))
    } else if (e.key === 'Enter') {
      const item = items[selected === -1 ? 0 : selected]
      if (item) pick(item)
    }
  }

  return (
    // biome-ignore lint: backdrop click-to-dismiss; keyboard path is Escape
    <div className="palette-backdrop" onMouseDown={() => setPaletteOpen(false)}>
      <div
        className="palette"
        role="dialog"
        aria-label="Command palette"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          className="palette-input"
          placeholder="Search notes… (Esc to close)"
          value={q}
          onChange={(e) => {
            setSel(0)
            setQuery(e.target.value)
          }}
          onKeyDown={onKeyDown}
        />
        <div className="palette-list" role="listbox" aria-label="Results">
          {items.length === 0 ? (
            <p className="palette-empty">
              {q.trim() ? 'No notes match.' : 'No recent notes yet — start typing to search.'}
            </p>
          ) : (
            items.map((item, i) => (
              <button
                key={item.key}
                type="button"
                className="palette-item"
                aria-current={i === selected}
                onMouseEnter={() => setSel(i)}
                onClick={() => pick(item)}
              >
                <span className="palette-item-title">{item.title}</span>
                <span className="palette-item-meta">{item.meta}</span>
              </button>
            ))
          )}
        </div>
        <div className="palette-foot">↑↓ navigate · ⏎ open · esc close</div>
      </div>
    </div>
  )
}
