/**
 * The `@`-triggered file picker above the composer. Presentational, like
 * SlashCommandMenu: AgentPanel owns the query + selection + keyboard, and this
 * renders one level of the vault tree. Reuses the slash menu's skin — same
 * affordance in the same place, so it should not look like a different thing.
 */
import { useEffect, useRef } from 'react'
import type { TreeNode } from '../../../shared/types'
import { humanizeTitle } from '../humanize'

export function FileMentionMenu({
  items,
  selected,
  onHover,
  onPick,
}: {
  items: TreeNode[]
  selected: number
  onHover: (i: number) => void
  onPick: (node: TreeNode) => void
}): React.JSX.Element {
  const activeRef = useRef<HTMLLIElement>(null)
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  return (
    <ul className="agent-slash-menu" role="listbox" aria-label="Vault files">
      {items.map((n, i) => (
        <li
          key={n.path}
          ref={i === selected ? activeRef : undefined}
          role="option"
          aria-selected={i === selected}
          className={i === selected ? 'agent-slash-opt is-active' : 'agent-slash-opt'}
          onMouseEnter={() => onHover(i)}
          onMouseDown={(e) => {
            // keep textarea focus — the picker inserts, it doesn't blur
            e.preventDefault()
            onPick(n)
          }}
        >
          <span className="agent-slash-name">
            {n.kind === 'dir' ? `${n.name}/` : humanizeTitle(n.name)}
          </span>
          <span className="agent-slash-desc">{n.path}</span>
          {n.kind === 'dir' && <span className="agent-slash-hint">folder</span>}
        </li>
      ))}
    </ul>
  )
}
