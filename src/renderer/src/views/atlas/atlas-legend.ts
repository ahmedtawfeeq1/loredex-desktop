/**
 * "How to read this map" legend (story epic17.2, D1 amendment 3). A compact
 * popover the `?` button opens — node types, edge types, zoom levels, what
 * Tours/Path/Blocked do, and one suggested first action. First-ever Atlas visit
 * auto-opens it once, gated by an app.db flag. Pure content + the auto-open
 * decision so both are unit-testable.
 */
export interface LegendRow {
  term: string
  meaning: string
}

export interface LegendSection {
  title: string
  rows: LegendRow[]
}

/** The one suggested first action the popover ends on (D1a3 verbatim). */
export const LEGEND_FIRST_ACTION =
  'Start with the Tours button — it walks you through a real handoff chain.'

export const LEGEND_SECTIONS: ReadonlyArray<LegendSection> = [
  {
    title: 'Node types',
    rows: [
      { term: 'project', meaning: 'a repo/layer cluster; its open-handoff count rides gold' },
      { term: 'note', meaning: 'a filed markdown note (serif title, type + topic chips)' },
      { term: 'handoff', meaning: 'a routing slip between projects, stamped by status' },
      { term: 'contract', meaning: 'an API/schema file with a change timeline' },
      { term: 'source', meaning: 'the real repo file a note came from' },
      { term: 'commit', meaning: 'a git sha mentioned in a body' },
    ],
  },
  {
    title: 'Edge types',
    rows: [
      { term: 'route', meaning: 'a handoff from one project to another' },
      { term: 'thread', meaning: 'a reply/fulfils link — gold while the thread is open' },
      { term: 'wikilink', meaning: 'a [[link]] between notes' },
      { term: 'provenance', meaning: 'a note back to its source file' },
      { term: 'contract-link', meaning: 'a contract change tied to a handoff/commit' },
      { term: 'affinity', meaning: 'the same topic shared across projects (dashed)' },
    ],
  },
  {
    title: 'Zoom levels',
    rows: [
      { term: 'Overview', meaning: 'project clusters + aggregated handoff flow' },
      { term: 'Learn', meaning: 'one project: topic sub-cards, newest activity first' },
      { term: 'Deep Dive', meaning: 'everything in scope incl. sources, commits, contracts' },
    ],
  },
  {
    title: 'Actions',
    rows: [
      { term: 'Tours', meaning: 'walk a real handoff/reading-order chain step by step' },
      { term: 'Path', meaning: 'trace how any node reaches another' },
      { term: 'Blocked', meaning: 'isolate blocking chains — who is blocked on whom' },
    ],
  },
]

/** Auto-open the legend exactly once — the first-ever Atlas visit (flag unset).
 *  Pure so the app-db gate is testable without the store. */
export function shouldAutoOpenLegend(seen: boolean): boolean {
  return !seen
}
