/**
 * Step A2: one tool row in the agent thread. Without output it stays the mono
 * machine line the panel always showed (title only, never raw adapter text).
 * With output — before/after diffs, text, or touched files — it becomes a
 * collapsible <details>: the summary is that same line, the body shows a
 * two-column old/new diff (the DESIGN.md diff palette: --rust before, --ok
 * after) and clickable file-refs. Clicking a .md ref relativizes the ABSOLUTE
 * ACP path (vault.relativize) and opens the note in the reader, scrolling to
 * the edited text. Tokens only, 1px hairlines, no gradients (design law).
 */
import { useEffect, useState } from 'react'
import { invoke } from '../api'
import type { AcpChatItem } from '../stores/agentPanel'
import { useReader } from '../stores/reader'
import type { AcpToolContent } from '../../../shared/ipc-contract'
import { findTextRange } from '../views/reader/anchorHighlight'
import { scrollFindMatchIntoView } from '../views/reader/findEngine'

type ToolItem = Extract<AcpChatItem, { type: 'tool' }>
type ToolDiffContent = Extract<AcpToolContent, { kind: 'diff' }>
type ToolTextContent = Extract<AcpToolContent, { kind: 'text' }>

/** Status = glyph + label, never color alone (design-fidelity law). Owned here
 *  now that the tool row does its own rendering. */
const TOOL_CHIP: Record<string, { glyph: string; label: string; cls: string }> = {
  pending: { glyph: '·', label: 'pending', cls: 'is-start' },
  in_progress: { glyph: '▸', label: 'running', cls: 'is-ok' },
  completed: { glyph: '✓', label: 'done', cls: 'is-ok' },
  failed: { glyph: '✕', label: 'failed', cls: 'is-err' },
}

/** A tool that hasn't reached a terminal state is still in flight. */
const IN_FLIGHT = new Set(['pending', 'in_progress'])

/**
 * BL-15: MCP servers commonly serialize their JSON result with Python's
 * `json.dumps`, whose `ensure_ascii=True` default turns every non-ASCII
 * character into a `\uXXXX` escape — so Arabic/CJK output arrived as
 * `خا...` and we rendered that literally.
 *
 * Round-tripping through JSON.parse → JSON.stringify decodes those escapes
 * (JS does NOT escape non-ASCII on the way out) and pretty-prints as a bonus.
 * Anything that isn't JSON is returned untouched — never mangle plain output.
 */
function prettyJson(text: string): string {
  const t = text.trim()
  if (!(t.startsWith('{') || t.startsWith('['))) return text
  try {
    return JSON.stringify(JSON.parse(t), null, 2)
  } catch {
    return text // not valid JSON — show exactly what the tool returned
  }
}

/** `12s` · `4m 05s` · `1h 02m` — compact, monospace-friendly. */
function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`
}

/**
 * BL-12: live elapsed time for a tool that is still pending/running, so a long
 * command reads as *working* rather than *stuck*. Ticks once a second and only
 * while in flight — a finished row costs no timer. Returns null when there is
 * nothing honest to show (terminal status, or history with no start time).
 */
function useElapsed(startedAt: number | undefined, inFlight: boolean): string | null {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!inFlight || startedAt === undefined) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [inFlight, startedAt])
  if (!inFlight || startedAt === undefined) return null
  return formatElapsed(now - startedAt)
}

/** A file the tool touched — from a diff's `.path` and/or a location. `needle`
 *  (a diff's first changed line) drives the scroll-to-edit after open. */
interface FileRef {
  abs: string
  line?: number
  needle?: string
}

const basename = (p: string): string => p.split(/[\\/]/).pop() || p
const isMarkdown = (p: string): boolean => /\.md$/i.test(p)

/** First non-empty line of the changed text, stripped of a leading markdown
 *  heading/list/quote marker so it matches the RENDERED note text (the reader
 *  strips those). Best-effort — an unmatched needle just no-ops the scroll. */
function scrollNeedle(text: string): string {
  const line = text.split('\n').map((l) => l.trim()).find((l) => l.length > 0) ?? ''
  return line.replace(/^(#{1,6}\s+|[-*+]\s+|\d+\.\s+|>\s*)/, '')
}

/** Unique files across the diff paths and locations, order-preserving. */
function collectRefs(item: ToolItem): FileRef[] {
  const byPath = new Map<string, FileRef>()
  for (const c of item.content ?? []) {
    if (c.kind !== 'diff') continue
    const cur = byPath.get(c.path)
    if (cur) cur.needle ??= scrollNeedle(c.newText)
    else byPath.set(c.path, { abs: c.path, needle: scrollNeedle(c.newText) })
  }
  for (const l of item.locations ?? []) {
    const cur = byPath.get(l.path)
    if (cur) {
      if (cur.line === undefined) cur.line = l.line
    } else byPath.set(l.path, { abs: l.path, line: l.line })
  }
  return [...byPath.values()]
}

/** After open() the note DOM renders async (startTransition), so poll a few
 *  frames for the .note-body to contain `needle`, then center it. Reuses the
 *  reader's find machinery: findTextRange as the readiness/existence check
 *  (walks text nodes), scrollFindMatchIntoView for the centered scroll math. */
function scrollNoteToText(needle: string, tries = 20): void {
  if (typeof document === 'undefined' || !needle) return
  const body = document.querySelector('.note-body')
  if (body && findTextRange(body, needle)) {
    const at = (body.textContent ?? '').indexOf(needle)
    if (at >= 0) scrollFindMatchIntoView(body, [{ start: at, end: at + needle.length }], 0)
    return
  }
  if (tries > 0 && typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => scrollNoteToText(needle, tries - 1))
  }
}

/** Relativize the ABSOLUTE ACP path and open it in the reader — only .md
 *  targets (data files/binaries have no reader view). No-core rejections are
 *  silent (the catch). Out-of-vault paths must ALSO no-op: vault.relativize
 *  (toVaultRelative) returns the absolute path unchanged when it isn't under
 *  the vault, so `rel === abs` means out-of-vault — bail before open(), else
 *  open() would navigate the reader away and then reject on the absolute path. */
async function openFileRef(abs: string, needle?: string): Promise<void> {
  if (!isMarkdown(abs)) return
  let rel: string
  try {
    rel = (await invoke('vault.relativize', { path: abs })).rel
  } catch {
    return
  }
  if (rel === abs) return // still absolute → outside the vault, nothing to open
  await useReader.getState().open(rel)
  if (needle) scrollNoteToText(needle)
}

/** The A2 before/after diff view — reused verbatim by the permission modal (A3)
 *  so the proposed change reads identically there. */
export function ToolDiff({ diff }: { diff: ToolDiffContent }): React.JSX.Element {
  return (
    <div className="tool-diff" aria-label={`Diff of ${diff.path}`}>
      <pre className="tool-diff-col tool-diff-old" tabIndex={0}>
        {diff.oldText ?? ''}
      </pre>
      <pre className="tool-diff-col tool-diff-new" tabIndex={0}>
        {diff.newText}
      </pre>
    </div>
  )
}

function FileRefButton({ file }: { file: FileRef }): React.JSX.Element {
  const md = isMarkdown(file.abs)
  return (
    <button
      type="button"
      className="agent-tool-ref"
      disabled={!md}
      title={file.abs}
      onClick={md ? () => void openFileRef(file.abs, file.needle) : undefined}
    >
      {basename(file.abs)}
      {file.line !== undefined ? `:${file.line}` : ''}
    </button>
  )
}

export function ToolCallRow({ item }: { item: ToolItem }): React.JSX.Element {
  const chip = TOOL_CHIP[item.status] ?? TOOL_CHIP.pending
  const elapsed = useElapsed(item.startedAt, IN_FLIGHT.has(item.status))
  const diffs = (item.content ?? []).filter((c): c is ToolDiffContent => c.kind === 'diff')
  const texts = (item.content ?? []).filter((c): c is ToolTextContent => c.kind === 'text')
  const refs = collectRefs(item)
  // BL-14: an input alone is worth expanding for — a tool with no output yet
  // (pending/running) can now still be inspected
  const expandable = diffs.length > 0 || texts.length > 0 || refs.length > 0 || Boolean(item.input)

  const line = (
    <>
      <span className={`agent-state-chip ${chip.cls}`}>
        {chip.glyph} {chip.label}
      </span>
      {elapsed && (
        <span className="agent-tool-elapsed" title="Time since this tool started">
          {elapsed}
        </span>
      )}
      {item.title}
    </>
  )

  // no output → the mono machine line the panel always had (title only)
  if (!expandable) {
    return (
      <div className="agent-tool-line" title={item.title}>
        {line}
      </div>
    )
  }

  return (
    <details className="agent-tool">
      <summary className="agent-tool-line agent-tool-summary" title={item.title}>
        {line}
      </summary>
      <div className="agent-tool-body">
        {item.input && (
          // BL-14: what the tool was ASKED to do. The protocol always sent this
          // (ToolCall.rawInput); the row just never read it.
          <>
            <div className="agent-tool-section">Input</div>
            <pre className="agent-tool-text" dir="auto">
              {item.input}
            </pre>
          </>
        )}
        {(diffs.length > 0 || texts.length > 0) && item.input && (
          <div className="agent-tool-section">Output</div>
        )}
        {diffs.map((d, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: tool content is positional, append-only
          <ToolDiff key={i} diff={d} />
        ))}
        {texts.map((t, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: tool content is positional, append-only
          // dir="auto" so Arabic/Hebrew output renders right-to-left per line
          <pre key={i} className="agent-tool-text" dir="auto">
            {prettyJson(t.text)}
          </pre>
        ))}
        {refs.length > 0 && (
          <div className="agent-tool-refs">
            {refs.map((f) => (
              <FileRefButton key={f.abs} file={f} />
            ))}
          </div>
        )}
      </div>
    </details>
  )
}
