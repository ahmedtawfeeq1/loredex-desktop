/**
 * Formatter-bar insertion math (story 16.4, Addendum D1): markdown insertion
 * ONLY — no WYSIWYG, no parsing. Pure string+selection transforms so the bar
 * is unit-testable under node; the component applies the result to the
 * textarea and restores the returned selection.
 */
export type FormatKind = 'bold' | 'italic' | 'code' | 'link' | 'list' | 'heading'

export interface FormatResult {
  value: string
  /** selection to restore after applying */
  start: number
  end: number
}

const WRAP: Record<string, { mark: string; placeholder: string }> = {
  bold: { mark: '**', placeholder: 'bold' },
  italic: { mark: '*', placeholder: 'italic' },
  code: { mark: '`', placeholder: 'code' },
}

/** Expand [start, end) to whole lines for the line-prefix kinds. */
function lineSpan(value: string, start: number, end: number): { from: number; to: number } {
  const from = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1
  const lineEnd = value.indexOf('\n', Math.max(end, from))
  return { from, to: lineEnd === -1 ? value.length : lineEnd }
}

export function applyFormat(
  value: string,
  start: number,
  end: number,
  kind: FormatKind,
): FormatResult {
  const selected = value.slice(start, end)

  if (kind === 'bold' || kind === 'italic' || kind === 'code') {
    if (kind === 'code' && selected.includes('\n')) {
      // multi-line code becomes a fence
      const block = `\`\`\`\n${selected}\n\`\`\``
      return { value: value.slice(0, start) + block + value.slice(end), start, end: start + block.length }
    }
    const { mark, placeholder } = WRAP[kind] as { mark: string; placeholder: string }
    const inner = selected || placeholder
    const next = value.slice(0, start) + mark + inner + mark + value.slice(end)
    return { value: next, start: start + mark.length, end: start + mark.length + inner.length }
  }

  if (kind === 'link') {
    const text = selected || 'text'
    const next = `${value.slice(0, start)}[${text}](url)${value.slice(end)}`
    const urlStart = start + text.length + 3 // "[" + text + "]("
    return { value: next, start: urlStart, end: urlStart + 3 }
  }

  // list / heading: prefix every selected line
  const prefix = kind === 'list' ? '- ' : '## '
  const { from, to } = lineSpan(value, start, end)
  const block = value
    .slice(from, to)
    .split('\n')
    .map((line) => (line.startsWith(prefix) ? line : prefix + line))
    .join('\n')
  const next = value.slice(0, from) + block + value.slice(to)
  return { value: next, start: from, end: from + block.length }
}
