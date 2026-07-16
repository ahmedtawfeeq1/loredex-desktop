/**
 * Suggestion toasts (story 12.2 AC4): bottom-right receipt-style cards per the
 * DESIGN toast spec, but PERSISTENT — a suggestion is a decision, so it stays
 * until Apply or Dismiss (recorded deviation from the 5 s auto-dismiss).
 * Apply = one ordinary attributed write through the writer channels; Dismiss
 * persists and the suggestion never re-fires. Evidence line: mono sha + PR.
 */
import { Button } from './Button'
import { useSuggests, suggestionKey, type Suggestion } from '../stores/suggests'

function SuggestCard({ s }: { s: Suggestion }): React.JSX.Element {
  const applyingKey = useSuggests((st) => st.applyingKey)
  const apply = useSuggests((st) => st.apply)
  const dismiss = useSuggests((st) => st.dismiss)
  const busy = applyingKey === suggestionKey(s)
  return (
    <div className="toast suggest-toast" role="status">
      <span className="toast-title">
        {s.prUrl ? 'A merged PR references this handoff' : 'A commit references this handoff'}
      </span>
      <span className="toast-detail">
        {s.handoffId} → mark <strong>{s.suggested}</strong>?
      </span>
      <span className="toast-detail suggest-evidence">
        {s.sha.slice(0, 7)}
        {s.prUrl && (
          <>
            {' · '}
            <a href={s.prUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
              {s.prUrl.replace(/^https:\/\/github\.com\//, '')}
            </a>
          </>
        )}
      </span>
      <span className="suggest-actions">
        <Button
          variant="primary"
          className="suggest-apply"
          disabled={busy}
          title="One ordinary attributed status write — nothing happens without this click"
          onClick={() => void apply(s)}>
          {busy ? 'Applying…' : 'Apply'}
        </Button>
        <Button
          variant="quiet"
          disabled={busy}
          title="Never suggest this again for this commit"
          onClick={() => void dismiss(s)}>
          Dismiss
        </Button>
      </span>
    </div>
  )
}

export function SuggestToastStack(): React.JSX.Element | null {
  const suggestions = useSuggests((s) => s.suggestions)
  const error = useSuggests((s) => s.error)
  if (suggestions.length === 0 && !error) return null
  return (
    <div className="toast-stack suggest-stack" aria-live="polite">
      {error && <div className="toast suggest-toast note-error">{error}</div>}
      {suggestions.map((s) => (
        <SuggestCard key={suggestionKey(s)} s={s} />
      ))}
    </div>
  )
}
