/**
 * Facet narrowing + vocabulary aggregation over vault frontmatter (story 2.4).
 * Read-only view logic — full-text ranking stays the lib's searchVault (one
 * search semantics with CLI/MCP; no second index). Frontmatter parses are
 * memoized per mtime, so edits self-invalidate; the manual refresh clears the
 * cache outright (v0.1 has no watcher).
 */
import { statSync } from 'node:fs'
import { join } from 'node:path'
import type { SearchHit } from 'loredex'
import type { Facets, FacetValues } from '../shared/types'

type Meta = Record<string, unknown>
type MetaLoader = (absPath: string) => Meta

const cache = new Map<string, { mtimeMs: number; meta: Meta }>()

/** mtime-keyed memoized frontmatter parse; unreadable notes memoize as {}. */
export function memoizedMeta(absPath: string, load: MetaLoader): Meta {
  let mtimeMs: number
  try {
    mtimeMs = statSync(absPath).mtimeMs
  } catch {
    return {}
  }
  const cached = cache.get(absPath)
  if (cached && cached.mtimeMs === mtimeMs) return cached.meta
  let meta: Meta
  try {
    meta = load(absPath)
  } catch {
    meta = {}
  }
  cache.set(absPath, { mtimeMs, meta })
  return meta
}

export function clearFacetCache(): void {
  cache.clear()
}

const str = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : String(v))

/**
 * One hit against the facet filter. project/topic/status ride the SearchHit
 * itself; type/from/to need the note's frontmatter (lazy — only parsed when
 * one of those facets is actually set).
 */
export function matchesFacets(hit: SearchHit, facets: Facets, load: MetaLoader): boolean {
  if (facets.project && hit.project !== facets.project) return false
  if (facets.topic && hit.topic !== facets.topic) return false
  if (facets.status && hit.status !== facets.status) return false
  if (facets.type || facets.from || facets.to) {
    const meta = memoizedMeta(hit.path, load)
    if (facets.type && str(meta['type']) !== facets.type) return false
    if (facets.from && str(meta['from']) !== facets.from) return false
    if (facets.to && str(meta['to']) !== facets.to) return false
  }
  return true
}

export function filterHits(hits: SearchHit[], facets: Facets | undefined, load: MetaLoader): SearchHit[] {
  if (!facets || Object.values(facets).every((v) => !v)) return hits
  return hits.filter((hit) => matchesFacets(hit, facets, load))
}

/**
 * Facet vocabulary from the vault as it is: project names from the tree,
 * topic/type/status (plus handoff from/to → projects) from frontmatter.
 */
export function aggregateFacetValues(
  vaultPath: string,
  relFiles: string[],
  load: MetaLoader,
): FacetValues {
  const projects = new Set<string>()
  const topics = new Set<string>()
  const types = new Set<string>()
  const statuses = new Set<string>()
  for (const rel of relFiles) {
    const segments = rel.split('/')
    if (segments[0] === 'projects' && segments.length > 2 && segments[1]) projects.add(segments[1])
    const meta = memoizedMeta(join(vaultPath, rel), load)
    for (const [key, into] of [
      ['topic', topics],
      ['type', types],
      ['status', statuses],
      ['from', projects],
      ['to', projects],
    ] as const) {
      const value = str(meta[key])
      if (value) into.add(value)
    }
  }
  const sorted = (s: Set<string>): string[] => [...s].sort()
  return {
    projects: sorted(projects),
    topics: sorted(topics),
    types: sorted(types),
    statuses: sorted(statuses),
  }
}
