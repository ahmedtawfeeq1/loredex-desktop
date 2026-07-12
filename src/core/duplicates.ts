/**
 * Duplicate-note detection (epic: multi-actor curate collisions). When two
 * teammates curate the same source project independently — e.g. one curates,
 * pushes, the other pulls and curates again — `curate` re-files every source
 * doc under the CURRENT run date, so the vault ends up with two copies of each
 * note that differ only by their date-prefix and can't be caught by path.
 *
 * The stable identity across runs is the note's provenance frontmatter, not its
 * vault path: `source_path` (absolute source file) if present, else
 * `source_project` + `source_rel`. Notes sharing an identity are the same
 * upstream file filed twice. This module is pure (fs access is injected) so the
 * grouping is unit-tested; the handler wires it to engine.noteMeta + statSync.
 */

import type { DuplicateGroup } from '../shared/types'

export type { DuplicateGroup }

/** The provenance identity that is stable across curate runs, or null if the
 *  note isn't a curated/routed file (no source frontmatter to key on). */
export function sourceIdentity(meta: Record<string, unknown>): string | null {
  const sp = typeof meta.source_path === 'string' ? meta.source_path.trim() : ''
  if (sp) return `path:${sp}`
  const proj = typeof meta.source_project === 'string' ? meta.source_project.trim() : ''
  const rel = typeof meta.source_rel === 'string' ? meta.source_rel.trim() : ''
  if (proj && rel) return `rel:${proj}|${rel}`
  return null
}

export interface NoteRecord {
  /** vault-relative path */
  path: string
  meta: Record<string, unknown>
  mtime: string
}

/**
 * Group notes by their provenance identity; return only groups with 2+ copies
 * (the duplicates), each sorted newest-first so copies[0] is the natural keep.
 * Deterministic: groups ordered by copy count desc, then key; ties in a group
 * broken by date desc, then mtime desc, then path.
 */
export function findDuplicates(notes: NoteRecord[]): DuplicateGroup[] {
  const byKey = new Map<string, NoteRecord[]>()
  for (const note of notes) {
    const key = sourceIdentity(note.meta)
    if (!key) continue
    const bucket = byKey.get(key)
    if (bucket) bucket.push(note)
    else byKey.set(key, [note])
  }

  const groups: DuplicateGroup[] = []
  for (const [key, bucket] of byKey) {
    if (bucket.length < 2) continue
    const copies = bucket
      .map((n) => ({
        path: n.path,
        date: typeof n.meta.date === 'string' ? n.meta.date : '',
        mtime: n.mtime,
      }))
      .sort(
        (a, b) => b.date.localeCompare(a.date) || b.mtime.localeCompare(a.mtime) || a.path.localeCompare(b.path),
      )
    const sample = bucket[0].meta
    groups.push({
      key,
      sourceProject: typeof sample.source_project === 'string' ? sample.source_project : '',
      sourceRel: typeof sample.source_rel === 'string' ? sample.source_rel : '',
      copies,
    })
  }

  return groups.sort((a, b) => b.copies.length - a.copies.length || a.key.localeCompare(b.key))
}

/** Flatten to the redundant paths (every copy except each group's newest). */
export function redundantPaths(groups: DuplicateGroup[]): string[] {
  return groups.flatMap((g) => g.copies.slice(1).map((c) => c.path))
}
