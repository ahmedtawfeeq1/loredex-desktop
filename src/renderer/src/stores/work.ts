/**
 * Work items store (v3 parity slices D/E): the lib's board plane over the
 * typed seam — tasks ∪ handoffs with backlog/todo/doing/review/done/
 * consumed statuses (loredex ≥ 2.8). Reads feed Today's sprint card and the
 * Plan board; the one writer patches task frontmatter (handoffs keep their
 * 8.1 machine). Refreshes on vault.changed like every other read model.
 */
import { create } from 'zustand'
import { isErrEnvelope } from '../../../shared/ipc-contract'
import type { WorkItem, WorkPatch } from '../../../shared/ipc-contract'
import { invoke, onEvent } from '../api'
import { effectiveIdentity, useIdentity } from './identity'
import { useToasts } from './toasts'

interface WorkState {
  items: WorkItem[] | null
  error: string | null
  load(retried?: boolean): Promise<void>
  update(id: string, patch: WorkPatch): Promise<void>
  reset(): void
}

export const useWork = create<WorkState>((set, get) => ({
  items: null,
  error: null,

  async load(retried = false) {
    try {
      const items = await invoke('work.list', undefined)
      set({ items, error: null })
    } catch (e) {
      if (!retried && isErrEnvelope(e) && e.code === 'PORT_SWAPPED') return get().load(true)
      set({ error: isErrEnvelope(e) ? `${e.code}: ${e.message}` : String(e) })
    }
  },

  async update(id, patch) {
    const identity = effectiveIdentity(useIdentity.getState())
    if (!identity) return
    try {
      const receipt = await invoke('work.update', { id, patch, identity })
      useToasts
        .getState()
        .push(
          'Work item updated',
          `${receipt.id} · ${Object.entries(patch)
            .map(([k, v]) => `${k}=${v}`)
            .join(' ')} · ${receipt.pushed ? 'pushed' : 'will push on next sync'}`,
        )
      void get().load()
    } catch (e) {
      set({ error: isErrEnvelope(e) ? `${e.code}: ${e.message}` : String(e) })
    }
  },

  reset() {
    set({ items: null, error: null })
  },
}))

if (typeof window !== 'undefined' && window.loredex) {
  onEvent((e) => {
    if (e.kind === 'vault.changed' && useWork.getState().items !== null) {
      void useWork.getState().load()
    }
  })
}

/** Sprint rollup for Today's rail card — latest sprint label wins. Pure. */
export function sprintRollup(items: readonly WorkItem[]): {
  sprint: string | null
  done: number
  doing: number
  todo: number
  total: number
} {
  const sprints = [...new Set(items.map((i) => i.sprint).filter(Boolean))].sort()
  const sprint = (sprints.at(-1) as string | undefined) ?? null
  const inSprint = sprint ? items.filter((i) => i.sprint === sprint) : items
  const count = (s: string): number => inSprint.filter((i) => i.status === s).length
  return {
    sprint,
    done: count('done') + count('consumed'),
    doing: count('doing') + count('review'),
    todo: count('todo') + count('backlog'),
    total: inSprint.length,
  }
}
