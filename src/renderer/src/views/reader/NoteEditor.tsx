/**
 * Edit mode (story 16.4, Addendum D1 "the writing surface"): monospace 13px
 * textarea-grade editor, minimal formatter bar (markdown insertion only, no
 * WYSIWYG), LOCKED frontmatter panel (body only is editable — agents own
 * frontmatter), unsaved dot, ⌘S through the core host.
 *
 * Props-driven (NoteView passes store state down) so static-markup tests see
 * real values; handlers reach the stores via getState.
 */
import { useRef } from 'react'
import type { Doc } from '../../../../shared/ipc-contract'
import type { Identity } from '../../../../shared/types'
import { useApp } from '../../stores/app'
import { useEditor } from '../../stores/editor'
import { applyFormat, type FormatKind } from './editorFormat'
import { FrontmatterPanel } from './NoteView'

const FORMATS: Array<{ kind: FormatKind; label: string; title: string }> = [
  { kind: 'bold', label: 'B', title: 'Bold — **text**' },
  { kind: 'italic', label: 'I', title: 'Italic — *text*' },
  { kind: 'code', label: '<>', title: 'Code — `text`' },
  { kind: 'link', label: '[ ]', title: 'Link — [text](url)' },
  { kind: 'list', label: '•–', title: 'List — - item' },
  { kind: 'heading', label: 'H', title: 'Heading — ## line' },
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
  const ref = useRef<HTMLTextAreaElement>(null)
  const title = (selected.split('/').pop() ?? selected).replace(/\.md$/, '')

  function format(kind: FormatKind): void {
    const el = ref.current
    if (!el) return
    const r = applyFormat(el.value, el.selectionStart, el.selectionEnd, kind)
    useEditor.getState().setDraft(r.value)
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(r.start, r.end)
    })
  }

  return (
    <article className="note note-editing">
      <ModeToggle selected={selected} doc={doc} editing unsaved={unsaved} />
      <h1 className="note-title">{title}</h1>
      <div className="fm-locked">
        <p className="fm-locked-label">frontmatter · locked — agents own it</p>
        <FrontmatterPanel meta={doc.meta as Record<string, unknown>} />
      </div>
      <div className="formatter-bar" role="toolbar" aria-label="Formatting (markdown insertion)">
        {FORMATS.map(({ kind, label, title: hint }) => (
          <button
            key={kind}
            type="button"
            title={hint}
            aria-label={hint}
            onMouseDown={(e) => e.preventDefault() /* keep the textarea selection */}
            onClick={() => format(kind)}
          >
            {label}
          </button>
        ))}
      </div>
      <textarea
        ref={ref}
        className="note-editor"
        aria-label="Note body (markdown)"
        value={draft}
        onChange={(e) => useEditor.getState().setDraft(e.target.value)}
        spellCheck={false}
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
