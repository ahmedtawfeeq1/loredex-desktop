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

interface State {
  rows: Row[]
  tools: Record<string, Tools | undefined>
  skills: Skills | null
  busy: boolean
  /** true briefly after a successful save — the UI had no confirmation at all */
  saved: boolean
  /** the slow terminal check is in flight */
  verifying: boolean
  error: string | null
  load(): Promise<void>
  setEnabled(id: Row['id'], on: boolean): Promise<void>
  loadTools(id: Row['id']): Promise<void>
  install(): Promise<CoreApi['workspace.mcp.install']['out']>
  saveN8n(url: string | null, key: string | null): Promise<void>
  verifySkills(): Promise<void>
  verifyTerminal(): Promise<void>
}

export const useWorkspaceMcp = create<State>((set, get) => ({
  rows: [],
  tools: {},
  skills: null,
  busy: false,
  saved: false,
  verifying: false,
  error: null,

  async load() {
    set({ busy: true, error: null })
    // rows FIRST and on their own: they are a pure in-memory read, so the page
    // must never wait on anything slower to show them. Coupling them to another
    // fetch via Promise.all made the whole section render empty for as long as
    // the slowest call took.
    try {
      const rows = await invoke('workspace.mcp.list', undefined)
      set({ rows, busy: false })
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
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) })
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
