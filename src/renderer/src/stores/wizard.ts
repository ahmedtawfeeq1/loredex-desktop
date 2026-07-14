/**
 * Wizard store (stories 13.1/13.2): create/join modal state, wizard.progress
 * step feed, failure mapping, and the success pivot (main persists the vault
 * and restarts the core host). One flow open at a time.
 */
import { create } from 'zustand'
import type { CoreEvent } from '../../../shared/ipc-contract'
import type { JoinLink } from '../../../shared/join-link'
import type { RemoteCheck, WizardFlow, WizardStepStatus } from '../../../shared/types'
import { invoke, pickProjectRoot, pickWizardFolder, setVault } from '../api'
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
  /** agent-ops dexes get the fixed client schema; research is today's default */
  dexType: 'research' | 'agent-ops'
  remoteCheck: RemoteCheck | null
  checkingRemote: boolean
  // join form (story 13.2)
  joinUrl: string
  joinBranch: string | null
  dest: string | null
  /** join result: false = SCHEMA_AHEAD, loud banner, read-mostly */
  schemaOk: boolean | null
  /** skippable post-join prompt: where this team's repos live on this machine */
  roots: string[]
  // progress + terminal state
  steps: WizardStepRow[]
  failure: WizardFailure | null
  result: { vaultPath: string } | null
  pivoting: boolean

  openCreate(): void
  openJoin(prefill?: JoinLink): void
  close(): void
  setRemoteUrl(url: string): void
  setJoinUrl(url: string): void
  pickDir(kind: WizardFlow): Promise<void>
  checkRemote(): Promise<void>
  runCreate(): Promise<void>
  runJoin(): Promise<void>
  addRoot(): Promise<void>
  removeRoot(path: string): void
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
  dexType: 'research',
  remoteCheck: null,
  checkingRemote: false,
  joinUrl: '',
  joinBranch: null,
  dest: null,
  schemaOk: null,
  roots: [],

  openCreate() {
    set({ flow: 'create', ...formReset, dir: null, remoteUrl: '', dexType: 'research', remoteCheck: null })
  },

  openJoin(prefill) {
    set({
      flow: 'join',
      ...formReset,
      joinUrl: prefill?.remote ?? '',
      joinBranch: prefill?.branch ?? null,
      dest: null,
      schemaOk: null,
      roots: [],
    })
  },

  close() {
    // never close mid-run — the sequence holds the write lock; let it settle
    if (get().phase === 'running') return
    set({ flow: null, ...formReset })
  },

  setRemoteUrl(url) {
    set({ remoteUrl: url, remoteCheck: null })
  },

  setJoinUrl(url) {
    set({ joinUrl: url })
  },

  async pickDir(kind) {
    const picked = await pickWizardFolder(kind)
    if (picked) set(kind === 'create' ? { dir: picked } : { dest: picked })
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
    const { dir, remoteUrl, dexType } = get()
    if (!dir) return
    set({ phase: 'running', steps: [], failure: null, result: null })
    try {
      const url = remoteUrl.trim()
      const result = await invoke('wizard.createVault', {
        dir,
        ...(url ? { remoteUrl: url } : {}),
        ...(dexType !== 'research' ? { dexType } : {}),
      })
      set({ phase: 'done', result: { vaultPath: result.vaultPath } })
    } catch (e) {
      set({ phase: 'failed', failure: describeWizardFailure(e, 'create') })
    }
  },

  async runJoin() {
    const { joinUrl, joinBranch, dest } = get()
    const url = joinUrl.trim()
    if (!url || !dest) return
    set({ phase: 'running', steps: [], failure: null, result: null, schemaOk: null })
    try {
      const result = await invoke('wizard.joinVault', {
        url,
        dest,
        ...(joinBranch ? { branch: joinBranch } : {}),
      })
      set({ phase: 'done', result: { vaultPath: result.vaultPath }, schemaOk: result.schemaOk })
    } catch (e) {
      set({ phase: 'failed', failure: describeWizardFailure(e, 'join') })
    }
  },

  async addRoot() {
    const picked = await pickProjectRoot()
    if (picked) set((s) => ({ roots: s.roots.includes(picked) ? s.roots : [...s.roots, picked] }))
  },

  removeRoot(path) {
    set((s) => ({ roots: s.roots.filter((p) => p !== path) }))
  },

  backToForm() {
    set({ phase: 'form', steps: [], failure: null })
  },

  async openVault(vaultPath) {
    set({ pivoting: true })
    const roots = get().roots
    await setVault(vaultPath) // resolves after the core host restarted on it
    // join wizard's skippable project-roots seed (m2 §7.5) — lands in the NEW
    // vault's app-db scope, so it runs after the pivot; feeds contract discovery
    if (roots.length > 0) {
      const map = Object.fromEntries(
        roots.map((p) => [p, { name: p.split('/').filter(Boolean).pop() ?? p }]),
      )
      await invoke('settings.projectRoots.set', { roots: map }).catch(() => {
        // seeding is a convenience — Settings offers the same map any time
      })
    }
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
