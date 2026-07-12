import { describe, expect, it } from 'vitest'
import {
  findDuplicates,
  type NoteRecord,
  redundantPaths,
  sourceIdentity,
} from './duplicates'

const rec = (path: string, meta: Record<string, unknown>, mtime = '2026-07-11T00:00:00Z'): NoteRecord => ({
  path,
  meta,
  mtime,
})

describe('sourceIdentity', () => {
  it('prefers source_path, then source_project+source_rel, else null', () => {
    expect(sourceIdentity({ source_path: '/a/b.md' })).toBe('path:/a/b.md')
    expect(sourceIdentity({ source_project: 'p', source_rel: 'docs/x.md' })).toBe('rel:p|docs/x.md')
    expect(sourceIdentity({ topic: 'general' })).toBeNull() // hand-written note, no provenance
    expect(sourceIdentity({ source_project: 'p' })).toBeNull() // needs both
  })
})

describe('findDuplicates', () => {
  it('groups notes filed twice from the same source, newest copy first', () => {
    const notes = [
      rec('projects/p/a/2026-07-08-x.md', { source_project: 'p', source_rel: 'docs/x.md', date: '2026-07-08' }),
      rec('projects/p/a/2026-07-11-x.md', { source_project: 'p', source_rel: 'docs/x.md', date: '2026-07-11' }),
      rec('projects/p/b/2026-07-09-y.md', { source_project: 'p', source_rel: 'docs/y.md', date: '2026-07-09' }),
    ]
    const groups = findDuplicates(notes)
    expect(groups).toHaveLength(1) // only x.md is duplicated; y.md is unique
    expect(groups[0].sourceRel).toBe('docs/x.md')
    expect(groups[0].copies.map((c) => c.path)).toEqual([
      'projects/p/a/2026-07-11-x.md', // newest kept first
      'projects/p/a/2026-07-08-x.md',
    ])
  })

  it('ignores notes with no provenance frontmatter (hand-written)', () => {
    const notes = [
      rec('a.md', { topic: 'general' }),
      rec('b.md', { topic: 'general' }),
    ]
    expect(findDuplicates(notes)).toEqual([])
  })

  it('redundantPaths keeps the newest of each group, lists the rest', () => {
    const notes = [
      rec('new.md', { source_path: '/s/x.md', date: '2026-07-11' }),
      rec('old.md', { source_path: '/s/x.md', date: '2026-07-08' }),
      rec('older.md', { source_path: '/s/x.md', date: '2026-07-01' }),
    ]
    expect(redundantPaths(findDuplicates(notes))).toEqual(['old.md', 'older.md'])
  })

  it('breaks a date tie by mtime, deterministically', () => {
    const notes = [
      rec('a.md', { source_path: '/s/x.md', date: '2026-07-11' }, '2026-07-11T01:00:00Z'),
      rec('b.md', { source_path: '/s/x.md', date: '2026-07-11' }, '2026-07-11T09:00:00Z'),
    ]
    expect(findDuplicates(notes)[0].copies[0].path).toBe('b.md') // later mtime kept
  })
})
