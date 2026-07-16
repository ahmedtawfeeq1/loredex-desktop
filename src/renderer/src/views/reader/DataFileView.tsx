/**
 * Read-only viewer for agent-ops data files (yaml/json/csv) — story: clients
 * epic. yaml/json render in CodeMirror (read-only, editorChrome tokens); csv
 * renders as a plain table (hand-rolled split, matching the core's structural
 * csvHead semantics — these are knowledge tables, not spreadsheets). Exports
 * are machine truth: no editing, ever.
 */
import { json } from '@codemirror/lang-json'
import { yaml } from '@codemirror/lang-yaml'
import { syntaxHighlighting } from '@codemirror/language'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { useEffect, useRef } from 'react'
import { humanizeTitle } from '../../humanize'
import { editorChrome, markdownHighlight } from './editorTheme'

const DATA_VIEW_CSS = `
.data-view { padding: 24px 32px; max-width: 980px; }
.data-view-header { display: flex; align-items: baseline; gap: 10px; margin-bottom: 14px; }
.data-view-title { font-family: var(--font-ui); font-size: 22px; color: var(--text-1); }
.data-view-type {
  font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em;
  color: var(--text-2); border: 1px solid var(--hairline); border-radius: 5px; padding: 1px 6px;
}
.data-view-readonly { font-size: 11px; color: var(--text-2); margin-left: auto; }
.data-view-code { border: 1px solid var(--hairline); border-radius: 8px; overflow: hidden; }
.data-table-wrap { overflow-x: auto; border: 1px solid var(--hairline); border-radius: 8px; }
.data-table { border-collapse: collapse; width: 100%; font-size: 12.5px; }
.data-table th {
  text-align: left; font-weight: 600; padding: 6px 10px; color: var(--text-1);
  background: var(--bg-inset); border-bottom: 1px solid var(--hairline);
  position: sticky; top: 0;
}
.data-table td { padding: 5px 10px; border-bottom: 1px solid var(--hairline); color: var(--text-1); }
.data-table tr:last-child td { border-bottom: none; }
.data-table-more { padding: 8px 10px; font-size: 11px; color: var(--text-2); }
`

/** Simple quote-aware line split — same semantics as the core's csvHead. */
export function splitCsvLine(line: string): string[] {
  const cells: string[] = []
  let current = ''
  let quoted = false
  for (const char of line) {
    if (char === '"') quoted = !quoted
    else if (char === ',' && !quoted) {
      cells.push(current.trim())
      current = ''
    } else current += char
  }
  cells.push(current.trim())
  return cells
}

const MAX_ROWS = 500

function CsvTable({ raw }: { raw: string }): React.JSX.Element {
  const lines = raw
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0)
  const headers = lines[0] ? splitCsvLine(lines[0]) : []
  const rows = lines.slice(1, 1 + MAX_ROWS).map(splitCsvLine)
  const hidden = Math.max(0, lines.length - 1 - MAX_ROWS)
  return (
    <div className="data-table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={`${h}-${String(i)}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((cells, r) => (
            // rows have no stable identity beyond position in the file
            // biome-ignore lint/suspicious/noArrayIndexKey: static read-only render
            <tr key={r}>
              {headers.map((_, c) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: static read-only render
                <td key={c}>{cells[c] ?? ''}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {hidden > 0 && <div className="data-table-more">{hidden} more row(s) not shown</div>}
    </div>
  )
}

function CodeBlock({ raw, fileType }: { raw: string; fileType: 'yaml' | 'json' }): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!host.current) return
    const view = new EditorView({
      state: EditorState.create({
        doc: raw,
        extensions: [
          EditorState.readOnly.of(true),
          EditorView.editable.of(false),
          EditorView.lineWrapping,
          fileType === 'json' ? json() : yaml(),
          syntaxHighlighting(markdownHighlight),
          editorChrome,
        ],
      }),
      parent: host.current,
    })
    return () => view.destroy()
  }, [raw, fileType])
  return <div className="data-view-code" ref={host} />
}

export function DataFileView({
  path,
  raw,
  fileType,
}: {
  path: string
  raw: string
  fileType: 'yaml' | 'json' | 'csv'
}): React.JSX.Element {
  const name = path.split('/').pop() ?? path
  return (
    <article className="data-view">
      <style>{DATA_VIEW_CSS}</style>
      <header className="data-view-header">
        <span className="data-view-title">{humanizeTitle(name.replace(/\.[^.]+$/, ''))}</span>
        <span className="data-view-type">{fileType}</span>
        <span className="data-view-readonly">read-only — exports are machine truth</span>
      </header>
      {fileType === 'csv' ? <CsvTable raw={raw} /> : <CodeBlock raw={raw} fileType={fileType} />}
    </article>
  )
}
