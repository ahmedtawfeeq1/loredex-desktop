/** Story 16.4: formatter-bar insertion math — markdown only, selection kept. */
import { describe, expect, it } from 'vitest'
import { applyFormat } from './editorFormat'

describe('wrap kinds', () => {
  it('bold wraps the selection and keeps it selected', () => {
    const r = applyFormat('make this strong', 5, 9, 'bold')
    expect(r.value).toBe('make **this** strong')
    expect(r.value.slice(r.start, r.end)).toBe('this')
  })

  it('italic and inline code wrap with their marks', () => {
    expect(applyFormat('a b c', 2, 3, 'italic').value).toBe('a *b* c')
    expect(applyFormat('a b c', 2, 3, 'code').value).toBe('a `b` c')
  })

  it('an empty selection inserts a selected placeholder', () => {
    const r = applyFormat('x ', 2, 2, 'bold')
    expect(r.value).toBe('x **bold**')
    expect(r.value.slice(r.start, r.end)).toBe('bold')
  })

  it('multi-line code selections become a fence', () => {
    const r = applyFormat('before\na\nb\nafter', 7, 10, 'code')
    expect(r.value).toBe('before\n```\na\nb\n```\nafter')
  })
})

describe('link', () => {
  it('wraps the selection and selects the url slot', () => {
    const r = applyFormat('see docs here', 4, 8, 'link')
    expect(r.value).toBe('see [docs](url) here')
    expect(r.value.slice(r.start, r.end)).toBe('url')
  })
})

describe('line kinds', () => {
  it('list prefixes every selected line, idempotently', () => {
    const r = applyFormat('one\ntwo\nthree', 0, 7, 'list')
    expect(r.value).toBe('- one\n- two\nthree')
    expect(applyFormat(r.value, r.start, r.end, 'list').value).toBe(r.value)
  })

  it('heading prefixes the caret line even with no selection', () => {
    const r = applyFormat('title line\nbody', 3, 3, 'heading')
    expect(r.value).toBe('## title line\nbody')
  })
})
