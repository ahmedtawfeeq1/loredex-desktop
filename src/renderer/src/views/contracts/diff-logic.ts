/**
 * Pure view logic for the contracts view (story 11.2) — unified-diff line
 * classification and the empty-state matrix. No DOM, fully unit-tested.
 */
import type { ContractChange } from '../../../../shared/types'

export type DiffLineKind = 'add' | 'del' | 'hunk' | 'meta' | 'ctx'

/**
 * Classify one unified-diff line by its prefix — no diff lib needed. File
 * headers (`+++`/`---`) and git's commit/diff headers are meta, never tinted
 * as changes.
 */
export function classifyDiffLine(line: string): DiffLineKind {
  if (line.startsWith('+++') || line.startsWith('---')) return 'meta'
  if (line.startsWith('@@')) return 'hunk'
  if (line.startsWith('+')) return 'add'
  if (line.startsWith('-')) return 'del'
  if (
    line.startsWith('diff --git') ||
    line.startsWith('index ') ||
    line.startsWith('commit ') ||
    line.startsWith('Author:') ||
    line.startsWith('Date:') ||
    line.startsWith('new file mode') ||
    line.startsWith('deleted file mode') ||
    line.startsWith('similarity index') ||
    line.startsWith('rename ')
  ) {
    return 'meta'
  }
  return 'ctx'
}

/** Empty-state matrix (AC4): no roots → point at Settings; roots but nothing
 *  matched → a plain statement; otherwise the timeline renders. */
export type TimelineEmpty = 'no-roots' | 'no-matches' | null

export function timelineEmptyState(rootsCount: number, changesCount: number): TimelineEmpty {
  if (changesCount > 0) return null
  return rootsCount === 0 ? 'no-roots' : 'no-matches'
}

/** Client-side project filter (instant switching, options never vanish). */
export function filterByProject(
  changes: ContractChange[],
  project: string | 'all',
): ContractChange[] {
  return project === 'all' ? changes : changes.filter((c) => c.project === project)
}

/** Distinct project names present on the timeline, sorted. */
export function projectsOf(changes: ContractChange[]): string[] {
  return [...new Set(changes.map((c) => c.project))].sort()
}

/** Mono rail date: YYYY-MM-DD from the commit's ISO date. */
export function railDate(iso: string): string {
  return iso.slice(0, 10)
}
