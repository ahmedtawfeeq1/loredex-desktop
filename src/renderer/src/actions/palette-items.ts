/**
 * ⌘K action provider (stories 7.2-7.4 / 10.x, unified by 15.3): the palette's
 * action rows = the global registry (every registered action, with its
 * shortcut hint) + the contextual providers that already existed — atlas
 * navigation while the Atlas is open, reply/comment on the open handoff.
 * Pure + store-driven, no React: the palette-coverage test runs this under
 * node and asserts the registry contract holds.
 */
import { useApp } from '../stores/app'
import { useAtlas } from '../stores/atlas'
import { useHandoffs } from '../stores/handoffs'
import { useReader } from '../stores/reader'
import { exportAtlasView } from '../views/atlas/export'
import { activateNode } from '../views/atlas/resolve'
import { handoffRefFromNote } from '../views/handoffs/compose-form'
import { appActions } from './registry'

export interface PaletteActionItem {
  key: string
  title: string
  meta: string
  path: string
  /** shortcut hint, rendered right-aligned on the row */
  hint?: string
  run: () => void
}

/** Every write flow and view is ⌘K-reachable (DESIGN quality floor). */
export function actionItems(q: string): PaletteActionItem[] {
  const actions: Array<{ key: string; title: string; hint?: string; run: () => void }> = []

  // the global registry, verbatim — one source of truth (story 15.3)
  for (const action of appActions()) {
    if (action.paletteHidden) continue
    actions.push({
      key: action.id,
      title: action.title,
      ...(action.shortcut ? { hint: action.shortcut } : {}),
      run: action.run,
    })
  }

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
      // story 10.7: overlay toggle + both exports, keyboard-reachable
      {
        key: 'action:atlas-overlay',
        title: atlas.overlayOn
          ? 'Atlas: hide changed-since overlay'
          : 'Atlas: show changed-since overlay',
        run: () => atlas.toggleOverlay(),
      },
      {
        key: 'action:atlas-export-svg',
        title: 'Atlas: export view (SVG)',
        run: () => void exportAtlasView('svg'),
      },
      {
        key: 'action:atlas-export-png',
        title: 'Atlas: export view (PNG)',
        run: () => void exportAtlasView('png'),
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
        title: 'Atlas: Back',
        hint: '⌘[',
        run: () => void atlas.back(),
      })
    }
    if (atlas.historyIndex < atlas.history.length - 1) {
      actions.push({
        key: 'action:atlas-forward',
        title: 'Atlas: Forward',
        hint: '⌘]',
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
