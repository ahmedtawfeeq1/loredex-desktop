/**
 * Consume receipt (story 3.4, AC3): exactly what changed in frontmatter and
 * whether it pushed — honest about a pending push, never a fake success.
 */
import type { ConsumeReceipt } from '../../../shared/types'
import { formatValue } from '../views/reader/NoteView'

/** Keys whose value changed or appeared, in after-order — the diff rows. */
export function changedKeys(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
  return Object.keys(after).filter((key) => formatValue(after[key]) !== formatValue(before[key]))
}

export function ConsumeReceiptView({
  receipt,
  onDismiss,
}: {
  receipt: ConsumeReceipt
  onDismiss: () => void
}): React.JSX.Element {
  const before = receipt.before as Record<string, unknown>
  const after = receipt.after as Record<string, unknown>
  return (
    <div className="receipt" role="status">
      <div className="receipt-head">
        <span className="receipt-title">Consumed</span>
        <span className="receipt-meta">
          {receipt.handoffId} · {receipt.by.name} · {receipt.at}
        </span>
        <button type="button" className="button-quiet" onClick={onDismiss}>
          Dismiss
        </button>
      </div>
      <table className="receipt-diff">
        <tbody>
          {changedKeys(before, after).map((key) => (
            <tr key={key}>
              <td className="fm-key">{key}</td>
              <td className="receipt-before">
                {key in before ? formatValue(before[key]) : '—'}
              </td>
              <td className="receipt-after">{formatValue(after[key])}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className={`receipt-push${receipt.pushed ? '' : ' receipt-push-pending'}`}>
        {receipt.pushed
          ? 'Pushed to the vault remote.'
          : 'Recorded locally — will push on next sync.'}
      </p>
    </div>
  )
}
