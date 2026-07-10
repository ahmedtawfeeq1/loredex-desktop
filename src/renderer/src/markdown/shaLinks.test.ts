/** Story 2.5: SHA detection boundaries + plugin output. The remote→base
 *  derivation moved to shared/github.ts (story 12.1 supersession) and is
 *  tested there — this file covers only what still lives here. */
import remarkParse from 'remark-parse'
import { unified } from 'unified'
import { describe, expect, it } from 'vitest'
import { isLikelySha, remarkShaLinks } from './shaLinks'

describe('isLikelySha', () => {
  it('accepts 7–40 hex with a digit', () => {
    expect(isLikelySha('a1b2c3d')).toBe(true)
    expect(isLikelySha('0'.repeat(40))).toBe(true)
  })
  it('rejects length boundaries and non-hex', () => {
    expect(isLikelySha('a1b2c3')).toBe(false) // 6 — too short
    expect(isLikelySha('a'.repeat(41))).toBe(false) // 41 — too long
    expect(isLikelySha('g1b2c3d')).toBe(false) // non-hex char
  })
  it('rejects letter-only hex words (deadbeef is prose, not a commit)', () => {
    expect(isLikelySha('deadbeef')).toBe(false)
    expect(isLikelySha('cafebabe')).toBe(false)
  })
})

type Node = { type: string; value?: string; url?: string; children?: Node[] }

function run(markdown: string, commitBase: string | null): Node {
  const p = unified().use(remarkParse).use(remarkShaLinks, { commitBase })
  return p.runSync(p.parse(markdown)) as unknown as Node
}

function links(node: Node, out: Node[] = []): Node[] {
  if (node.type === 'link') out.push(node)
  for (const child of node.children ?? []) links(child, out)
  return out
}

describe('remarkShaLinks plugin', () => {
  const base = 'https://github.com/acme/vault'

  it('links bare and inline-code SHAs to the remote commit page', () => {
    const tree = run('Shipped in a1b2c3d and `4e5f6a7b8c9d0e1f` today.', base)
    const found = links(tree)
    expect(found.map((l) => l.url)).toEqual([
      `${base}/commit/a1b2c3d`,
      `${base}/commit/4e5f6a7b8c9d0e1f`,
    ])
  })

  it('leaves plain words, short hex and no-digit hex untouched', () => {
    const tree = run('deadbeef abc123 decade — none of these are commits.', base)
    expect(links(tree)).toHaveLength(0)
  })

  it('does nothing without a commit base (unresolvable remote)', () => {
    const tree = run('Shipped in a1b2c3d.', null)
    expect(links(tree)).toHaveLength(0)
  })

  it('does not double-wrap SHAs already inside links', () => {
    const tree = run('[a1b2c3d](https://example.com/x)', base)
    const found = links(tree)
    expect(found).toHaveLength(1)
    expect(found[0]?.url).toBe('https://example.com/x')
  })
})
