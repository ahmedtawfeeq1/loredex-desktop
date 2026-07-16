/**
 * Editor v2 theme (story 16.7, DESIGN.md D1 amendment 2): CodeMirror chrome +
 * markdown syntax highlighting expressed ENTIRELY in the app's CSS theme
 * tokens (styles.css :root / [data-theme='dark']), so both themes apply with
 * zero editor-side theme switching — the vars flip, the editor follows.
 *
 * Scope note: story-16.7 styling ships from this module (EditorView.theme +
 * the EDITOR_V2_CSS string NoteEditor mounts in a <style> tag) — styles.css
 * is owned by a concurrently-committing workflow and stays untouched.
 */
import { HighlightStyle } from '@codemirror/language'
import { EditorView } from '@codemirror/view'
import { tags as t } from '@lezer/highlight'

/**
 * Syntax tint table — every value MUST be a styles.css theme token
 * (editorTheme.test.ts asserts presence in BOTH theme blocks).
 */
export const HIGHLIGHT_TOKENS = {
  heading: 'var(--text-1)',
  strong: 'var(--text-1)',
  emphasis: 'var(--text-1)',
  strikethrough: 'var(--text-2)',
  code: 'var(--rust)',
  link: 'var(--wikilink)',
  url: 'var(--wikilink)',
  quote: 'var(--text-2)',
  /** the markup itself: #, *, -, ```, [ ] — recedes to secondary ink */
  mark: 'var(--text-2)',
} as const

export const markdownHighlight = HighlightStyle.define([
  { tag: t.heading, color: HIGHLIGHT_TOKENS.heading, fontWeight: '650' },
  { tag: t.strong, color: HIGHLIGHT_TOKENS.strong, fontWeight: '650' },
  { tag: t.emphasis, color: HIGHLIGHT_TOKENS.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, color: HIGHLIGHT_TOKENS.strikethrough, textDecoration: 'line-through' },
  { tag: t.monospace, color: HIGHLIGHT_TOKENS.code },
  { tag: t.link, color: HIGHLIGHT_TOKENS.link },
  { tag: t.url, color: HIGHLIGHT_TOKENS.url, textDecoration: 'underline' },
  { tag: t.quote, color: HIGHLIGHT_TOKENS.quote, fontStyle: 'italic' },
  { tag: [t.processingInstruction, t.meta, t.punctuation, t.labelName], color: HIGHLIGHT_TOKENS.mark },
  { tag: t.contentSeparator, color: HIGHLIGHT_TOKENS.mark },
])

/** Editor chrome: 13px mono, token-colored caret/selection/panels, no box —
 * full-bleed in the pane like Read mode (no gutter: line numbers stay OFF). */
export const editorChrome = EditorView.theme({
  '&': { fontSize: '13px', color: 'var(--text-1)', backgroundColor: 'transparent' },
  '.cm-content': {
    fontFamily: 'var(--font-mono)',
    lineHeight: '1.6',
    caretColor: 'var(--text-1)',
    padding: '12px 0 48px',
  },
  '&.cm-focused': { outline: 'none' },
  '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--bg-inset) 70%, transparent)' },
  '.cm-selectionBackground, &.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground':
    { backgroundColor: 'color-mix(in srgb, var(--accent) 22%, transparent)' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--text-1)' },
  '&.cm-focused .cm-matchingBracket, &.cm-focused .cm-nonmatchingBracket': {
    backgroundColor: 'color-mix(in srgb, var(--accent) 25%, transparent)',
  },
  '.cm-panels': {
    backgroundColor: 'var(--bg-card)',
    color: 'var(--text-1)',
    borderBottom: '1px solid var(--hairline)',
  },
  '.cm-panels input, .cm-panels button, .cm-panels label': {
    fontFamily: 'var(--font-ui)',
    fontSize: '11px',
    color: 'var(--text-1)',
  },
  '.cm-panels input': {
    background: 'var(--bg-inset)',
    border: '1px solid var(--hairline)',
    borderRadius: '6px',
  },
  '.cm-searchMatch': { backgroundColor: 'color-mix(in srgb, var(--accent) 16%, transparent)' },
  '.cm-searchMatch-selected': { backgroundColor: 'color-mix(in srgb, var(--accent) 34%, transparent)' },
})

/**
 * Toolbar + host layout CSS (mounted by NoteEditor in a scoped <style>):
 * 28px icon buttons, hairline group borders, full-bleed host.
 */
export const EDITOR_V2_CSS = `
.editor-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  width: fit-content;
  margin: 16px 0 4px;
  padding: 2px;
  border: 1px solid var(--hairline);
  border-radius: 8px;
  background: var(--bg-card);
}
.editor-toolbar .tb-group {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 0 4px;
  border-right: 1px solid var(--hairline);
}
.editor-toolbar .tb-group:last-child { border-right: none; }
.editor-toolbar button {
  width: 28px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-2);
  font-family: var(--font-mono);
  font-size: 12px;
  cursor: pointer;
}
.editor-toolbar button:hover {
  background: var(--bg-inset);
  color: var(--text-1);
}
.editor-toolbar .tb-strike { text-decoration: line-through; }
.editor-toolbar select.tb-heading {
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-2);
  font-family: var(--font-mono);
  font-size: 12px;
  cursor: pointer;
}
.editor-toolbar select.tb-heading:hover {
  background: var(--bg-inset);
  color: var(--text-1);
}
/* full-bleed editor host — no border box; the pane is the page (13px mono
   rides the CodeMirror theme) */
.note-editor-cm { min-height: 55vh; }
.note-editor-cm .cm-editor { min-height: 55vh; }
`
