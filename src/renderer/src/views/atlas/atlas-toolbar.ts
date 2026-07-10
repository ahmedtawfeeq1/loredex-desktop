/**
 * Atlas header toolbar model (story epic17.2, D1 amendment 3 "Header
 * redesign"). The right-hand actions are grouped icon+label PILL buttons with
 * tooltips — no naked text buttons — separated into three groups by hairline
 * dividers: [Tours] [Filters·n] [Path] | [Blocked] [Changed] | [Export ▾] [?].
 * Export is ONE button with an SVG/PNG submenu, never two. Pure data + a couple
 * of label helpers so the structure is unit-testable without a DOM.
 */
export type ExportFormat = 'svg' | 'png'

export type ToolbarActionId =
  | 'tours'
  | 'filters'
  | 'path'
  | 'blocked'
  | 'changed'
  | 'export'
  | 'help'

export interface ToolbarAction {
  id: ToolbarActionId
  /** the pill's visible label (the icon rides beside it in the view) */
  label: string
  /** leading glyph — "icon+label pill" (D1a3); a bare unicode mark, no assets */
  icon: string
  /** hover tooltip — every action carries one (no bare affordances) */
  tooltip: string
  /** export only: the submenu formats behind the single ▾ button */
  submenu?: ExportFormat[]
}

/** Three groups, in reading order, separated by dividers in the view. */
export const TOOLBAR_GROUPS: ReadonlyArray<ReadonlyArray<ToolbarAction>> = [
  [
    { id: 'tours', icon: '◇', label: 'Tours', tooltip: 'Guided tours from reading orders' },
    { id: 'filters', icon: '⚑', label: 'Filters', tooltip: 'Narrow the canvas by type, status, topic, edge, tier' },
    { id: 'path', icon: '↝', label: 'Path', tooltip: 'Trace how one node reaches another' },
  ],
  [
    { id: 'blocked', icon: '⨂', label: 'Blocked', tooltip: 'Isolate blocking chains — who is blocked on whom' },
    { id: 'changed', icon: '✦', label: 'Changed', tooltip: 'Glow what changed since a date or your last visit' },
  ],
  [
    { id: 'export', icon: '⭳', label: 'Export', tooltip: 'Export the current view', submenu: ['svg', 'png'] },
    { id: 'help', icon: '?', label: 'How to read this map', tooltip: 'How to read this map' },
  ],
]

/** The Filters pill counts active facets inline (`Filters·3`); 0 stays plain. */
export function toolbarLabel(action: ToolbarAction, filterCount: number): string {
  if (action.id === 'filters' && filterCount > 0) return `${action.label}·${filterCount}`
  return action.label
}

export const EXPORT_FORMATS: ReadonlyArray<ExportFormat> = ['svg', 'png']
