/**
 * Segmented control (DESIGN v3 §4 "pressed glass"): inset track, the active
 * segment lifts on --bg-overlay with an inner top-light. Radio semantics —
 * exactly one option active. Wraps the stylesheet's seg-control pattern.
 */
export interface SegmentedOption<V extends string> {
  value: V
  label: React.ReactNode
}

export function Segmented<V extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: ReadonlyArray<SegmentedOption<V>>
  value: V
  onChange: (value: V) => void
  ariaLabel: string
}): React.JSX.Element {
  return (
    <div className="seg-control" role="group" aria-label={ariaLabel}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className="seg-option"
          aria-pressed={o.value === value}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
