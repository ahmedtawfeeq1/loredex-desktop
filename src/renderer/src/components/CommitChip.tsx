/**
 * CommitChip (story 12.1) — THE commit-sha rendering for every view: short
 * mono sha linked to `<base>/commit/<sha>` when the repo's remote is GitHub,
 * plain mono text otherwise (never a broken URL — m2 §6 degradation).
 * External open rides the existing main-process guard (setWindowOpenHandler →
 * shell.openExternal); the renderer never opens URLs itself.
 *
 * PR slot (story 12.2): pass `repoRoot` and the chip looks the PR up itself
 * through github.prForCommit (gh CLI core-side: capability-gated, 5 s timeout,
 * per-sha session cache; a renderer memo avoids repeat invokes). No gh / no
 * PR / non-GitHub → the slot renders nothing and the chip stays a plain link.
 */
import { useEffect, useState } from 'react'
import { commitUrl, shortSha } from '../../../shared/github'
import type { PrInfo } from '../../../shared/types'
import { invoke } from '../api'

export type { PrInfo }

/** renderer-side memo per repoRoot:sha (the core cache still backs it) */
const prMemo = new Map<string, PrInfo | null>()

function usePrLookup(repoRoot: string | undefined, sha: string): PrInfo | null {
  const key = repoRoot ? `${repoRoot}:${sha}` : null
  const [pr, setPr] = useState<PrInfo | null>(key ? (prMemo.get(key) ?? null) : null)
  useEffect(() => {
    if (!repoRoot || !key) return
    if (prMemo.has(key)) {
      setPr(prMemo.get(key) ?? null)
      return
    }
    let live = true
    invoke('github.prForCommit', { repoRoot, sha })
      .then((result) => {
        prMemo.set(key, result)
        if (live) setPr(result)
      })
      .catch(() => {
        prMemo.set(key, null) // degraded (old core / unregistered root) — plain link
      })
    return () => {
      live = false
    }
  }, [repoRoot, sha, key])
  return pr
}

export function CommitChip({
  sha,
  base,
  repoRoot,
  pr,
}: {
  sha: string
  /** normalized GitHub web base for the repo this sha lives in; null = plain */
  base: string | null
  /** set to enable the gh PR lookup for this sha (story 12.2) */
  repoRoot?: string
  /** explicit PR (tests / pre-fetched); wins over the lookup */
  pr?: PrInfo | null
}): React.JSX.Element {
  const looked = usePrLookup(pr === undefined ? repoRoot : undefined, sha)
  const shown = pr === undefined ? looked : pr
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
      {shown && <PrChip pr={shown} />}
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
