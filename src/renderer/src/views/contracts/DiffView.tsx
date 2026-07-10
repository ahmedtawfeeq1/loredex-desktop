/**
 * Unified diff renderer (story 11.2): line-class by prefix on --bg-inset
 * ground, additions --ok tint, deletions rust tint, mono 12px, inside its own
 * horizontally-scrolling container (DESIGN.md data-visualizations spec).
 */
import type { OpenDiff } from '../../stores/contracts'
import { classifyDiffLine } from './diff-logic'

export function DiffView({ diff }: { diff: OpenDiff }): React.JSX.Element {
  return (
    <div className="diff-card">
      {/* AC3: the cap is never a silent cut — say so, with the hash to dig */}
      {diff.truncated && (
        <p className="diff-truncated" role="status">
          Diff truncated at 200 KB — inspect commit <span className="mono">{diff.sha.slice(0, 12)}</span>{' '}
          in the repo for the full change.
        </p>
      )}
      <pre className="diff-view" tabIndex={0} aria-label={`Diff of ${diff.file}`}>
        {diff.unified.split('\n').map((line, i) => (
          // eslint-disable-next-line react/no-array-index-key -- diff lines are positional
          <div key={i} className={`diff-line diff-${classifyDiffLine(line)}`}>
            {line || ' '}
          </div>
        ))}
      </pre>
    </div>
  )
}
