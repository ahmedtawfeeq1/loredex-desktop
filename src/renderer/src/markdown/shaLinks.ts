/**
 * Commit-SHA hyperlinks in the product brief (story 2.5, AC2). Plain link
 * construction only — commit verification (chips, existence checks) is M2.
 * Unresolvable remote → nothing is linkified (no dead links).
 */
import type { Root } from 'mdast'
import { visit } from 'unist-util-visit'

/** git remote url → https commit-page base, or null when not constructible. */
export function remoteCommitBase(remote: string | null): string | null {
  if (!remote) return null
  let m = /^https?:\/\/([^/]+)\/(.+?)(?:\.git)?\/?$/.exec(remote)
  if (m) return `https://${m[1]}/${m[2]}`
  m = /^(?:ssh:\/\/)?git@([^:/]+)[:/](.+?)(?:\.git)?\/?$/.exec(remote)
  if (m) return `https://${m[1]}/${m[2]}`
  return null
}

/**
 * A token that plausibly IS a commit SHA: 7–40 hex chars with at least one
 * digit (letter-only hex like "deadbeef" reads as a word, not a commit).
 */
export function isLikelySha(token: string): boolean {
  return /^[0-9a-f]{7,40}$/.test(token) && /\d/.test(token)
}

const SHA_TOKEN = /\b[0-9a-f]{7,40}\b/g

type MdNode = { type: string; value?: string; url?: string; children?: MdNode[] }

/**
 * remark plugin: wrap SHA tokens in text and `inline code` as links to
 * `<commitBase>/commit/<sha>`. No-op without a commit base.
 */
export function remarkShaLinks(options: { commitBase: string | null }) {
  const base = options.commitBase
  return (tree: Root): void => {
    if (!base) return
    // `abc1234` — the common brief style: whole inline-code token is a SHA
    visit(tree, 'inlineCode', (node: MdNode, index, parent: MdNode | undefined) => {
      if (!parent || index === undefined || parent.type === 'link') return
      const value = node.value ?? ''
      if (!isLikelySha(value)) return
      parent.children?.splice(index, 1, {
        type: 'link',
        url: `${base}/commit/${value}`,
        children: [node],
      })
      return index + 1
    })
    // bare SHAs inside prose
    visit(tree, 'text', (node: MdNode, index, parent: MdNode | undefined) => {
      if (!parent || index === undefined || parent.type === 'link') return
      const value = node.value ?? ''
      const parts: MdNode[] = []
      let at = 0
      SHA_TOKEN.lastIndex = 0
      for (let m = SHA_TOKEN.exec(value); m !== null; m = SHA_TOKEN.exec(value)) {
        if (!isLikelySha(m[0])) continue
        if (m.index > at) parts.push({ type: 'text', value: value.slice(at, m.index) })
        parts.push({
          type: 'link',
          url: `${base}/commit/${m[0]}`,
          children: [{ type: 'text', value: m[0] }],
        })
        at = m.index + m[0].length
      }
      if (parts.length === 0) return
      if (at < value.length) parts.push({ type: 'text', value: value.slice(at) })
      parent.children?.splice(index, 1, ...parts)
      return index + parts.length
    })
  }
}
