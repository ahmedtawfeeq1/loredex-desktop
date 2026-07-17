/** Per-user font preferences. Values are font ids from the catalog (shared/fonts). */
export interface FontSettings {
  app: string
  note: { title: string; headings: string; body: string; code: string }
}

/** v3 defaults = the design's own faces (Geist / Geist Mono, vendored
 *  woff2s) — selected explicitly so Settings shows the truth. */
export const DEFAULT_FONT_SETTINGS: FontSettings = {
  app: 'geist',
  note: { title: 'geist', headings: 'geist', body: 'geist', code: 'geist-mono' },
}

export function isFontSettings(v: unknown): v is FontSettings {
  if (typeof v !== 'object' || v === null) return false
  const s = v as Record<string, unknown>
  if (typeof s.app !== 'string') return false
  const n = s.note as Record<string, unknown> | undefined
  return (
    typeof n === 'object' &&
    n !== null &&
    typeof n.title === 'string' &&
    typeof n.headings === 'string' &&
    typeof n.body === 'string' &&
    typeof n.code === 'string'
  )
}
