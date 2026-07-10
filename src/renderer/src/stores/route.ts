/**
 * Route-a-note store (story 7.4): picker/drop → read-only plan preview →
 * confirm card → lib routeFile. Nothing routes silently: every path goes
 * through the confirm card, every write ends in a receipt toast.
 */
import { create } from 'zustand'
import { isErrEnvelope } from '../../../shared/ipc-contract'
import { toVaultRelative } from '../../../shared/handoff-lanes'
import type { RoutePreview, RouteReceipt } from '../../../shared/types'
import { invoke, pickRouteFile } from '../api'
import { useApp } from './app'
import { useToasts } from './toasts'

export type RouteMode = 'move' | 'copy'

/** A prior route of the same source body — the confirm card's dedupe warning. */
export interface DuplicateHit {
  receiptId: string
  appliedAt: string
}

interface RouteState {
  /** non-null = the confirm card is open on this plan */
  preview: RoutePreview | null
  file: string | null
  mode: RouteMode
  /** user-forced owning project (required when the plan is ambiguous) */
  projectName: string
  /** a prior receipt with the same content hash — warn before creating a duplicate */
  duplicate: DuplicateHit | null
  busy: boolean
  error: string | null
  /** open the native picker, then the confirm card (sidebar/⌘K entry) */
  start(): Promise<void>
  /** confirm card for an explicitly dropped file (Reader drop target) */
  startWithFile(path: string): Promise<void>
  setMode(mode: RouteMode): Promise<void>
  setProjectName(name: string): Promise<void>
  confirm(): Promise<void>
  cancel(): void
}

/** AC3 gate: the primary stays disabled while the owning project is unknown. */
export function needsProject(preview: RoutePreview | null): boolean {
  return preview !== null && !preview.project
}

/**
 * The most recent non-undone receipt whose routed body hash matches `hash`
 * (epic4.story2 dedupe). `hash` is the preview's stamped `source_hash` (copy
 * routes only). Null when nothing matches or the source was never hashed.
 */
export function findDuplicateReceipt(
  history: RouteReceipt[],
  hash: unknown,
): DuplicateHit | null {
  if (typeof hash !== 'string' || !hash) return null
  const match = history.find((r) => !r.undone && r.contentHash === hash)
  return match ? { receiptId: match.id, appliedAt: match.appliedAt } : null
}

const errText = (e: unknown): string => (isErrEnvelope(e) ? e.message : String(e))

export const useRoute = create<RouteState>((set, get) => ({
  preview: null,
  file: null,
  mode: 'copy',
  projectName: '',
  duplicate: null,
  busy: false,
  error: null,

  async start() {
    const picked = await pickRouteFile()
    if (picked) await get().startWithFile(picked)
  },

  async startWithFile(path) {
    set({ file: path, mode: 'copy', projectName: '', duplicate: null, error: null, busy: false })
    await refreshPreview(path)
  },

  async setMode(mode) {
    set({ mode })
    const file = get().file
    if (file) await refreshPreview(file)
  },

  async setProjectName(name) {
    set({ projectName: name })
    const file = get().file
    if (file) await refreshPreview(file)
  },

  async confirm() {
    const { file, mode, projectName, preview, busy } = get()
    if (!file || !preview || busy || needsProject(preview)) return
    set({ busy: true, error: null })
    try {
      const { written, receiptId } = await invoke('route.file', {
        path: file,
        mode,
        ...(projectName ? { projectName } : {}),
      })
      const vaultPath = useApp.getState().identity?.vaultPath ?? ''
      // epic4.story2: the receipt toast carries one-click Undo (lib PR-3 route.undo)
      useToasts
        .getState()
        .push(
          mode === 'move' ? 'Note routed into the vault' : 'Note copied into the vault',
          written.map((w) => toVaultRelative(w, vaultPath)).join(', '),
          receiptId
            ? {
                label: 'Undo',
                run: async () => {
                  try {
                    await invoke('route.undo', { receiptId })
                    useToasts.getState().push('Route undone', 'the vault copy was removed')
                  } catch (e) {
                    useToasts.getState().push('Could not undo', errText(e))
                  }
                },
              }
            : undefined,
        )
      set({ preview: null, file: null, projectName: '', duplicate: null, busy: false })
    } catch (e) {
      set({ error: errText(e), busy: false }) // AC5: actionable, never silent
    }
  },

  cancel() {
    set({ preview: null, file: null, projectName: '', duplicate: null, error: null, busy: false })
  },
}))

async function refreshPreview(file: string): Promise<void> {
  const { mode, projectName } = useRoute.getState()
  try {
    const preview = await invoke('route.preview', {
      file,
      mode,
      ...(projectName ? { projectName } : {}),
    })
    // epic4.story2 dedupe: a prior route of this exact body → warn in the card
    let duplicate: DuplicateHit | null = null
    try {
      const history = await invoke('route.history', {})
      duplicate = findDuplicateReceipt(history, preview.meta.source_hash)
    } catch {
      // history is advisory — a failed read never blocks the route
    }
    useRoute.setState({ preview, duplicate })
  } catch (e) {
    // a failed plan with no card open yet surfaces as a toast (drop of a bad file)
    if (useRoute.getState().preview === null) {
      useToasts.getState().push('Cannot route this file', errText(e))
      useRoute.setState({ file: null })
    } else {
      useRoute.setState({ error: errText(e) })
    }
  }
}
