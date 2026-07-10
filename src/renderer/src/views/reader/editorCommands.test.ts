/**
 * Story 16.7 (D1 amendment 2): toolbar action math over CodeMirror
 * EditorState — selection-aware wrap/toggle, pure state (no DOM). Carries
 * forward the 16.4 editorFormat semantics (wrap, placeholder, multi-line
 * code → fence, idempotent line prefixes) onto the CM seam.
 */
import { EditorSelection, EditorState } from '@codemirror/state'
import { describe, expect, it } from 'vitest'
import { applyAction, type ToolbarAction } from './editorCommands'

function apply(
  doc: string,
  from: number,
  to: number,
  action: ToolbarAction,
): { doc: string; selected: string; from: number; to: number } {
  const state = EditorState.create({ doc, selection: EditorSelection.single(from, to) })
  const next = state.update(applyAction(state, action)).state
  const main = next.selection.main
  return {
    doc: next.doc.toString(),
    selected: next.sliceDoc(main.from, main.to),
    from: main.from,
    to: main.to,
  }
}

describe('wrap kinds (selection-aware, toggle off when applied)', () => {
  it('bold wraps the selection and keeps it selected', () => {
    const r = apply('make this strong', 5, 9, 'bold')
    expect(r.doc).toBe('make **this** strong')
    expect(r.selected).toBe('this')
  })

  it('bold toggles OFF when the marks surround the selection', () => {
    const r = apply('make **this** strong', 7, 11, 'bold')
    expect(r.doc).toBe('make this strong')
    expect(r.selected).toBe('this')
  })

  it('bold strips marks included IN the selection', () => {
    const r = apply('make **this** strong', 5, 13, 'bold')
    expect(r.doc).toBe('make this strong')
    expect(r.selected).toBe('this')
  })

  it('italic and inline code wrap with their marks', () => {
    expect(apply('a b c', 2, 3, 'italic').doc).toBe('a *b* c')
    expect(apply('a b c', 2, 3, 'code').doc).toBe('a `b` c')
  })

  it('strikethrough wraps and toggles', () => {
    const r = apply('a b c', 2, 3, 'strike')
    expect(r.doc).toBe('a ~~b~~ c')
    expect(apply(r.doc, r.from, r.to, 'strike').doc).toBe('a b c')
  })

  it('an empty selection inserts a selected placeholder', () => {
    const r = apply('x ', 2, 2, 'bold')
    expect(r.doc).toBe('x **bold**')
    expect(r.selected).toBe('bold')
  })

  it('multi-line inline-code selections become a fence (16.4 rule)', () => {
    const r = apply('before\na\nb\nafter', 7, 10, 'code')
    expect(r.doc).toBe('before\n```\na\nb\n```\nafter')
  })

  it('wikilink wraps [[ ]] and toggles back off', () => {
    const r = apply('see streaming api note', 4, 17, 'wikilink')
    expect(r.doc).toBe('see [[streaming api]] note')
    expect(apply(r.doc, r.from, r.to, 'wikilink').doc).toBe('see streaming api note')
  })

  it('multiple selections wrap independently (CM multi-cursor)', () => {
    const state = EditorState.create({
      doc: 'aa bb',
      selection: EditorSelection.create([EditorSelection.range(0, 2), EditorSelection.range(3, 5)]),
      extensions: EditorState.allowMultipleSelections.of(true),
    })
    const next = state.update(applyAction(state, 'bold')).state
    expect(next.doc.toString()).toBe('**aa** **bb**')
  })
})

describe('link', () => {
  it('wraps the selection and selects the url slot', () => {
    const r = apply('see docs here', 4, 8, 'link')
    expect(r.doc).toBe('see [docs](url) here')
    expect(r.selected).toBe('url')
  })
})

describe('line kinds (toggle whole selected lines)', () => {
  it('bullet list prefixes every selected line; applying again toggles off', () => {
    const r = apply('one\ntwo\nthree', 0, 7, 'ul')
    expect(r.doc).toBe('- one\n- two\nthree')
    expect(apply(r.doc, 0, 9, 'ul').doc).toBe('one\ntwo\nthree')
  })

  it('numbered list numbers lines sequentially and toggles off', () => {
    const r = apply('a\nb\nc', 0, 5, 'ol')
    expect(r.doc).toBe('1. a\n2. b\n3. c')
    expect(apply(r.doc, 0, r.doc.length, 'ol').doc).toBe('a\nb\nc')
  })

  it('task list uses - [ ] and toggles off checked or not', () => {
    const r = apply('ship it', 0, 0, 'task')
    expect(r.doc).toBe('- [ ] ship it')
    expect(apply('- [x] done', 0, 0, 'task').doc).toBe('done')
  })

  it('quote prefixes and unprefixes', () => {
    const r = apply('wise words', 3, 3, 'quote')
    expect(r.doc).toBe('> wise words')
    expect(apply(r.doc, 3, 3, 'quote').doc).toBe('wise words')
  })
})

describe('headings H1–H4 (dropdown)', () => {
  it('h2 prefixes the caret line even with no selection', () => {
    expect(apply('title line\nbody', 3, 3, 'h2').doc).toBe('## title line\nbody')
  })

  it('a different level REPLACES the current one; the same level toggles off', () => {
    expect(apply('## title', 4, 4, 'h4').doc).toBe('#### title')
    expect(apply('## title', 4, 4, 'h2').doc).toBe('title')
  })
})

describe('blocks', () => {
  it('code block fences the selection and unwraps a fenced one', () => {
    const r = apply('let x = 1', 0, 9, 'codeblock')
    expect(r.doc).toBe('```\nlet x = 1\n```')
    expect(r.selected).toBe('let x = 1')
    expect(apply(r.doc, 0, r.doc.length, 'codeblock').doc).toBe('let x = 1')
  })

  it('table inserts the snippet below the current line', () => {
    const r = apply('above', 2, 2, 'table')
    expect(r.doc).toContain('above\n\n| Column | Column |\n| ------ | ------ |')
  })

  it('horizontal rule lands on its own line', () => {
    expect(apply('para', 4, 4, 'hr').doc).toBe('para\n\n---\n')
  })
})
