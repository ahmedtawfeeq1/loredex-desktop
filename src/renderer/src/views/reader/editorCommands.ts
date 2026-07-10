/**
 * Editor v2 toolbar/keymap math (story 16.7, DESIGN.md D1 amendment 2):
 * selection-aware markdown wrap/toggle over CodeMirror EditorState. Pure
 * state → TransactionSpec transforms — multiple selections supported via
 * changeByRange — unit-testable under node (no DOM, no EditorView).
 *
 * Wrap kinds toggle OFF when the mark is already applied (surrounding the
 * selection or included in it); line kinds toggle the whole selected lines.
 */
import {
  EditorSelection,
  type ChangeSpec,
  type EditorState,
  type StateCommand,
  type TransactionSpec,
} from '@codemirror/state'

export type ToolbarAction =
  | 'h1'
  | 'h2'
  | 'h3'
  | 'h4'
  | 'bold'
  | 'italic'
  | 'strike'
  | 'code'
  | 'codeblock'
  | 'wikilink'
  | 'link'
  | 'quote'
  | 'ul'
  | 'ol'
  | 'task'
  | 'table'
  | 'hr'

const WRAP: Partial<Record<ToolbarAction, { open: string; close: string; placeholder: string }>> = {
  bold: { open: '**', close: '**', placeholder: 'bold' },
  italic: { open: '*', close: '*', placeholder: 'italic' },
  strike: { open: '~~', close: '~~', placeholder: 'strikethrough' },
  code: { open: '`', close: '`', placeholder: 'code' },
  wikilink: { open: '[[', close: ']]', placeholder: 'note' },
}

const TABLE_SNIPPET = ['| Column | Column |', '| ------ | ------ |', '|        |        |'].join('\n')

/** Inline wrap with toggle-off — per selection range (multi-cursor aware). */
function toggleWrap(
  state: EditorState,
  open: string,
  close: string,
  placeholder: string,
): TransactionSpec {
  return state.changeByRange((range) => {
    const { from, to } = range
    const before = state.sliceDoc(Math.max(0, from - open.length), from)
    const after = state.sliceDoc(to, Math.min(state.doc.length, to + close.length))
    if (before === open && after === close) {
      // marks surround the selection → unwrap
      return {
        changes: [
          { from: from - open.length, to: from, insert: '' },
          { from: to, to: to + close.length, insert: '' },
        ],
        range: EditorSelection.range(from - open.length, to - open.length),
      }
    }
    const selected = state.sliceDoc(from, to)
    if (
      selected.length >= open.length + close.length &&
      selected.startsWith(open) &&
      selected.endsWith(close)
    ) {
      // the selection includes the marks → strip them
      return {
        changes: { from, to, insert: selected.slice(open.length, selected.length - close.length) },
        range: EditorSelection.range(from, to - open.length - close.length),
      }
    }
    const inner = selected || placeholder
    return {
      changes: { from, to, insert: open + inner + close },
      range: EditorSelection.range(from + open.length, from + open.length + inner.length),
    }
  })
}

/** The doc lines the main selection touches. */
function selectedLines(state: EditorState): Array<{ from: number; to: number; text: string }> {
  const { from, to } = state.selection.main
  const first = state.doc.lineAt(from).number
  const last = state.doc.lineAt(to).number
  const lines: Array<{ from: number; to: number; text: string }> = []
  for (let n = first; n <= last; n++) lines.push(state.doc.line(n))
  return lines
}

/** Line-prefix toggle: all lines carry the mark → strip; otherwise add. */
function toggleLinePrefix(
  state: EditorState,
  prefix: string | ((i: number) => string),
  matcher: RegExp,
): TransactionSpec {
  const lines = selectedLines(state)
  const changes: ChangeSpec[] = []
  if (lines.every((l) => matcher.test(l.text))) {
    for (const line of lines) {
      const m = matcher.exec(line.text) as RegExpExecArray
      changes.push({ from: line.from, to: line.from + m[0].length, insert: '' })
    }
  } else {
    lines.forEach((line, i) => {
      if (!matcher.test(line.text))
        changes.push({ from: line.from, insert: typeof prefix === 'string' ? prefix : prefix(i) })
    })
  }
  return { changes }
}

/** Set the heading level of every selected line; same level again toggles off. */
function setHeading(state: EditorState, level: number): TransactionSpec {
  const mark = '#'.repeat(level) + ' '
  const lines = selectedLines(state)
  const changes: ChangeSpec[] = []
  for (const line of lines) {
    const m = /^(#{1,6})\s+/.exec(line.text)
    if (m && m[1].length === level) changes.push({ from: line.from, to: line.from + m[0].length, insert: '' })
    else if (m) changes.push({ from: line.from, to: line.from + m[0].length, insert: mark })
    else changes.push({ from: line.from, insert: mark })
  }
  return { changes }
}

/** Fence the selection (or open an empty fence); a fenced selection unwraps. */
function toggleCodeBlock(state: EditorState): TransactionSpec {
  const { from, to } = state.selection.main
  const selected = state.sliceDoc(from, to)
  const fenced = /^```[^\n]*\n([\s\S]*?)\n?```$/.exec(selected)
  if (fenced) {
    return {
      changes: { from, to, insert: fenced[1] },
      selection: EditorSelection.range(from, from + (fenced[1] as string).length),
    }
  }
  const block = '```\n' + (selected || '') + '\n```'
  return {
    changes: { from, to, insert: block },
    selection: EditorSelection.range(from + 4, from + 4 + selected.length),
  }
}

/** `[text](url)` around the selection, url slot selected for typing over. */
function insertLink(state: EditorState): TransactionSpec {
  return state.changeByRange((range) => {
    const text = state.sliceDoc(range.from, range.to) || 'text'
    const urlStart = range.from + 1 + text.length + 2 // "[" + text + "]("
    return {
      changes: { from: range.from, to: range.to, insert: `[${text}](url)` },
      range: EditorSelection.range(urlStart, urlStart + 3),
    }
  })
}

/** Insert a block snippet on its own line(s) below the current line. */
function insertBlock(state: EditorState, snippet: string): TransactionSpec {
  const line = state.doc.lineAt(state.selection.main.head)
  const lead = line.length > 0 ? '\n\n' : ''
  const insert = lead + snippet + '\n'
  return {
    changes: { from: line.to, insert },
    selection: EditorSelection.cursor(line.to + insert.length),
  }
}

/** The one toolbar seam: action → TransactionSpec for the current state. */
export function applyAction(state: EditorState, action: ToolbarAction): TransactionSpec {
  switch (action) {
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
      return setHeading(state, Number(action[1]))
    case 'codeblock':
      return toggleCodeBlock(state)
    case 'link':
      return insertLink(state)
    case 'quote':
      return toggleLinePrefix(state, '> ', /^>\s?/)
    case 'ul':
      return toggleLinePrefix(state, '- ', /^[-*+]\s(?!\[[ xX]\]\s)/)
    case 'ol':
      return toggleLinePrefix(state, (i) => `${i + 1}. `, /^\d+[.)]\s/)
    case 'task':
      return toggleLinePrefix(state, '- [ ] ', /^[-*+]\s\[[ xX]\]\s/)
    case 'table':
      return insertBlock(state, TABLE_SNIPPET)
    case 'hr':
      return insertBlock(state, '---')
    default: {
      // wrap kinds: bold / italic / strike / code / wikilink
      const wrap = WRAP[action] as { open: string; close: string; placeholder: string }
      // a multi-line inline-code selection becomes a fence, not `…` (16.4 rule)
      const main = state.selection.main
      if (action === 'code' && state.sliceDoc(main.from, main.to).includes('\n'))
        return toggleCodeBlock(state)
      return toggleWrap(state, wrap.open, wrap.close, wrap.placeholder)
    }
  }
}

/** Keymap adapter (⌘B/⌘I/⌘K inside the editor). */
export function actionCommand(action: ToolbarAction): StateCommand {
  return ({ state, dispatch }) => {
    dispatch(state.update(applyAction(state, action)))
    return true
  }
}
