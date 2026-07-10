/**
 * Toast stack (DESIGN v2 toasts): fixed bottom-right, receipt-style cards.
 * Click dismisses early; the store auto-dismisses after 5 s.
 */
import { useToasts } from '../stores/toasts'

export function ToastStack(): React.JSX.Element | null {
  const toasts = useToasts((s) => s.toasts)
  const dismiss = useToasts((s) => s.dismiss)
  if (toasts.length === 0) return null
  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          className="toast"
          title="Dismiss"
          onClick={() => dismiss(t.id)}
        >
          <span className="toast-title">{t.title}</span>
          {t.detail && <span className="toast-detail">{t.detail}</span>}
        </button>
      ))}
    </div>
  )
}
