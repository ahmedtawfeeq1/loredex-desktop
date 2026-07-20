/**
 * Settings › MCP servers. Tools are shown EXPANDED BY DEFAULT (the explicit
 * ask), so load() probes every installed server up front. A not-installed
 * server is never probed — there is nothing to spawn.
 */
import { create } from 'zustand'
import type { CoreApi } from '../../../shared/ipc-contract'
import { invoke } from '../api'

type Row = CoreApi['workspace.mcp.list']['out'][number]
type Tools = CoreApi['workspace.mcp.tools']['out']
type Skills = CoreApi['workspace.skills.status']['out']
type N8n = CoreApi['workspace.n8n.get']['out']

interface State {
  rows: Row[]
  tools: Record<string, Tools | undefined>
  skills: Skills | null
  /** stored n8n config — presence of a key + the (non-secret) instance URL */
  n8n: N8n | null
  busy: boolean
  /** true briefly after a successful save — the UI had no confirmation at all */
  saved: boolean
  /** the real round-trip result: a saved key that 401s must not read as working */
  test: { ok: boolean; detail: string } | null
  testing: boolean
  /** the slow terminal check is in flight */
  verifying: boolean
  error: string | null
  load(): Promise<void>
  setEnabled(id: Row['id'], on: boolean): Promise<void>
  loadTools(id: Row['id']): Promise<void>
  install(): Promise<CoreApi['workspace.mcp.install']['out']>
  saveN8n(url: string | null, key: string | null): Promise<void>
  testN8n(): Promise<void>
  verifySkills(): Promise<void>
  verifyTerminal(): Promise<void>
}

export const useWorkspaceMcp = create<State>((set, get) => ({
  rows: [],
  tools: {},
  skills: null,
  n8n: null,
  busy: false,
  saved: false,
  test: null,
  testing: false,
  verifying: false,
  error: null,

  async load() {
    set({ busy: true, error: null })
    // rows FIRST and on their own: they are a pure in-memory read, so the page
    // must never wait on anything slower to show them. Coupling them to another
    // fetch via Promise.all made the whole section render empty for as long as
    // the slowest call took.
    try {
      const [rows, n8n] = await Promise.all([
        invoke('workspace.mcp.list', undefined),
        invoke('workspace.n8n.get', undefined),
      ])
      // both are in-memory reads — pairing them costs nothing and lets the form
      // show the instance URL that is actually stored
      set({ rows, n8n, busy: false })
      void Promise.all(rows.filter((r) => r.installed).map((r) => get().loadTools(r.id)))
    } catch (e) {
      // and a failure must SAY so rather than leaving an empty section that
      // looks like a UI that does nothing
      set({ busy: false, error: e instanceof Error ? e.message : String(e) })
    }
    try {
      set({ skills: await invoke('workspace.skills.status', undefined) })
    } catch {
      // the skills card is optional chrome — its absence is not a page failure
    }
  },

  async setEnabled(id, on) {
    await invoke('workspace.mcp.setEnabled', { id, on })
    await get().load()
  },

  async loadTools(id) {
    try {
      const tools = await invoke('workspace.mcp.tools', { id })
      set((s) => ({ tools: { ...s.tools, [id]: tools } }))
    } catch (e) {
      set((s) => ({
        tools: {
          ...s.tools,
          [id]: { ok: false, tools: [], detail: e instanceof Error ? e.message : String(e) },
        },
      }))
    }
  },

  async install() {
    set({ busy: true })
    const res = await invoke('workspace.mcp.install', { id: 'n8n' })
    set({ busy: false })
    await get().load()
    return res
  },

  async saveN8n(url, key) {
    set({ saved: false, error: null })
    try {
      await invoke('workspace.n8n.set', { url, key })
      set({ saved: true })
      await get().load()
      // saving is not the same as working — verify immediately rather than let a
      // wrong key surface later as an agent tool failure mid-conversation
      await get().testN8n()
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
    }
  },

  async testN8n() {
    set({ testing: true, test: null })
    try {
      set({ test: await invoke('workspace.n8n.test', undefined), testing: false })
    } catch (e) {
      set({ testing: false, test: { ok: false, detail: e instanceof Error ? e.message : String(e) } })
    }
  },

  /** The SLOW check (~12s: `claude mcp list` health-checks every configured MCP
   *  server). Only ever runs from the Verify button. */
  async verifyTerminal() {
    set({ verifying: true })
    try {
      const { installed } = await invoke('workspace.terminal.check', undefined)
      set((s) => ({
        verifying: false,
        skills: s.skills ? { ...s.skills, terminal: { ...s.skills.terminal, installed } } : s.skills,
      }))
    } catch {
      set({ verifying: false })
    }
  },

  async verifySkills() {
    const skills = await invoke('workspace.skills.status', undefined)
    set({ skills })
  },
}))
