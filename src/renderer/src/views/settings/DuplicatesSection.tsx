/**
 * Duplicate-notes maintenance (multi-actor curate collision): lists notes filed
 * twice from the same upstream source and offers a "keep newest, remove the
 * rest" cleanup. Read-only until the user confirms; the delete is a two-click
 * confirm (no native dialog) and commits through vault.dedupe.
 */
import { useEffect, useState } from 'react'
import { isErrEnvelope } from '../../../../shared/ipc-contract'
import type { DuplicateGroup } from '../../../../shared/types'
import { invoke } from '../../api'
import { humanizeTitle } from '../../humanize'
import { effectiveIdentity, useIdentity } from '../../stores/identity'

const base = (p: string): string => p.split('/').pop() ?? p

export function DuplicatesSection(): React.JSX.Element {
  const [groups, setGroups] = useState<DuplicateGroup[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirmKey, setConfirmKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const identity = useIdentity((s) => effectiveIdentity(s))

  async function load(): Promise<void> {
    setError(null)
    try {
      setGroups(await invoke('vault.duplicates', undefined))
    } catch (e) {
      setError(isErrEnvelope(e) ? e.message : String(e))
    }
  }
  useEffect(() => {
    void load()
  }, [])

  async function remove(paths: string[], key: string): Promise<void> {
    if (!identity) {
      setError('Set your identity in Settings before removing notes — the delete is a git commit.')
      return
    }
    if (confirmKey !== key) {
      setConfirmKey(key) // first click arms the confirm
      return
    }
    setBusy(true)
    setError(null)
    try {
      await invoke('vault.dedupe', { paths, identity })
      setConfirmKey(null)
      await load()
    } catch (e) {
      setError(isErrEnvelope(e) ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const total = (groups ?? []).reduce((n, g) => n + g.copies.length - 1, 0)
  const allRedundant = (groups ?? []).flatMap((g) => g.copies.slice(1).map((c) => c.path))

  return (
    <div className="settings-section">
      <h2 className="settings-title">Duplicate notes</h2>
      <p className="settings-hint">
        Notes filed twice from the same source — usually two teammates curating the same
        project independently. Cleanup keeps the newest copy of each and removes the rest.
      </p>

      {groups === null ? (
        <p className="settings-hint">Scanning the vault…</p>
      ) : groups.length === 0 ? (
        <p className="settings-hint">No duplicates found — every note is filed once. ✓</p>
      ) : (
        <>
          <div className="dup-summary">
            <span>
              <strong>{total}</strong> duplicate{total === 1 ? '' : 's'} across{' '}
              <strong>{groups.length}</strong> note{groups.length === 1 ? '' : 's'}
            </span>
            <button
              type="button"
              className={`button-destructive${confirmKey === '__all__' ? ' is-confirm' : ''}`}
              disabled={busy}
              onClick={() => void remove(allRedundant, '__all__')}
              onBlur={() => confirmKey === '__all__' && setConfirmKey(null)}
            >
              {confirmKey === '__all__' ? `Confirm — remove ${total}` : `Remove all ${total}`}
            </button>
          </div>

          <ul className="dup-groups">
            {groups.map((g) => {
              const older = g.copies.slice(1)
              return (
                <li key={g.key} className="dup-group">
                  <div className="dup-group-head">
                    <span className="dup-source" title={`${g.sourceProject} · ${g.sourceRel}`}>
                      {humanizeTitle(base(g.sourceRel) || g.copies[0].path)}
                    </span>
                    <button
                      type="button"
                      className={`button-quiet dup-remove${confirmKey === g.key ? ' is-confirm' : ''}`}
                      disabled={busy}
                      onClick={() => void remove(older.map((c) => c.path), g.key)}
                      onBlur={() => confirmKey === g.key && setConfirmKey(null)}
                    >
                      {confirmKey === g.key ? `Confirm — remove ${older.length}` : `Remove ${older.length} older`}
                    </button>
                  </div>
                  <ul className="dup-copies">
                    {g.copies.map((c, i) => (
                      <li key={c.path} className={`dup-copy${i === 0 ? ' is-keep' : ''}`}>
                        <span className="dup-tag">{i === 0 ? 'keep' : 'remove'}</span>
                        <span className="mono dup-path" title={c.path}>
                          {c.path}
                        </span>
                        <span className="dup-date">{c.date}</span>
                      </li>
                    ))}
                  </ul>
                </li>
              )
            })}
          </ul>
        </>
      )}
      {error && <p className="settings-error">{error}</p>}
    </div>
  )
}
