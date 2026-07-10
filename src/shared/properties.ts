/**
 * Frontmatter Properties model (epic20, D1 amendment 7 §C). Pure, no fs, no
 * loredex — shared by the reader's Properties panel (renderer) and the
 * `note.setFrontmatter` core writer so the two agree on ONE truth about which
 * keys agents own and how a value is typed.
 *
 * Design principle intact: agents own frontmatter. loredex-managed keys are
 * LOCKED in the panel and REJECTED by the writer — a user never edits the
 * provenance/lifecycle/schema fields the engine stamps.
 */

/**
 * Keys the engine writes as provenance, lifecycle attribution, or schema —
 * agent-owned, never user-editable. `loredex`, `source_path`, `source_project`
 * and `source_rel` are the canonical four called out in the spec; the rest are
 * the same agent surface (route provenance, consume/accept/decline/snooze
 * attribution, thread edges, the schema stamp) locked for the same reason.
 */
export const MANAGED_FRONTMATTER_KEYS = [
  'loredex',
  'loredex_schema',
  'source',
  'source_path',
  'source_hash',
  'source_project',
  'source_rel',
  'consumed_by',
  'consumed_at',
  'accepted_by',
  'accepted_at',
  'declined_by',
  'declined_at',
  'declined_reason',
  'snoozed_by',
  'snoozed_at',
  'replies_to',
  'fulfills',
] as const

const MANAGED = new Set<string>(MANAGED_FRONTMATTER_KEYS)

/** Is this a loredex-managed key (locked in the panel, rejected by the writer)? */
export function isManagedKey(key: string): boolean {
  return MANAGED.has(key)
}

/** The typed control a property row renders as. url/path both render as links. */
export type PropertyType = 'date' | 'tags' | 'select' | 'url' | 'path' | 'text'

/** Keys whose value is a closed vocabulary → a colored select chip. */
const SELECT_KEYS = new Set(['status', 'type', 'kind'])

const ISO_DATE = /^\d{4}-\d{2}-\d{2}/
const URL_LIKE = /^https?:\/\//i

/**
 * Infer a property's control type from its key and value. Order matters:
 * array → tags; the closed-vocabulary keys → select; a URL string → url; a
 * date key or ISO-date string → date; a path-shaped key/value → path;
 * everything else is free text.
 */
export function inferPropertyType(key: string, value: unknown): PropertyType {
  if (Array.isArray(value) || key === 'tags') return 'tags'
  if (SELECT_KEYS.has(key)) return 'select'
  if (typeof value === 'string' && URL_LIKE.test(value)) return 'url'
  if (
    key === 'date' ||
    key.endsWith('_at') ||
    key.endsWith('_until') ||
    (typeof value === 'string' && ISO_DATE.test(value))
  ) {
    return 'date'
  }
  if (
    key.endsWith('_path') ||
    key.endsWith('_rel') ||
    (typeof value === 'string' && /\//.test(value) && !/\s/.test(value.trim()))
  ) {
    return 'path'
  }
  return 'text'
}

/** The value shape a freshly added property of the given type starts with. */
export function emptyValueForType(type: PropertyType): unknown {
  return type === 'tags' ? [] : ''
}
