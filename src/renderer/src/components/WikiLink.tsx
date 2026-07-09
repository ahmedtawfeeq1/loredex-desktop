/**
 * Wikilink renderer (story 2.2). Resolved → navigate the reader; ambiguous →
 * popover picker with project context (never a silent guess); broken →
 * rust dotted diagnostic style, click opens the diagnostics panel — NEVER
 * creates a file. Hover (debounced) previews the target's first lines.
 */
import { type ReactNode, useEffect, useRef, useState } from 'react'
import type { Doc } from '../../../shared/ipc-contract'
import type { LinkResolution } from '../../../shared/types'
import { previewCached, resolveCached } from '../markdown/resolveCache'
import { renderMarkdown } from '../markdown/pipeline'
import { useDiagnostics } from '../stores/diagnostics'
import { useReader } from '../stores/reader'

const PREVIEW_LINES = 20
const HOVER_DELAY_MS = 350

function Preview({ path }: { path: string }): React.JSX.Element | null {
  const entry = previewCached(path)
  const [doc, setDoc] = useState<Doc | null>(entry.result ?? null)
  useEffect(() => {
    let live = true
    entry.promise.then((d) => {
      if (live) setDoc(d)
    }, () => {})
    return () => {
      live = false
    }
  }, [entry])
  if (!doc) return null
  const excerpt = doc.body.split('\n').slice(0, PREVIEW_LINES).join('\n')
  return (
    <span className="wikilink-popover wikilink-preview" role="tooltip">
      <span className="wikilink-preview-path">{path}</span>
      <span className="wikilink-preview-body">{renderMarkdown(excerpt)}</span>
    </span>
  )
}

export function WikiLink({ target, children }: { target: string; children: ReactNode }): React.JSX.Element {
  const from = useReader((s) => s.selected) ?? ''
  const openNote = useReader((s) => s.open)
  const entry = resolveCached(target, from)
  const [res, setRes] = useState<LinkResolution | null>(entry.result ?? null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [preview, setPreview] = useState(false)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let live = true
    entry.promise.then((r) => {
      if (live) setRes(r)
    }, () => {})
    return () => {
      live = false
    }
  }, [entry])

  const broken = res?.status === 'broken'
  useEffect(() => {
    if (broken && from) useDiagnostics.getState().report(from, target)
  }, [broken, from, target])

  const stopHover = (): void => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    hoverTimer.current = null
    setPreview(false)
  }
  useEffect(() => stopHover, [])

  const onClick = (e: React.MouseEvent): void => {
    e.preventDefault()
    stopHover()
    if (!res) return
    if (res.status === 'resolved' && res.target) void openNote(res.target)
    else if (res.status === 'ambiguous') setPickerOpen((v) => !v)
    else useDiagnostics.getState().setOpen(true)
  }

  const onMouseEnter = (): void => {
    if (res?.status !== 'resolved' || !res.target) return
    hoverTimer.current = setTimeout(() => setPreview(true), HOVER_DELAY_MS)
  }

  return (
    <span className="wikilink-wrap" onMouseLeave={stopHover}>
      <a
        href="#"
        className={broken ? 'wikilink wikilink-broken' : 'wikilink'}
        data-wikilink={target}
        title={
          broken
            ? `Broken link — no note in this vault matches “${target}”. Fix the name or add the note; links are never auto-created.`
            : res?.status === 'ambiguous'
              ? `“${target}” matches ${res.candidates?.length ?? 0} notes — click to choose`
              : undefined
        }
        onClick={onClick}
        onMouseEnter={onMouseEnter}
      >
        {children}
      </a>
      {pickerOpen && res?.status === 'ambiguous' && res.candidates && (
        <span className="wikilink-popover wikilink-picker" role="listbox" aria-label={`Notes matching ${target}`}>
          <span className="wikilink-picker-title">
            {res.candidates.length} notes match “{target}”
          </span>
          {res.candidates.map((c) => (
            <button
              key={c.path}
              type="button"
              role="option"
              aria-selected={false}
              className="wikilink-candidate"
              onClick={() => {
                setPickerOpen(false)
                void openNote(c.path)
              }}
            >
              <span className="wikilink-candidate-project">{c.project}</span>
              <span className="wikilink-candidate-path">{c.path}</span>
            </button>
          ))}
        </span>
      )}
      {preview && res?.status === 'resolved' && res.target && <Preview path={res.target} />}
    </span>
  )
}

/**
 * Anchor renderer for the sanctioned pipeline: wikilinks (marked by the remark
 * plugin) go through WikiLink; ordinary links open externally via the main
 * process guard.
 */
export function MarkdownAnchor(
  props: React.AnchorHTMLAttributes<HTMLAnchorElement> & { 'data-wikilink'?: string },
): React.JSX.Element {
  const target = props['data-wikilink']
  if (target !== undefined) return <WikiLink target={target}>{props.children}</WikiLink>
  return <a {...props} target="_blank" rel="noreferrer" />
}
