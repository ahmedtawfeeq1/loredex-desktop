/**
 * Edit mode v2 (story 16.7, DESIGN.md D1 amendment 2): the plain textarea of
 * story 16.4 upgrades to CodeMirror 6 — markdown syntax highlighting via
 * theme tokens (editorTheme.ts, both themes), active-line, bracket match,
 * markdown list continuation on Enter, history, ⌘F search panel, multiple
 * selections; selection-aware toolbar (editorCommands.ts) with headings
 * dropdown + 15 wrap/toggle actions; ⌘B/⌘I/⌘K bound INSIDE the editor.
 *
 * Unchanged 16.4 semantics: LOCKED frontmatter panel (body only editable —
 * agents own frontmatter), unsaved dot, ⌘S → note.save through the core
 * host, drafts live in the editor store (the CM doc syncs into it on every
 * change, so ⌘E out / ⌘E back restores). 13px mono, no line numbers,
 * full-bleed pane.
 */
import { useEffect, useRef } from 'react'
import { defaultKeymap, history, historyKeymap, redo, undo } from '@codemirror/commands'
import { markdown, markdownKeymap, markdownLanguage } from '@codemirror/lang-markdown'
import { bracketMatching, syntaxHighlighting } from '@codemirror/language'
import { search, searchKeymap } from '@codemirror/search'
import { EditorState, Prec } from '@codemirror/state'
import { drawSelection, EditorView, highlightActiveLine, keymap } from '@codemirror/view'
import type { Doc } from '../../../../shared/ipc-contract'
import type { Identity } from '../../../../shared/types'
import { useApp } from '../../stores/app'
import { useEditor } from '../../stores/editor'
import { actionCommand, applyAction, type ToolbarAction } from './editorCommands'
import { EDITOR_V2_CSS, editorChrome, markdownHighlight } from './editorTheme'
import { FrontmatterPanel } from './NoteView'

/** Toolbar spec (D1 amendment 2 order), hairline-bordered groups. */
const TOOLBAR: Array<Array<{ action: ToolbarAction | 'undo' | 'redo'; label: string; title: string; className?: string }>> = [
  [
    { action: 'bold', label: 'B', title: 'Bold — ⌘B' },
    { action: 'italic', label: 'I', title: 'Italic — ⌘I' },
    { action: 'strike', label: 'S', title: 'Strikethrough — ~~text~~', className: 'tb-strike' },
  ],
  [
    { action: 'code', label: '<>', title: 'Inline code — `text`' },
    { action: 'codeblock', label: '</>', title: 'Code block — ``` fence' },
  ],
  [
    { action: 'wikilink', label: '[[]]', title: 'Wikilink — [[note]]' },
    { action: 'link', label: '[a]', title: 'Link — ⌘K, [text](url)' },
  ],
  [
    { action: 'quote', label: '❯', title: 'Quote — > line' },
    { action: 'ul', label: '•', title: 'Bullet list — - item' },
    { action: 'ol', label: '1.', title: 'Numbered list — 1. item' },
    { action: 'task', label: '☑', title: 'Task list — - [ ] item' },
  ],
  [
    { action: 'table', label: '⊞', title: 'Table — snippet' },
    { action: 'hr', label: '—', title: 'Horizontal rule — ---' },
  ],
  [
    { action: 'undo', label: '↺', title: 'Undo — ⌘Z' },
    { action: 'redo', label: '↻', title: 'Redo — ⇧⌘Z' },
  ],
]

export function ModeToggle({
  selected,
  doc,
  editing,
  unsaved,
}: {
  selected: string
  doc: Doc
  editing: boolean
  unsaved: boolean
}): React.JSX.Element {
  return (
    <div className="note-mode" role="group" aria-label="Note mode">
      <button
        type="button"
        aria-pressed={!editing}
        title="Read (⌘E toggles)"
        onClick={() => useEditor.getState().exit()}
      >
        Read
      </button>
      <button
        type="button"
        aria-pressed={editing}
        title="Edit (⌘E)"
        aria-keyshortcuts="Meta+E"
        onClick={() => useEditor.getState().enter(selected, doc.body)}
      >
        Edit
      </button>
      {unsaved && <span className="unsaved-dot" title="Unsaved changes (⌘S to save)" />}
    </div>
  )
}

export function NoteEditor({
  selected,
  doc,
  draft,
  unsaved,
  busy,
  error,
  identity,
}: {
  selected: string
  doc: Doc
  draft: string
  unsaved: boolean
  busy: boolean
  error: string | null
  identity: Identity | null
}): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const title = (selected.split('/').pop() ?? selected).replace(/\.md$/, '')

  useEffect(() => {
    // one CodeMirror view per note, seeded from the store draft (⌘E back in
    // restores the kept draft); every doc change syncs back to the store so
    // unsaved/⌘S/dirty-guard all keep working off the one draft.
    const host = hostRef.current
    if (!host) return
    const view = new EditorView({
      doc: useEditor.getState().draft,
      parent: host,
      extensions: [
        history(),
        drawSelection(),
        EditorState.allowMultipleSelections.of(true),
        highlightActiveLine(),
        bracketMatching(),
        search({ top: true }),
        EditorView.lineWrapping,
        markdown({ base: markdownLanguage }), // GFM: tables, task lists, strikethrough
        syntaxHighlighting(markdownHighlight),
        editorChrome,
        // in-editor chords beat everything, incl. the global ⌘K palette
        Prec.high(
          keymap.of([
            { key: 'Mod-b', run: actionCommand('bold') },
            { key: 'Mod-i', run: actionCommand('italic') },
            { key: 'Mod-k', run: actionCommand('link') },
          ]),
        ),
        // markdownKeymap first: Enter continues lists/quotes, Backspace
        // deletes markup; then history (⌘Z/⇧⌘Z) + search (⌘F) + defaults
        keymap.of([...markdownKeymap, ...historyKeymap, ...searchKeymap, ...defaultKeymap]),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) useEditor.getState().setDraft(u.state.doc.toString())
        }),
      ],
    })
    viewRef.current = view
    // a chord CodeMirror handled (⌘B/⌘I/⌘K/⌘F/⌘Z…) must not bubble into the
    // App-shell registry handler and double-fire a global action
    const stopHandled = (e: KeyboardEvent): void => {
      if (e.defaultPrevented) e.stopPropagation()
    }
    host.addEventListener('keydown', stopHandled)
    view.focus()
    return () => {
      host.removeEventListener('keydown', stopHandled)
      view.destroy()
      viewRef.current = null
    }
  }, [selected])

  function run(action: ToolbarAction | 'undo' | 'redo'): void {
    const view = viewRef.current
    if (!view) return
    if (action === 'undo') undo(view)
    else if (action === 'redo') redo(view)
    else view.dispatch(view.state.update(applyAction(view.state, action)))
    view.focus()
  }

  return (
    <article className="note note-editing">
      <style>{EDITOR_V2_CSS}</style>
      <ModeToggle selected={selected} doc={doc} editing unsaved={unsaved} />
      <h1 className="note-title">{title}</h1>
      <div className="fm-locked">
        <p className="fm-locked-label">frontmatter · locked — agents own it</p>
        <FrontmatterPanel meta={doc.meta as Record<string, unknown>} />
      </div>
      <div className="editor-toolbar" role="toolbar" aria-label="Formatting (markdown, selection-aware)">
        <span className="tb-group">
          <select
            className="tb-heading"
            aria-label="Heading level"
            title="Heading — H1–H4 (toggles)"
            value=""
            onChange={(e) => {
              if (e.target.value) run(e.target.value as ToolbarAction)
            }}
          >
            <option value="" hidden>
              H
            </option>
            <option value="h1">H1</option>
            <option value="h2">H2</option>
            <option value="h3">H3</option>
            <option value="h4">H4</option>
          </select>
        </span>
        {TOOLBAR.map((group, gi) => (
          <span className="tb-group" key={gi}>
            {group.map(({ action, label, title: hint, className }) => (
              <button
                key={action}
                type="button"
                className={className}
                title={hint}
                aria-label={hint}
                onMouseDown={(e) => e.preventDefault() /* keep the editor selection */}
                onClick={() => run(action)}
              >
                {label}
              </button>
            ))}
          </span>
        ))}
      </div>
      <div
        ref={hostRef}
        className="note-editor-cm"
        data-draft-length={draft.length}
        aria-label="Note body (markdown)"
      />
      <div className="editor-foot">
        <button
          type="button"
          className="button-primary"
          disabled={!identity || busy || !unsaved}
          title="Save (⌘S)"
          aria-keyshortcuts="Meta+S"
          onClick={() => identity && void useEditor.getState().save(identity)}
        >
          {busy ? 'Saving…' : 'Save'}
        </button>
        {!identity && (
          <p className="modal-error">
            Editing needs an identity.{' '}
            <button
              type="button"
              className="button-quiet"
              onClick={() => useApp.getState().setView('settings')}
            >
              Set it in Settings
            </button>
          </p>
        )}
        {error && <p className="modal-error">{error}</p>}
      </div>
    </article>
  )
}
