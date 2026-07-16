/**
 * Button primitive (DESIGN v3 §4). One cobalt primary per view, maximum.
 * Emits the stylesheet's `button-*` classes so legacy call sites that still
 * pass the class directly render through the exact same recipe — the CSS is
 * the single source of truth, this component is the ergonomic front door.
 * `kbd` renders the §4 in-button key hint (every triage action shows one).
 */
import { Kbd } from './Kbd'

export type ButtonVariant = 'primary' | 'secondary' | 'emphasis' | 'danger' | 'quiet'

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'button-primary',
  secondary: 'button-secondary',
  emphasis: 'button-emphasis',
  danger: 'button-destructive',
  quiet: 'button-quiet',
}

export function Button({
  variant = 'secondary',
  kbd,
  className,
  children,
  type = 'button',
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  /** §4 in-button keyboard hint, e.g. "A", "⌘K" */
  kbd?: string
}): React.JSX.Element {
  return (
    <button
      type={type}
      className={`${VARIANT_CLASS[variant]}${className ? ` ${className}` : ''}`}
      {...rest}
    >
      {children}
      {kbd !== undefined && <Kbd>{kbd}</Kbd>}
    </button>
  )
}
