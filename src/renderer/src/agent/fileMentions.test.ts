import { describe, expect, it } from 'vitest'
import type { TreeNode } from '../../../shared/types'
import { applyMention, mentionMatches, mentionQuery, mentionStart } from './fileMentions'

const tree: TreeNode[] = [
  {
    name: 'projects',
    path: 'projects',
    kind: 'dir',
    children: [
      {
        name: 'arabicss',
        path: 'projects/arabicss',
        kind: 'dir',
        children: [
          { name: 'brief', path: 'projects/arabicss/brief.md', kind: 'file', fileType: 'md' },
          { name: 'notes', path: 'projects/arabicss/notes.md', kind: 'file', fileType: 'md' },
        ],
      },
      { name: 'atlas', path: 'projects/atlas', kind: 'dir', children: [] },
    ],
  },
  { name: 'README', path: 'README.md', kind: 'file', fileType: 'md' },
]

describe('mentionQuery — when the picker is open', () => {
  it('opens on a lone @ (list the root)', () => {
    expect(mentionQuery('@')).toBe('')
    expect(mentionQuery('read this @')).toBe('')
  })
  it('carries the path typed so far', () => {
    expect(mentionQuery('look at @projects/arab')).toBe('projects/arab')
  })
  it('stays closed for an email or a mention already finished', () => {
    expect(mentionQuery('mail me at me@example.com')).toBeNull()
    expect(mentionQuery('@projects/arabicss/brief.md ')).toBeNull()
  })
  it('only the trailing token counts — an earlier mention does not reopen it', () => {
    expect(mentionQuery('@a.md and then some prose')).toBeNull()
  })
  it('mentionStart points at the @ so the token can be replaced', () => {
    expect(mentionStart('see @proj')).toBe(4)
    expect(mentionStart('no mention here')).toBe(-1)
  })
})

describe('mentionMatches — one level at a time, folders first', () => {
  it('a bare @ lists the vault root', () => {
    expect(mentionMatches(tree, '').map((n) => n.name)).toEqual(['projects', 'README'])
  })
  it('descends into a folder and filters its children by the last segment', () => {
    expect(mentionMatches(tree, 'projects/ar').map((n) => n.path)).toEqual(['projects/arabicss'])
    expect(mentionMatches(tree, 'projects/arabicss/').map((n) => n.name)).toEqual([
      'brief',
      'notes',
    ])
  })
  it('filters case-insensitively on a substring, not just a prefix', () => {
    expect(mentionMatches(tree, 'ADME').map((n) => n.name)).toEqual(['README'])
  })
  it('a folder that does not exist matches nothing (never falls back to the root)', () => {
    expect(mentionMatches(tree, 'nope/deeper/')).toEqual([])
  })
  it('no tree yet is empty, not a crash', () => {
    expect(mentionMatches(null, '')).toEqual([])
  })
  it('caps a wide folder at the limit', () => {
    expect(mentionMatches(tree, '', 1).map((n) => n.name)).toEqual(['projects'])
  })
})

describe('applyMention — folders drill, files land as absolute paths', () => {
  it('a folder keeps the picker open one level deeper', () => {
    const dir = tree[0]
    expect(applyMention('see @proj', dir, '/vault/projects')).toBe('see @projects/')
  })

  it('descending appends to the path already walked', () => {
    const arabicss = tree[0].children?.[0] as TreeNode
    expect(applyMention('@projects/ar', arabicss, '/v/projects/arabicss')).toBe(
      '@projects/arabicss/',
    )
  })

  /**
   * Reported 2026-07-23. The tree groups projects under a synthetic "product"
   * node (a project manager) whose `path` is an id — `projects#product=…` —
   * while its children keep real `projects/<slug>` paths. Using `node.path` for
   * the next query produced `@projects#product=ahmed-essam/`, which matches no
   * folder, so the menu went empty. Navigating by NAME is independent of that.
   */
  it('a synthetic grouping folder navigates by name, never by its id-like path', () => {
    const product: TreeNode = {
      name: 'ahmed-essam',
      path: 'projects#product=ahmed-essam',
      kind: 'dir',
      children: [],
    }
    expect(applyMention('@projects/ahm', product, '')).toBe('@projects/ahmed-essam/')
    expect(applyMention('@projects/ahm', product, '')).not.toContain('#product=')
  })
  it('a file inserts its ABSOLUTE path and a trailing space', () => {
    const file = tree[1]
    expect(applyMention('read @READ', file, '/vault/README.md')).toBe('read /vault/README.md ')
  })
  it('text before the mention is preserved verbatim', () => {
    const file = tree[1]
    expect(applyMention('compare A and @R', file, '/v/README.md')).toBe('compare A and /v/README.md ')
  })
})
