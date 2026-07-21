/**
 * Staged edits — fleet-wide (agent-ops only).
 *
 * The genudo MCP stages every instruction edit locally before writing to a
 * client's account, which is the right design. But it is scoped to one account,
 * so nothing could answer "across all my clients, what did I stage and never
 * push?" — measured 2026-07-21: 29 staged folders across 3 clients, 26 of them
 * in one client on one day, none recording whether they shipped.
 *
 * This view answers it. Where the state is genuinely unknown it SAYS so rather
 * than guessing — the whole point is to stop the guessing.
 */
import { useEffect, useState } from 'react'
import type { StagedEdit, StagedEditsReport } from '../../../../shared/types'
import { invoke } from '../../api'
import { Button } from '../../components/Button'
import { useApp } from '../../stores/app'
import { useDex } from '../../stores/dex'
import { useReader } from '../../stores/reader'

const STATE_LABEL: Record<StagedEdit['state'], string> = {
  pushed: 'Pushed',
  staged: 'Not pushed',
  unknown: 'Unknown',
}

/** Group by client so 26 versions of one client read as one row, not 26. */
function byClient(edits: StagedEdit[]): { client: string; edits: StagedEdit[] }[] {
  const map = new Map<string, StagedEdit[]>()
  for (const e of edits) {
    const list = map.get(e.client) ?? []
    list.push(e)
    map.set(e.client, list)
  }
  return [...map.entries()]
    .map(([client, list]) => ({ client, edits: list }))
    .sort((a, b) => b.edits.length - a.edits.length || a.client.localeCompare(b.client))
}

export function StagedEditsView(): React.JSX.Element {
  const [report, setReport] = useState<StagedEditsReport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<Set<string>>(new Set())

  useEffect(() => {
    void invoke('agentops.stagedEdits', undefined)
      .then(setReport)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
  }, [])

  if (error) return <div className="staged-empty">Could not read staged edits — {error}</div>
  if (!report) return <div className="staged-empty">Scanning clients…</div>

  const groups = byClient(report.edits)
  const unresolved = report.edits.filter((e) => e.state !== 'pushed').length

  return (
    <div className="staged-view">
      <h1 className="staged-title">Staged edits</h1>
      <p className="staged-sub">
        Pipeline edits staged locally by the genudo agent, across all{' '}
        {report.clientsScanned} clients. Each agent session works one account at a
        time — this is the view across them.
      </p>

      {report.edits.length === 0 ? (
        <div className="staged-empty">
          No staged edits anywhere in this dex. Nothing is waiting to be pushed.
        </div>
      ) : (
        <>
          <div className="staged-summary">
            <strong>{report.edits.length}</strong> staged{' '}
            {report.edits.length === 1 ? 'version' : 'versions'} across{' '}
            <strong>{groups.length}</strong> of {report.clientsScanned} clients
            {unresolved > 0 && <> · {unresolved} not confirmed pushed</>}
          </div>

          {/* Honest about the gap rather than showing a confident wrong answer */}
          {!report.manifestsPresent && (
            <div className="staged-note">
              None of these record whether they were pushed, so the state below is{' '}
              <b>unknown</b> — not a guess that they are pending. This resolves itself
              once the genudo MCP writes a push status (change request 2026-07-21);
              until then the only way to confirm is to compare against the account.
            </div>
          )}

          {groups.map(({ client, edits }) => {
            const isOpen = open.has(client)
            return (
              <div className="staged-group" key={client}>
                <button
                  type="button"
                  className="staged-group-head"
                  aria-expanded={isOpen}
                  onClick={() =>
                    setOpen((prev) => {
                      const next = new Set(prev)
                      if (next.has(client)) next.delete(client)
                      else next.add(client)
                      return next
                    })
                  }
                >
                  <span className="staged-caret">{isOpen ? '▾' : '▸'}</span>
                  <strong>{client}</strong>
                  <span className="staged-count">
                    {edits.length} {edits.length === 1 ? 'version' : 'versions'}
                  </span>
                  <span className="staged-when">{edits[0]?.when}</span>
                  <span style={{ flex: 1 }} />
                  <Button
                    className="button-small"
                    onClick={(e) => {
                      e.stopPropagation()
                      useDex.getState().selectClient(client)
                      useApp.getState().setView('clients')
                    }}
                  >
                    Open client
                  </Button>
                </button>

                {isOpen && (
                  <div className="staged-rows">
                    {edits.map((edit) => (
                      <div className="staged-row" key={edit.path}>
                        <span className={`staged-state is-${edit.state}`}>
                          {STATE_LABEL[edit.state]}
                        </span>
                        <span className="staged-version">{edit.version}</span>
                        {edit.pipeline && (
                          <span className="staged-pipeline">{edit.pipeline}</span>
                        )}
                        <span className="staged-files">
                          {edit.fileCount} {edit.fileCount === 1 ? 'file' : 'files'}
                        </span>
                        <span style={{ flex: 1 }} />
                        <button
                          type="button"
                          className="staged-open"
                          title={edit.path}
                          onClick={() => {
                            // CHANGES.md is the review doc when it exists
                            useApp.getState().setView('reader')
                            void useReader.getState().open(`${edit.path}/CHANGES.md`)
                          }}
                        >
                          Open changes
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </>
      )}
    </div>
  )
}
