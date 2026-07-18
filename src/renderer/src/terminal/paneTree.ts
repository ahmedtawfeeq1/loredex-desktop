/**
 * Pure pane-tree operations for the terminal drawer's VS Code-style splits
 * (terminal-splits blueprint 2026-07-18). No React, no xterm — unit-testable
 * under plain node. A leaf is one pty-backed terminal; a split holds two
 * children at a ratio. All ops are immutable and return the input root
 * unchanged (same reference) when the target id/path is absent.
 */

export type Pane =
  | { kind: 'term'; id: string }
  | { kind: 'split'; dir: 'row' | 'column'; ratio: number; a: Pane; b: Pane }

/** Address of a node from the root ('a'/'b' hops through split nodes). */
export type PanePath = ReadonlyArray<'a' | 'b'>

export const MIN_RATIO = 0.15
export const MAX_RATIO = 0.85

function clampRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) return 0.5
  return Math.min(MAX_RATIO, Math.max(MIN_RATIO, ratio))
}

/** Replace {kind:'term',id:targetId} with a 0.5 split — the target stays `a`
 *  (keeps its position), the new terminal becomes `b`. */
export function splitPane(
  root: Pane,
  targetId: string,
  dir: 'row' | 'column',
  newId: string,
): Pane {
  if (root.kind === 'term') {
    if (root.id !== targetId) return root
    return { kind: 'split', dir, ratio: 0.5, a: root, b: { kind: 'term', id: newId } }
  }
  const a = splitPane(root.a, targetId, dir, newId)
  if (a !== root.a) return { ...root, a }
  const b = splitPane(root.b, targetId, dir, newId)
  if (b !== root.b) return { ...root, b }
  return root
}

/** Remove a leaf: its parent split collapses to the sibling. null = that was
 *  the last pane (caller hides the drawer). */
export function removePane(root: Pane, id: string): Pane | null {
  if (root.kind === 'term') return root.id === id ? null : root
  const a = removePane(root.a, id)
  if (a !== root.a) return a === null ? root.b : { ...root, a }
  const b = removePane(root.b, id)
  if (b !== root.b) return b === null ? root.a : { ...root, b }
  return root
}

/** Set the ratio of the split addressed by `path`, clamped 0.15–0.85.
 *  A path that doesn't land on a split node is a no-op. */
export function setRatio(root: Pane, path: PanePath, ratio: number): Pane {
  if (root.kind !== 'split') return root
  if (path.length === 0) return { ...root, ratio: clampRatio(ratio) }
  const head = path[0]
  if (head === 'a') {
    const a = setRatio(root.a, path.slice(1), ratio)
    return a === root.a ? root : { ...root, a }
  }
  const b = setRatio(root.b, path.slice(1), ratio)
  return b === root.b ? root : { ...root, b }
}

/** Every terminal id in the tree, left-to-right. */
export function collectTermIds(root: Pane): string[] {
  return root.kind === 'term' ? [root.id] : [...collectTermIds(root.a), ...collectTermIds(root.b)]
}

/** The top-left-most terminal — the active-pane fallback. */
export function firstTermId(root: Pane): string {
  return root.kind === 'term' ? root.id : firstTermId(root.a)
}
