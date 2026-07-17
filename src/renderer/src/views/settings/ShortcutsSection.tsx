/**
 * Settings › Shortcuts (slice C — reference 14): the four headline rows +
 * the ?-cheatsheet pointer. The full map stays in the `?` overlay (§5.1).
 */
const ROWS: ReadonlyArray<[string, string]> = [
  ['Command palette', '⌘K'],
  ['Places', '1-8'],
  ['New handoff · Consume', 'C · E'],
  ['Zoom out / close', 'esc'],
]

export function ShortcutsSection(): React.JSX.Element {
  return (
    <>
      <div className="set-card">
        {ROWS.map(([label, keys]) => (
          <div className="set-row" key={label}>
            <span className="set-row-label mono-label">{label}</span>
            <span className="set-row-value mono-keys">{keys}</span>
          </div>
        ))}
      </div>
      <p className="meta settings-foot">? opens the full cheatsheet anywhere</p>
    </>
  )
}
