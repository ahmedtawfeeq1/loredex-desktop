/**
 * Settings › General (slice C — user reference #23): dex name row + product
 * grouping row, both read-only facts of the dex on disk (name = folder,
 * grouping = _index/products.json), with the workspace-shared footnote.
 */
import { useMemo } from 'react'
import { useApp } from '../../stores/app'
import { useReader } from '../../stores/reader'
import { shelvesFrom } from '../../components/SideNav'

export function GeneralSection(): React.JSX.Element {
  const vaultPath = useApp((s) => s.identity?.vaultPath ?? '')
  const tree = useReader((s) => s.tree)
  const shelves = useMemo(() => shelvesFrom(tree), [tree])
  const products = shelves.filter((s) => s.product !== null).length
  const dexName = vaultPath.split('/').filter(Boolean).pop() ?? 'dex'

  return (
    <>
      <div className="set-card">
        <div className="set-row">
          <span className="set-row-label">Dex name</span>
          <span className="set-row-value chip-value">{dexName}</span>
        </div>
        <div className="set-row">
          <span className="set-row-label">Product grouping</span>
          <span className="set-row-value meta">
            {products > 0 ? `auto · ${products} product${products === 1 ? '' : 's'} ▾` : 'flat · no products yet'}
          </span>
        </div>
      </div>
      <p className="meta settings-foot">workspace-shared — synced through the dex remote</p>
    </>
  )
}
