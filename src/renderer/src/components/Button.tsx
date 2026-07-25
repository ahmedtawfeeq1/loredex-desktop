/**
 * Button primitive (DESIGN v3 §4). One cobalt primary per view, maximum.
 * Emits the stylesheet's `button-*` classes so legacy call sites that still
 * pass the class directly render through the exact same recipe — the CSS is
 * the single source of truth, this component is the ergonomic front door.
 * `kbd` renders the §4 in-button key hint (every triage action shows one).
 */
import { useEffect, useRef, useState } from 'react'
import { Kbd } from './Kbd'

export type ButtonVariant = 'primary' | 'secondary' | 'emphasis' | 'danger' | 'quiet'

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  primary: 'button-primary',
  secondary: 'button-secondary',
  emphasis: 'button-emphasis',
  danger: 'button-destructive',
  quiet: 'button-quiet',
}

/** How long the `ack` confirmation stays up. Long enough to read, short enough
 *  that a second click does not feel blocked. */
const ACK_MS = 1400

export function Button({
  variant = 'secondary',
  kbd,
  className,
  children,
  type = 'button',
  ack,
  onClick,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant
  /** §4 in-button keyboard hint, e.g. "A", "⌘K" */
  kbd?: string
  /**
   * Confirmation shown IN the button for a moment after it is clicked — e.g.
   * `ack="Copied"` renders `✓ Copied`.
   *
   * Reported 2026-07-23: "there is no effect for any button". Copy, Type and
   * the like fire and change nothing on screen, so you cannot tell a click that
   * worked from one that missed. Buttons whose result is already visible
   * elsewhere (Save, Test connection — they render their own status line) do
   * not need this.
   *
   * It is OPTIMISTIC: it confirms the click, not the outcome. Anything that can
   * fail visibly must still say so in its own status text.
   */
  ack?: string
}): React.JSX.Element {
  const [acked, setAcked] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // a click that unmounts the button (a card flipping to "Installed") must not
  // leave a timer setting state on a dead component
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), [])

  return (
    <button
      type={type}
      className={`${VARIANT_CLASS[variant]}${acked ? ' is-acked' : ''}${className ? ` ${className}` : ''}`}
      onClick={(e) => {
        onClick?.(e)
        if (!ack) return
        setAcked(true)
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => setAcked(false), ACK_MS)
      }}
      {...rest}
    >
      {acked && ack ? `✓ ${ack}` : children}
      {kbd !== undefined && <Kbd>{kbd}</Kbd>}
    </button>
  )
}
