/**
 * Client-side query-operator parser (epic22, D1 amendment 7 §B). The Search
 * input and the ⌘K palette share ONE raw query string as the source of truth;
 * this module splits it into bare full-text `terms` + typed `filters`:
 *   project: topic: type: status: tag: from: to:  (frontmatter facets)
 *   before: after: on:                            (filed-note date, YYYY-MM-DD)
 * Everything else is bare full-text. The parsed filters map 1:1 to the core
 * `Facets` transport (extended for tag/date) so operators narrow deterministically
 * server-side, PRE-rank, through the same vault.search seam the facet selects use.
 * Pure + node-testable — no React, no store.
 */
import type { Facets } from '../../../../shared/types'
import type { SearchHit } from '../../../../shared/ipc-contract'

/** The operators, in chip/render order. `Facets` carries every one of these. */
export const OPERATOR_KEYS = [
  'project',
  'topic',
  'type',
  'status',
  'tag',
  'from',
  'to',
  'before',
  'after',
  'on',
] as const

export type OperatorKey = (typeof OPERATOR_KEYS)[number]
export type ParsedFilters = Partial<Record<OperatorKey, string>>

export interface ParsedQuery {
  /** bare full-text (operators stripped), original order, single-spaced */
  terms: string
  /** typed operator filters, last-wins on repeats */
  filters: ParsedFilters
}

const KEY_SET = new Set<string>(OPERATOR_KEYS)

// op:"quoted value" | op:bareValue | "quoted term" | bareTerm
const TOKEN = /(\w+):"([^"]*)"|(\w+):(\S+)|"([^"]*)"|(\S+)/g

/** Split a raw query into bare terms + typed filters (last operator wins). */
export function parseQuery(raw: string): ParsedQuery {
  const filters: ParsedFilters = {}
  const terms: string[] = []
  if (raw) {
    TOKEN.lastIndex = 0
    let m: RegExpExecArray | null
    // biome-ignore lint: single-pass tokenizer over the raw string
    while ((m = TOKEN.exec(raw)) !== null) {
      const op = (m[1] ?? m[3])?.toLowerCase()
      const opValue = m[2] ?? m[4]
      if (op !== undefined && KEY_SET.has(op)) {
        // known operator → filter (empty value clears it)
        if (opValue) filters[op as OperatorKey] = opValue
        else delete filters[op as OperatorKey]
      } else if (m[1] !== undefined || m[3] !== undefined) {
        // unknown `foo:bar` → keep as a bare full-text term, verbatim
        terms.push(`${m[1] ?? m[3]}:${opValue}`)
      } else {
        terms.push(m[5] ?? m[6] ?? '')
      }
    }
  }
  return { terms: terms.join(' ').trim(), filters }
}

/** Copy the defined operator filters onto the core Facets transport. */
export function filtersToFacets(filters: ParsedFilters): Facets {
  const facets: Facets = {}
  for (const key of OPERATOR_KEYS) {
    const v = filters[key]
    if (v) facets[key] = v
  }
  return facets
}

/** Upsert (or, with an empty value, remove) `op:value` in a raw query string,
 *  leaving bare terms and other operators verbatim. Quotes spaced values. */
export function setOperator(raw: string, op: OperatorKey, value: string): string {
  const re = new RegExp(`(?:^|\\s)${op}:(?:"[^"]*"|\\S+)`, 'gi')
  let next = raw.replace(re, ' ').replace(/\s+/g, ' ').trim()
  const v = value.trim()
  if (v) {
    const token = `${op}:${/\s/.test(v) ? `"${v}"` : v}`
    next = next ? `${next} ${token}` : token
  }
  return next
}

/** Active filters as [key, value] pairs in OPERATOR_KEYS order (chip render). */
export function activeFilters(filters: ParsedFilters): Array<[OperatorKey, string]> {
  const out: Array<[OperatorKey, string]> = []
  for (const key of OPERATOR_KEYS) {
    const v = filters[key]
    if (v) out.push([key, v])
  }
  return out
}

export interface HitGroup {
  project: string
  hits: SearchHit[]
}

/** Group ranked hits by project WITHOUT reordering: projects appear in the order
 *  their best (highest-ranked) hit does, hits keep their rank order in-group. */
export function groupHitsByProject(hits: SearchHit[]): HitGroup[] {
  const order: string[] = []
  const byProject = new Map<string, SearchHit[]>()
  for (const hit of hits) {
    const key = hit.project || 'product'
    let bucket = byProject.get(key)
    if (!bucket) {
      bucket = []
      byProject.set(key, bucket)
      order.push(key)
    }
    bucket.push(hit)
  }
  return order.map((project) => ({ project, hits: byProject.get(project) as SearchHit[] }))
}
