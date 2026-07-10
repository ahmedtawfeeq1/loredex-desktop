/**
 * Humanized note titles (story 17.1, DESIGN.md "D1 amendment 3 — Humanized
 * note titles"): everywhere a note NAME renders as a title — reader header,
 * tree rows, search results, atlas note cards, handoff reading-order lists,
 * home attention rows — the machine name humanizes: strip the leading
 * `YYYY-MM-DD-` date, dashes → spaces, Title Case with the spec's small-word
 * list (first word always capitalized). The stripped date renders as mono
 * `--text-2` metadata next to / under the title; the REAL filename stays in
 * the frontmatter panel + tooltips. Pure functions, used by ALL surfaces —
 * no per-view drift (humanize.test.ts pins each surface to this module).
 */

/** Spec small-word list, verbatim: lowercased mid-title, never as word one. */
const SMALL_WORDS = new Set(['a', 'an', 'the', 'of', 'to', 'for', 'and', 'or', 'in', 'on'])

/** Leading filed-note date — only when an actual name follows it. */
const LEADING_DATE = /^(\d{4}-\d{2}-\d{2})-(?=.)/

/** A name that IS a bare date stays literal (nothing left to humanize). */
const BARE_DATE = /^\d{4}-\d{2}-\d{2}$/

/** Basename without any path or `.md` — what the vault calls the note. */
function baseName(name: string): string {
  return (name.split('/').pop() ?? name).replace(/\.md$/, '')
}

/** The note's filed date when the name leads with `YYYY-MM-DD-`, else null. */
export function noteDate(name: string): string | null {
  return LEADING_DATE.exec(baseName(name))?.[1] ?? null
}

/** `2026-07-05-error-handling-for-streaming.md` → `Error Handling for Streaming` */
export function humanizeTitle(name: string): string {
  const base = baseName(name)
  if (BARE_DATE.test(base)) return base
  const words = base.replace(LEADING_DATE, '').split(/[-\s]+/).filter(Boolean)
  if (words.length === 0) return base
  return words
    .map((word, i) => {
      const lower = word.toLowerCase()
      if (i > 0 && SMALL_WORDS.has(lower)) return lower
      // capitalize the first letter only — API/OAuth-style casing survives
      return word.charAt(0).toUpperCase() + word.slice(1)
    })
    .join(' ')
}
