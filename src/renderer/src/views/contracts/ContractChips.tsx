/**
 * Contract chips on a handoff card / the detail view (story 11.3 AC3):
 * file + sha, same tier styling as the timeline (solid = mentioned, dashed
 * --text-2 + explicit HEURISTIC label). Clicking navigates to the timeline
 * with the change focused. Renders nothing without links.
 */
import { useEffect, useMemo } from 'react'
import { useApp } from '../../stores/app'
import { useContracts } from '../../stores/contracts'
import { type ContractChipData, reverseContractLinks } from './contract-links'

/** Chip click: focus the change on the timeline (ring + scroll), then go. */
export function openContractChange(sha: string): void {
  const contracts = useContracts.getState()
  contracts.focus(sha)
  contracts.setProject('all') // the focused change must not be filtered away
  useApp.getState().setView('contracts')
}

export function ContractChips({ handoffId }: { handoffId: string }): React.JSX.Element | null {
  const changes = useContracts((s) => s.changes)
  const loading = useContracts((s) => s.loading)
  const load = useContracts((s) => s.load)

  useEffect(() => {
    // board-load recompute (AC5): first card mounting primes the timeline
    if (changes === null && !loading) void load()
  }, [changes, loading, load])

  const chips: ContractChipData[] = useMemo(
    () => reverseContractLinks(changes ?? [])[handoffId] ?? [],
    [changes, handoffId],
  )
  if (chips.length === 0) return null
  return (
    <span className="handoff-contracts">
      {chips.map((chip) => (
        <button
          key={`${chip.sha}:${chip.file}:${chip.confidence}`}
          type="button"
          className={`contract-link-chip chip-${chip.confidence}`}
          title={
            chip.confidence === 'mentioned'
              ? `Commit ${chip.sha.slice(0, 7)} is named in this handoff — open it on the timeline`
              : `Heuristic: ${chip.project} changed the same day — could be unrelated`
          }
          onClick={(e) => {
            e.stopPropagation()
            openContractChange(chip.sha)
          }}
        >
          {chip.file.split('/').pop()} @ {chip.sha.slice(0, 7)}
          {chip.confidence === 'heuristic' && <em className="chip-tier">heuristic</em>}
        </button>
      ))}
    </span>
  )
}
