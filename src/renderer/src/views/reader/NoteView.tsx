/**
 * Note view: serif title, frontmatter metadata panel, body through the
 * sanctioned markdown pipeline. Story 16.4 (Addendum D1) makes it a writing
 * surface: Read ⇄ Edit mode toggle (⌘E) and Read-mode inline comments —
 * selection → floating Comment chip → margin composer → an anchored
 * `type: comment` vault note; anchored text carries a soft gold
 * underline-highlight, orphaned anchors list at note end with a rust chip.
 * D1 amendment (v1.1): hovering/focusing an anchored span floats the comment
 * popover above it — the fast path; the margin rail remains.
 */
import { Button } from '../../components/Button'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Doc } from '../../../../shared/ipc-contract'
import type { NoteComment } from '../../../../shared/types'
import { BrandMark } from '../../components/BrandMark'
import { DriftBadge } from '../../components/DriftBadge'
import { TasksContext } from '../../components/TaskCheckbox'
import { humanizeTitle, noteDate } from '../../humanize'
import { renderMarkdown } from '../../markdown/pipeline'
import { useComments } from '../../stores/comments'
import { useDiagnostics } from '../../stores/diagnostics'
import { useEditor } from '../../stores/editor'
import { useHandoffs } from '../../stores/handoffs'
import { effectiveIdentity, useIdentity } from '../../stores/identity'
import { useReader } from '../../stores/reader'
import { qualifiedId } from '../../../../shared/handoff-lanes'
import { stripDuplicateH1 } from '../home/brief-title'
import { handoffRefFromNote } from '../handoffs/compose-form'
import { attributionLines } from '../handoffs/lifecycle'
import { ContractChips } from '../contracts/ContractChips'
import { ReadingOrderInline, readingOrderEmptied } from '../handoffs/ReadingOrderInline'
import { ThreadRail } from '../handoffs/ThreadRail'
import {
  ANCHOR_TARGET_CLASS,
  anchorFromEvent,
  applyAnchorHighlights,
  clearAnchorHighlights,
  unwrapAnchorTargets,
  wrapAnchorTargets,
} from './anchorHighlight'
import { byAnchorPosition, commentsForAnchor, splitComments } from './comments'
import {
  CommentPopover,
  dismissOnEscape,
  keepsPopoverOpen,
  type PopoverAnchorBox,
} from './CommentPopover'
import { CommentsRail, OrphanedComments } from './InlineComments'
import { FindBar } from './FindBar'
import { ModeToggle, NoteEditor } from './NoteEditor'
import { PropertiesPanel } from './PropertiesPanel'
import { toggleTaskInNote } from './taskToggle'

/** Notes past this render length collapse the Properties panel by default (§C). */
const LONG_NOTE_CHARS = 1500

export function formatValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(String).join(', ')
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === 'object' && value !== null) return JSON.stringify(value)
  return String(value)
}

export function FrontmatterPanel({
  meta,
  path,
}: {
  meta: Record<string, unknown>
  /** story 17.1: the REAL filename stays visible here while titles humanize */
  path?: string
}): React.JSX.Element | null {
  const entries = Object.entries(meta).filter(([, v]) => v !== undefined && v !== null)
  if (entries.length === 0 && !path) return null
  return (
    <div className="frontmatter">
      <table>
        <tbody>
          {path && (
            <tr>
              <td className="fm-key">file</td>
              <td>{path}</td>
            </tr>
          )}
          {entries.map(([key, value]) => (
            <tr key={key}>
              <td className="fm-key">{key}</td>
              <td>{formatValue(value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function NoteView(): React.JSX.Element {
  const selected = useReader((s) => s.selected)
  const doc = useReader((s) => s.doc)
  const docError = useReader((s) => s.docError)
  const readingOrder = useReader((s) => s.readingOrder)
  // Addendum D1 (story 16.4): per-note mode — Edit replaces the article.
  // Store state rides down as props (presentation stays statically testable).
  const editing = useEditor((s) => s.editing && s.path === selected)
  const draft = useEditor((s) => s.draft)
  const unsaved = useEditor((s) => s.path === selected && s.draft !== s.saved)
  const busy = useEditor((s) => s.busy)
  const editError = useEditor((s) => s.error)
  const identity = useIdentity((s) => effectiveIdentity(s))
  const comments = useComments((s) => (s.path === selected ? s.list : null)) ?? []
  const composerAnchor = useComments((s) => s.composerAnchor)

  if (!selected) {
    return (
      <div className="empty-state reader-empty">
        <div className="empty-state-icon">
          <BrandMark size={44} />
        </div>
        <p>Select a note to read.</p>
        <span className="empty-state-hint">
          Browse the vault tree, filter files, or press ⌘K to search everything.
        </span>
      </div>
    )
  }
  if (docError) return <div className="note-error">{docError}</div>
  if (!doc) return <div />
  if (editing) {
    return (
      <NoteEditor
        selected={selected}
        doc={doc}
        draft={draft}
        unsaved={unsaved}
        busy={busy}
        error={editError}
        identity={identity}
      />
    )
  }
  return (
    <NoteArticle
      selected={selected}
      doc={doc}
      readingOrder={readingOrder}
      comments={comments}
      composerAnchor={composerAnchor}
      unsaved={unsaved}
    />
  )
}

/** Floating chip state: layout-relative position + the exact selected text. */
interface ChipState {
  x: number
  y: number
  anchor: string
}

// D1 amendment (v1.1): wrapAnchorTargets mutates DOM under the note body, so
// React must never diff INTO that subtree (text nodes move inside injected
// spans). The body div is keyed per render tree — a new tree replaces the
// whole subtree wholesale instead of reconciling a mutated one.
let renderSeq = 0

/** The note itself, props-driven (store state stops at NoteView — testable). */
export function NoteArticle({
  selected,
  doc,
  readingOrder,
  comments = [],
  composerAnchor = null,
  unsaved = false,
}: {
  selected: string
  doc: Doc
  readingOrder: string[]
  /** this note's anchored comments (story 16.4) */
  comments?: NoteComment[]
  /** open margin composer's exact selected text; null = closed */
  composerAnchor?: string | null
  /** an edit-mode draft exists for this note — the toggle shows the dot */
  unsaved?: boolean
}): React.JSX.Element {
  const title = (selected.split('/').pop() ?? selected).replace(/\.md$/, '')
  // memoize per note content — a 1 MB note re-renders only when it changes.
  // Addendum D1: index/MOC pages never render their H1 twice — a leading H1
  // equal to the chrome title (the filename) is stripped before the pipeline.
  const [renderKey, rendered] = useMemo(
    () => [(renderSeq += 1), renderMarkdown(stripDuplicateH1(doc.body, title))] as const,
    [doc, title],
  )

  // story 16.4: anchors are matched against the RENDERED text (the space
  // selections are captured in), markdown source as fallback
  const [bodyText, setBodyText] = useState<string | null>(null)
  const [chip, setChip] = useState<ChipState | null>(null)
  // D1 amendment (v1.1): the hover/focus popover over an anchored span
  const [popover, setPopover] = useState<{ anchor: string; box: PopoverAnchorBox } | null>(null)
  const layoutRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)

  const { anchored, orphaned } = splitComments(comments, [bodyText ?? doc.body, doc.body])
  const railComments = byAnchorPosition(anchored, bodyText ?? doc.body)

  // interactive checklists: clicking a task checkbox writes [ ]/[x] back to
  // the note source (note.save path — identity, git commit, file is truth)
  const onToggleTask = useCallback(
    (index: number, checked: boolean) => void toggleTaskInNote(selected, index, checked),
    [selected],
  )

  useEffect(() => {
    // rendered text + the D1 soft gold underline-highlight over anchors,
    // plus (v1.1) focusable hover targets wrapped around the same anchors
    const root = bodyRef.current
    if (!root) return
    const text = root.textContent ?? ''
    setBodyText(text)
    const anchors = [
      ...new Set(comments.filter((c) => text.includes(c.anchor)).map((c) => c.anchor)),
    ]
    wrapAnchorTargets(root, anchors) // textContent unchanged — highlights still match
    applyAnchorHighlights(root, anchors)
    return () => {
      clearAnchorHighlights()
      unwrapAnchorTargets(root)
    }
  }, [rendered, comments])

  useEffect(() => {
    // v1.1: Escape dismisses the popover wherever focus sits
    if (!popover || typeof document === 'undefined') return
    const onKey = (e: KeyboardEvent): void => dismissOnEscape(e.key, () => setPopover(null))
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [popover])

  function showPopover(anchor: string): void {
    // v1.1: attach the popover to the anchor's FIRST wrapped segment
    const layout = layoutRef.current
    const body = bodyRef.current
    if (!layout || !body) return
    const first = Array.from(body.querySelectorAll(`.${ANCHOR_TARGET_CLASS}`)).find(
      (el) => el.getAttribute('data-anchor') === anchor,
    )
    if (!first) return
    const rect = first.getBoundingClientRect()
    const layoutRect = layout.getBoundingClientRect()
    setPopover({
      anchor,
      box: {
        centerX: rect.left - layoutRect.left + rect.width / 2,
        top: rect.top - layoutRect.top,
        bottom: rect.bottom - layoutRect.top,
        viewportTop: rect.top,
        paneWidth: layoutRect.width,
      },
    })
  }

  function onMouseUp(): void {
    // Read-mode selection inside the note body → the floating Comment chip
    const sel = window.getSelection()
    const layout = layoutRef.current
    const body = bodyRef.current
    if (!sel || sel.isCollapsed || sel.rangeCount === 0 || !layout || !body) {
      setChip(null)
      return
    }
    const range = sel.getRangeAt(0)
    const anchor = sel.toString()
    if (!anchor.trim() || !body.contains(range.commonAncestorContainer)) {
      setChip(null)
      return
    }
    const rect = range.getBoundingClientRect()
    const layoutRect = layout.getBoundingClientRect()
    setChip({
      x: rect.left - layoutRect.left + rect.width / 2,
      y: rect.top - layoutRect.top,
      anchor,
    })
  }

  // story 7.3 AC1: the open handoff brief is the "detail view" — same actions
  const handoffRef = handoffRefFromNote(selected, doc.meta as Record<string, unknown>)
  // story 17.1 (D1 amendment 3): the header humanizes the machine name; the
  // stripped date is a mono line under the serif title; filename → tooltip
  const filedDate = noteDate(title)
  return (
    <div className="note-layout" ref={layoutRef} onMouseUp={onMouseUp}>
      {/* story epic17.3 (D1a3): ⌘F find bar — floats top-right, scans this
          rendered body, coexists with the anchor highlight over the same text */}
      <FindBar bodyRef={bodyRef} renderKey={renderKey} />
      <article className="note">
        <ModeToggle selected={selected} doc={doc} editing={false} unsaved={unsaved} />
        <h1 className="note-title" title={selected}>
          {humanizeTitle(title)}
        </h1>
        {filedDate && <p className="note-date">{filedDate}</p>}
        {/* epic4.story4: stale-vs-source badge + one-click re-route */}
        <DriftBadge path={selected} />
        {handoffRef &&
          attributionLines(doc.meta as Record<string, unknown>).map((line) => (
            <p key={line} className="handoff-history">
              {line}
            </p>
          ))}
        {/* story 11.3 AC3: the detail view carries the contract chips too */}
        {handoffRef && (
          <div className="note-contracts">
            <ContractChips handoffId={handoffRef.id} />
          </div>
        )}
        {handoffRef && (
          <div className="note-handoff-actions">
            <Button
              className="button-small"
              onClick={() => useHandoffs.getState().openCompose(handoffRef)}>
              Reply
            </Button>
            <Button
              className="button-small"
              onClick={() => useHandoffs.getState().openAnnotate(handoffRef)}>
              Comment
            </Button>
          </div>
        )}
        <PropertiesPanel
          key={selected}
          meta={doc.meta as Record<string, unknown>}
          path={selected}
          defaultCollapsed={doc.body.length > LONG_NOTE_CHARS}
        />
        <div
          className="note-body"
          ref={bodyRef}
          key={renderKey}
          // v1.1 popover, delegated (target spans are injected imperatively):
          // hover/focus an anchored span opens it; leaving to anywhere but
          // the popover or another segment of an anchor dismisses it
          onMouseOver={(e) => {
            const anchor = anchorFromEvent(e.target)
            if (anchor) showPopover(anchor)
          }}
          onMouseOut={(e) => {
            if (!keepsPopoverOpen(e.relatedTarget)) setPopover(null)
          }}
          onFocus={(e) => {
            const anchor = anchorFromEvent(e.target)
            if (anchor) showPopover(anchor)
          }}
          onBlur={(e) => {
            if (!keepsPopoverOpen(e.relatedTarget)) setPopover(null)
          }}
        >
          <TasksContext.Provider value={onToggleTask}>{rendered}</TasksContext.Provider>
        </div>
        {/* Addendum D1: a Reading order section never renders as silence — the
            2026-07-10 defect (writers emitted the heading with zero notes) */}
        {readingOrderEmptied(doc.body) && (
          <p className="ro-empty" role="note">
            Reading order lists no notes — this handoff was written without any.{' '}
            <button
              type="button"
              className="ro-empty-action"
              onClick={() => useDiagnostics.getState().setOpen(true)}
            >
              Open Link Diagnostics
            </button>
          </p>
        )}
        <ReadingOrderInline targets={readingOrder} from={selected} />
        <OrphanedComments comments={orphaned} />
        {handoffRef && <ThreadRail id={qualifiedId(handoffRef)} />}
      </article>
      {chip && (
        <button
          type="button"
          className="comment-chip"
          style={{ left: chip.x, top: chip.y }}
          onClick={() => {
            useComments.getState().openComposer(chip.anchor)
            setChip(null)
            window.getSelection()?.removeAllRanges()
          }}
        >
          Comment
        </button>
      )}
      {popover && (
        <CommentPopover
          comments={commentsForAnchor(anchored, popover.anchor)}
          box={popover.box}
          onDismiss={() => setPopover(null)}
        />
      )}
      <CommentsRail comments={railComments} composerAnchor={composerAnchor} />
    </div>
  )
}
