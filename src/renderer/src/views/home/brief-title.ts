/**
 * Defect 14.2-1: the home view chrome AND the brief markdown both rendered an
 * H1 ("Start Here" twice). One owner, recorded: the view chrome owns the title.
 * A leading level-1 heading is lifted off the markdown and shown as the chrome
 * title (so curated briefs keep their own wording); deeper headings and H1s
 * later in the body are untouched.
 */

export interface BriefTitle {
  /** the brief's own H1 text, when it opens with one */
  title: string | null
  /** markdown with that leading H1 removed (otherwise verbatim) */
  body: string
}

export const DEFAULT_BRIEF_TITLE = 'Start Here — Product'

export function splitLeadingH1(markdown: string): BriefTitle {
  const lines = markdown.split('\n')
  let i = 0
  while (i < lines.length && lines[i]?.trim() === '') i++
  const match = lines[i]?.match(/^#\s+(.+?)\s*$/)
  if (!match) return { title: null, body: markdown }
  return { title: match[1] ?? null, body: lines.slice(i + 1).join('\n') }
}

/**
 * Addendum D1 (same defect class as 14.2-1, now for index/MOC pages): the
 * reader chrome shows the filename as the title, so a leading H1 that merely
 * repeats it is stripped. A DIFFERENT leading H1 (curated wording) is kept.
 */
export function stripDuplicateH1(markdown: string, title: string): string {
  const { title: leading, body } = splitLeadingH1(markdown)
  if (leading !== null && leading.trim().toLowerCase() === title.trim().toLowerCase()) return body
  return markdown
}
