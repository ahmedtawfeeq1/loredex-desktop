/**
 * Route-a-note store (story 7.4): picker/drop → read-only plan preview →
 * confirm card → lib routeFile. Nothing routes silently: every path goes
 * through the confirm card, every write ends in a receipt toast.
 */
import { create } from 'zustand'
import { isErrEnvelope } from '../../../shared/ipc-contract'
import { toVaultRelative } from '../../../shared/handoff-lanes'
import type { RoutePreview } from '../../../shared/types'
import { invoke, pickRouteFile } from '../api'
import { useApp } from './app'
import { useToasts } from './toasts'

export type RouteMode = 'move' | 'copy'

interface RouteState {
  /** non-null = the confirm card is open on this plan */
  preview: RoutePreview | null
  file: string | null
  mode: RouteMode
  /** user-forced owning project (required when the plan is ambiguous) */
  projectName: string
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

const errText = (e: unknown): string => (isErrEnvelope(e) ? e.message : String(e))

export const useRoute = create<RouteState>((set, get) => ({
  preview: null,
  file: null,
  mode: 'copy',
  projectName: '',
  busy: false,
  error: null,

  async start() {
    const picked = await pickRouteFile()
    if (picked) await get().startWithFile(picked)
  },

  async startWithFile(path) {
    set({ file: path, mode: 'copy', projectName: '', error: null, busy: false })
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
      const { written } = await invoke('route.file', {
        path: file,
        mode,
        ...(projectName ? { projectName } : {}),
      })
      const vaultPath = useApp.getState().identity?.vaultPath ?? ''
      useToasts
        .getState()
        .push(
          mode === 'move' ? 'Note routed into the vault' : 'Note copied into the vault',
          written.map((w) => toVaultRelative(w, vaultPath)).join(', '),
        )
      set({ preview: null, file: null, projectName: '', busy: false })
    } catch (e) {
      set({ error: errText(e), busy: false }) // AC5: actionable, never silent
    }
  },

  cancel() {
    set({ preview: null, file: null, projectName: '', error: null, busy: false })
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
    useRoute.setState({ preview })
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
