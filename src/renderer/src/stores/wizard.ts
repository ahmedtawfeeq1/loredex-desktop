/**
 * Wizard store (stories 13.1/13.2): create/join modal state, wizard.progress
 * step feed, failure mapping, and the success pivot (main persists the vault
 * and restarts the core host). One flow open at a time.
 */
import { create } from 'zustand'
import type { CoreEvent } from '../../../shared/ipc-contract'
import type { RemoteCheck, WizardFlow, WizardStepStatus } from '../../../shared/types'
import { invoke, pickWizardFolder, setVault } from '../api'
import { describeWizardFailure, type WizardFailure } from '../views/wizard/wizard-errors'

export interface WizardStepRow {
  step: string
  status: WizardStepStatus
  detail?: string
}

export type WizardPhase = 'form' | 'running' | 'failed' | 'done'

interface WizardState {
  flow: WizardFlow | null
  phase: WizardPhase
  // create form
  dir: string | null
  remoteUrl: string
  remoteCheck: RemoteCheck | null
  checkingRemote: boolean
  // progress + terminal state
  steps: WizardStepRow[]
  failure: WizardFailure | null
  result: { vaultPath: string } | null
  pivoting: boolean

  openCreate(): void
  close(): void
  setRemoteUrl(url: string): void
  pickDir(kind: WizardFlow): Promise<void>
  checkRemote(): Promise<void>
  runCreate(): Promise<void>
  backToForm(): void
  /** success pivot: persist + core restart; App's vault-changed listener re-inits */
  openVault(vaultPath: string): Promise<void>
  applyProgress(e: Extract<CoreEvent, { kind: 'wizard.progress' }>): void
}

const formReset = {
  phase: 'form' as const,
  steps: [] as WizardStepRow[],
  failure: null,
  result: null,
  pivoting: false,
}

export const useWizard = create<WizardState>((set, get) => ({
  flow: null,
  ...formReset,
  dir: null,
  remoteUrl: '',
  remoteCheck: null,
  checkingRemote: false,

  openCreate() {
    set({ flow: 'create', ...formReset, dir: null, remoteUrl: '', remoteCheck: null })
  },

  close() {
    // never close mid-run — the sequence holds the write lock; let it settle
    if (get().phase === 'running') return
    set({ flow: null, ...formReset })
  },

  setRemoteUrl(url) {
    set({ remoteUrl: url, remoteCheck: null })
  },

  async pickDir(kind) {
    const picked = await pickWizardFolder(kind)
    if (picked) set({ dir: picked })
  },

  async checkRemote() {
    const url = get().remoteUrl.trim()
    if (!url) return
    set({ checkingRemote: true, remoteCheck: null })
    try {
      const check = await invoke('wizard.validateRemote', { url })
      set({ remoteCheck: check, checkingRemote: false })
    } catch (e) {
      set({
        remoteCheck: {
          reachable: false,
          empty: false,
          defaultBranch: null,
          message: e instanceof Error ? e.message : String(e),
        },
        checkingRemote: false,
      })
    }
  },

  async runCreate() {
    const { dir, remoteUrl } = get()
    if (!dir) return
    set({ phase: 'running', steps: [], failure: null, result: null })
    try {
      const url = remoteUrl.trim()
      const result = await invoke('wizard.createVault', {
        dir,
        ...(url ? { remoteUrl: url } : {}),
      })
      set({ phase: 'done', result: { vaultPath: result.vaultPath } })
    } catch (e) {
      set({ phase: 'failed', failure: describeWizardFailure(e, 'create') })
    }
  },

  backToForm() {
    set({ phase: 'form', steps: [], failure: null })
  },

  async openVault(vaultPath) {
    set({ pivoting: true })
    await setVault(vaultPath) // resolves after the core host restarted on it
    set({ flow: null, ...formReset })
  },

  applyProgress(e) {
    set((s) => {
      const steps = [...s.steps]
      const at = steps.findIndex((row) => row.step === e.step)
      const row: WizardStepRow = {
        step: e.step,
        status: e.status,
        ...(e.detail !== undefined ? { detail: e.detail } : {}),
      }
      if (at === -1) steps.push(row)
      else steps[at] = row
      return { steps }
    })
  },
}))
