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
  load(): Promise<void>
  setEnabled(id: Row['id'], on: boolean): Promise<void>
  loadTools(id: Row['id']): Promise<void>
  install(): Promise<CoreApi['workspace.mcp.install']['out']>
  saveN8n(url: string | null, key: string | null): Promise<void>
  verifySkills(): Promise<void>
}

export const useWorkspaceMcp = create<State>((set, get) => ({
  rows: [],
  tools: {},
  skills: null,
  busy: false,

  async load() {
    set({ busy: true })
    try {
      const [rows, skills] = await Promise.all([
        invoke('workspace.mcp.list', undefined),
        invoke('workspace.skills.status', undefined),
      ])
      set({ rows, skills, busy: false })
      await Promise.all(rows.filter((r) => r.installed).map((r) => get().loadTools(r.id)))
    } catch {
      set({ busy: false }) // a settings page must never hard-fail on a probe
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
    await invoke('workspace.n8n.set', { url, key })
    await get().load()
  },

  async verifySkills() {
    const skills = await invoke('workspace.skills.status', undefined)
    set({ skills })
  },
}))
