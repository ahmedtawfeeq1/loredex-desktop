/**
 * Toast stack (DESIGN v2 toasts): fixed bottom-right, receipt-style cards.
 * Click the body to dismiss early; the store auto-dismisses. A toast may carry
 * one inline action (epic4: route-receipt Undo) rendered as a secondary pill.
 */
import { useToasts } from '../stores/toasts'

export function ToastStack(): React.JSX.Element | null {
  const toasts = useToasts((s) => s.toasts)
  const dismiss = useToasts((s) => s.dismiss)
  if (toasts.length === 0) return null
  return (
    <div className="toast-stack" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          <button
            type="button"
            className="toast-body"
            title="Dismiss"
            onClick={() => dismiss(t.id)}
          >
            <span className="toast-title">{t.title}</span>
            {t.detail && <span className="toast-detail">{t.detail}</span>}
          </button>
          {t.action && (
            <button
              type="button"
              className="toast-action"
              onClick={() => {
                void t.action?.run()
                dismiss(t.id)
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
