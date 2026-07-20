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
import { Button } from '../../components/Button'
import { useEffect, useRef } from 'react'
import { defaultKeymap, history, historyKeymap, redo, undo } from '@codemirror/commands'
import { markdown, markdownKeymap, markdownLanguage } from '@codemirror/lang-markdown'
import { bracketMatching, syntaxHighlighting } from '@codemirror/language'
import { search, searchKeymap } from '@codemirror/search'
import { EditorState, Prec } from '@codemirror/state'
import { drawSelection, EditorView, highlightActiveLine, keymap } from '@codemirror/view'
import type { Doc } from '../../../../shared/ipc-contract'
import type { Identity } from '../../../../shared/types'
import { openNoteWindow, popoutMode } from '../../api'
import { useAgentPanel } from '../../stores/agentPanel'
import { useApp } from '../../stores/app'
import { useEditor } from '../../stores/editor'
import { useNoteDiff } from '../../stores/noteDiff'
import { actionCommand, applyAction, selectionText, type ToolbarAction } from './editorCommands'
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

/**
 * BL-19: this note's before/after, from git — the same two-column review the
 * contract timeline gives an API change, on the note itself. Opens under the
 * mode bar in BOTH read and edit mode (it hangs off ModeToggle), and closes on
 * a second click of ⇄ Changes.
 */
export function NoteChangesPanel({ selected }: { selected: string }): React.JSX.Element | null {
  const path = useNoteDiff((s) => s.path)
  const diff = useNoteDiff((s) => s.diff)
  const busy = useNoteDiff((s) => s.busy)
  const error = useNoteDiff((s) => s.error)
  // the store holds one note at a time; a different note's panel is not ours
  if (path !== selected) return null
  return (
    <section className="note-changes" aria-label="What changed in this note">
      <header className="note-changes-head">
        <strong>Changes</strong>
        {diff && (
          <span className="note-changes-meta" title={diff.sha}>
            {diff.subject || diff.sha.slice(0, 7)}
            {diff.when ? ` · ${new Date(diff.when).toLocaleString()}` : ''}
          </span>
        )}
        <span style={{ flex: 1 }} />
        <button type="button" title="Close" onClick={() => useNoteDiff.getState().close()}>
          ✕
        </button>
      </header>
      {busy && <p className="note-changes-empty">Reading history…</p>}
      {error && <p className="note-changes-empty">{error}</p>}
      {diff && (
        <>
          {diff.oldText === null && (
            <p className="note-changes-empty">This note was created in that commit — no “before”.</p>
          )}
          <div className="tool-diff" aria-label={`Diff of ${diff.rel}`}>
            <pre className="tool-diff-col tool-diff-old" tabIndex={0} dir="auto">
              {diff.oldText ?? ''}
            </pre>
            <pre className="tool-diff-col tool-diff-new" tabIndex={0} dir="auto">
              {diff.newText}
            </pre>
          </div>
        </>
      )}
    </section>
  )
}

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
    <>
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
      <span style={{ flex: 1 }} />
      {/* BL-19: before/after for this note, from git — the same review shape the
          contract timeline uses, on the note itself. */}
      <button
        type="button"
        className="note-mode-extra"
        title="Show what changed in this note (before / after)"
        onClick={() => void useNoteDiff.getState().open(selected)}
      >
        ⇄ Changes
      </button>
      {/* BL-18: this note in its own window — same pop-out as chat/terminal */}
      {popoutMode() === null && (
        <button
          type="button"
          className="note-mode-extra"
          title="Open this note in its own window"
          onClick={() => {
            const vaultPath = useApp.getState().identity?.vaultPath ?? null
            void openNoteWindow(vaultPath, selected)
          }}
        >
          ⧉ Pop out
        </button>
      )}
    </div>
    <NoteChangesPanel selected={selected} />
    </>
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
  identityLoaded,
}: {
  selected: string
  doc: Doc
  draft: string
  unsaved: boolean
  busy: boolean
  error: string | null
  identity: Identity | null
  /** BL-23: has the identity store finished loading? A null `identity` before
   *  it has means "not known yet", not "none saved" — the difference between a
   *  quiet editor and a false "your identity is missing" on every note open. */
  identityLoaded: boolean
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
            {
              // A8: ⇧⌘L stages the CM selection in the agent panel (same chord
              // the read-mode registry action uses; handling it here stops the
              // global one double-firing). No selection → let it fall through.
              key: 'Mod-Shift-l',
              run: (view) => {
                const text = selectionText(view.state)
                if (!text.trim()) return false
                useAgentPanel.getState().addContext(text, selected)
                return true
              },
            },
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
        <Button
          variant="primary"
          disabled={!identity || busy || !unsaved}
          title="Save (⌘S)"
          aria-keyshortcuts="Meta+S"
          onClick={() => identity && void useEditor.getState().save(identity)}>
          {busy ? 'Saving…' : 'Save'}
        </Button>
        {/* BL-23: only claim there's no identity once the load has actually
            finished — the store starts null, so this used to flash on every
            note open and read as "my saved identity was lost". */}
        {!identity && identityLoaded && (
          <p className="modal-error">
            Editing needs an identity.{' '}
            <Button
              variant="quiet"
              onClick={() => useApp.getState().setView('settings')}>
              Set it in Settings
            </Button>
          </p>
        )}
        {error && <p className="modal-error">{error}</p>}
      </div>
    </article>
  )
}
