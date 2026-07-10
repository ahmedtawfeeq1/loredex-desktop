/**
 * Reverse contract-link index (story 11.3): handoffId → the changes linked to
 * it, derived by inverting the timeline payload — recomputed per render/load,
 * nothing persisted (m2 §8 placement: Derived).
 */
import type { ContractChange } from '../../../../shared/types'

export interface ContractChipData {
  repoRoot: string
  file: string
  sha: string
  project: string
  confidence: 'mentioned' | 'heuristic'
}

/**
 * Invert `change.links`; per handoff, one chip per (sha, file) at the
 * strongest tier, `mentioned` chips first, then newest-first timeline order.
 */
export function reverseContractLinks(
  changes: readonly ContractChange[],
): Record<string, ContractChipData[]> {
  const byHandoff: Record<string, ContractChipData[]> = {}
  for (const change of changes) {
    for (const link of change.links) {
      const chips = (byHandoff[link.handoffId] ??= [])
      const existing = chips.find((c) => c.sha === change.sha && c.file === change.file)
      if (existing) {
        if (existing.confidence === 'heuristic' && link.confidence === 'mentioned') {
          existing.confidence = 'mentioned'
        }
        continue
      }
      chips.push({
        repoRoot: change.repoRoot,
        file: change.file,
        sha: change.sha,
        project: change.project,
        confidence: link.confidence,
      })
    }
  }
  for (const chips of Object.values(byHandoff)) {
    chips.sort((a, b) =>
      a.confidence === b.confidence ? 0 : a.confidence === 'mentioned' ? -1 : 1,
    )
  }
  return byHandoff
}
