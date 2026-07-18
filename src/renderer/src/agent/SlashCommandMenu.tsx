/**
 * The `/`-triggered slash-command menu above the composer. Presentational:
 * AgentPanel owns the query + selection + keyboard; this just renders the list.
 * mouseDown (not click) so picking never blurs the textarea first.
 */
import type { AcpCommand } from '../../../shared/ipc-contract'

export function SlashCommandMenu({
  items,
  selected,
  onHover,
  onPick,
}: {
  items: AcpCommand[]
  selected: number
  onHover: (i: number) => void
  onPick: (name: string) => void
}): React.JSX.Element {
  return (
    <ul className="agent-slash-menu" role="listbox" aria-label="Slash commands">
      {items.map((c, i) => (
        <li
          key={c.name}
          role="option"
          aria-selected={i === selected}
          className={i === selected ? 'agent-slash-opt is-active' : 'agent-slash-opt'}
          onMouseEnter={() => onHover(i)}
          onMouseDown={(e) => {
            // keep textarea focus — the picker inserts, it doesn't blur
            e.preventDefault()
            onPick(c.name)
          }}
        >
          <span className="agent-slash-name">/{c.name}</span>
          <span className="agent-slash-desc">{c.description}</span>
          {c.hint && <span className="agent-slash-hint">{c.hint}</span>}
        </li>
      ))}
    </ul>
  )
}
