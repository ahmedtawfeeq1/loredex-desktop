/**
 * CommitChip (story 12.1) — THE commit-sha rendering for every view: short
 * mono sha linked to `<base>/commit/<sha>` when the repo's remote is GitHub,
 * plain mono text otherwise (never a broken URL — m2 §6 degradation).
 * External open rides the existing main-process guard (setWindowOpenHandler →
 * shell.openExternal); the renderer never opens URLs itself.
 *
 * PR slot (AC4): `pr` is populated by story 12.2's gh lookup; undefined/null
 * renders nothing — the chip is complete without gh.
 */
import { commitUrl, shortSha } from '../../../shared/github'

/** gh pr list row (story 12.2 shape, stubbed here so the slot exists). */
export interface PrInfo {
  url: string
  number: number
  title: string
  state: 'OPEN' | 'CLOSED' | 'MERGED'
  mergedAt: string | null
}

export function CommitChip({
  sha,
  base,
  pr,
}: {
  sha: string
  /** normalized GitHub web base for the repo this sha lives in; null = plain */
  base: string | null
  /** story 12.2 fills this; absent = slot renders nothing */
  pr?: PrInfo | null
}): React.JSX.Element {
  return (
    <span className="commit-chip">
      {base ? (
        <a
          className="mono commit-chip-sha"
          href={commitUrl(base, sha)}
          target="_blank"
          rel="noreferrer"
          title={`Open commit ${shortSha(sha)} on GitHub`}
          onClick={(e) => e.stopPropagation()}
        >
          {shortSha(sha)}
        </a>
      ) : (
        <span className="mono commit-chip-sha" title="No GitHub remote for this repo — hash only">
          {shortSha(sha)}
        </span>
      )}
      {pr && <PrChip pr={pr} />}
    </span>
  )
}

/** PR state chip (story 12.2): number + state, merged visually distinct. */
export function PrChip({ pr }: { pr: PrInfo }): React.JSX.Element {
  return (
    <a
      className={`commit-pr commit-pr-${pr.state.toLowerCase()}`}
      href={pr.url}
      target="_blank"
      rel="noreferrer"
      title={`${pr.title} — ${pr.state.toLowerCase()}${pr.mergedAt ? ` ${pr.mergedAt.slice(0, 10)}` : ''}`}
      onClick={(e) => e.stopPropagation()}
    >
      #{pr.number} {pr.state === 'MERGED' ? 'merged' : pr.state.toLowerCase()}
    </a>
  )
}
