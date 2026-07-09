/**
 * Wikilink shortest-path resolution (story 2.2) — the one op the work-plan
 * assigns to the app because it renders links and never touches files.
 * Obsidian algorithm: exact vault-relative path match, then path-suffix match
 * (unique basename is the one-segment case; a longer suffix is the "shortest
 * distinguishing suffix"). Ambiguity is surfaced, never silently guessed;
 * missing targets are diagnostics, never auto-created.
 */
import { posix } from 'node:path'
import type { LinkCandidate, LinkResolution } from '../shared/types'
import { listMarkdownFiles } from './tree'

/** vaultPath → flat list of vault-relative markdown paths */
const indexes = new Map<string, string[]>()

/** Hook point for story 2.3's `vault.changed`; until then, the manual refresh. */
export function invalidateLinkIndex(vaultPath?: string): void {
  if (vaultPath) indexes.delete(vaultPath)
  else indexes.clear()
}

function getIndex(vaultPath: string): string[] {
  let idx = indexes.get(vaultPath)
  if (!idx) {
    idx = listMarkdownFiles(vaultPath)
    indexes.set(vaultPath, idx)
  }
  return idx
}

function projectOf(path: string): string {
  const segments = path.split('/')
  if (segments[0] === 'projects' && segments.length > 2) return segments[1] as string
  return segments.length > 1 ? (segments[0] as string) : 'vault root'
}

export function resolveLink(vaultPath: string, link: string, from: string): LinkResolution {
  // tolerate full wikilink innards: strip |alias and #heading/#^block parts
  const cleaned = (link.split('|')[0] ?? '').split('#')[0]?.trim() ?? ''
  if (!cleaned) return { status: 'broken' }
  const files = getIndex(vaultPath)
  const relative = cleaned.startsWith('./') || cleaned.startsWith('../')
  const withExt = cleaned.endsWith('.md') ? cleaned : `${cleaned}.md`

  // relative links resolve against the linking note's folder, exact only
  if (relative) {
    const base = posix.normalize(posix.join(posix.dirname(from || '.'), withExt)).toLowerCase()
    const hit = files.find((f) => f.toLowerCase() === base)
    return hit ? { status: 'resolved', target: hit } : { status: 'broken' }
  }

  const wanted = withExt.toLowerCase()
  const exact = files.filter((f) => f.toLowerCase() === wanted)
  const matches = exact.length > 0 ? exact : files.filter((f) => f.toLowerCase().endsWith(`/${wanted}`))
  if (matches.length === 0) return { status: 'broken' }
  if (matches.length === 1) return { status: 'resolved', target: matches[0] as string }
  const candidates: LinkCandidate[] = matches
    .map((path) => ({ path, project: projectOf(path) }))
    .sort((a, b) => a.path.localeCompare(b.path))
  return { status: 'ambiguous', candidates }
}
