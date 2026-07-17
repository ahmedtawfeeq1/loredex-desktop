/**
 * Sync health store (story 5.2): lib SyncHealth + handshake + MCP host state,
 * a rolling git.warning log (F8 firehose — in-memory; app.db persistence is
 * story 3.6), and the Sync Now action. The vault chip's sync dot reads this.
 */
import { create } from 'zustand'
import { isErrEnvelope } from '../../../shared/ipc-contract'
import type { HandshakeStatus, McpStatus, SyncHealth, SyncReport } from '../../../shared/types'
import { invoke, onEvent } from '../api'

export interface WarningEntry {
  at: string
  text: string
}

export const WARNING_LOG_MAX = 50

/** Ring buffer, newest first; consecutive duplicates collapse (poll noise). */
export function pushWarning(
  log: WarningEntry[],
  entry: WarningEntry,
  max: number = WARNING_LOG_MAX,
): WarningEntry[] {
  if (log[0]?.text === entry.text) return log
  return [entry, ...log].slice(0, max)
}

/** Entries older than the last CLEAN sync are history, not health — a fully
 *  green tick expires everything logged before it (warnings that raced in
 *  after the clean moment stay). */
export function expireBefore(log: WarningEntry[], cleanAt: string): WarningEntry[] {
  return log.filter((w) => w.at > cleanAt)
}

/** DESIGN.md sync dot semantics: ink = clean, amber = ahead/behind, rust = error. */
export function dotTone(health: SyncHealth | null): 'ink' | 'amber' | 'rust' {
  if (!health) return 'ink'
  if (health.state === 'error' || !health.remoteReachable) return 'rust'
  if (health.state === 'ok') return 'ink'
  return 'amber'
}

interface SyncState {
  health: SyncHealth | null
  handshake: HandshakeStatus | null
  mcp: McpStatus | null
  report: SyncReport | null
  warnings: WarningEntry[]
  syncing: boolean
  error: string | null
  load(): Promise<void>
  syncNow(): Promise<void>
  reset(): void
}

export const useSync = create<SyncState>((set, get) => ({
  health: null,
  handshake: null,
  mcp: null,
  report: null,
  warnings: [],
  syncing: false,
  error: null,

  async load() {
    try {
      // health first (fast fail); handshake walks the vault; mcp is instant
      const health = await invoke('sync.status', undefined)
      set({ health, error: null })
      const [handshake, mcp] = await Promise.all([
        invoke('sync.handshake', undefined),
        invoke('mcp.status', undefined),
      ])
      set({ handshake, mcp })
    } catch (e) {
      set({ error: isErrEnvelope(e) ? `${e.code}: ${e.message}` : String(e) })
    }
  },

  async syncNow() {
    if (get().syncing) return
    set({ syncing: true, report: null })
    try {
      const report = await invoke('sync.run', undefined)
      set({ report, syncing: false, error: null })
      // sync.changed already updated health; re-pull anyway in case events raced
      set({ health: await invoke('sync.status', undefined) })
    } catch (e) {
      set({
        syncing: false,
        error: isErrEnvelope(e) ? `${e.code}: ${e.message}` : String(e),
      })
    }
  },

  reset() {
    set({
      health: null,
      handshake: null,
      mcp: null,
      report: null,
      warnings: [],
      syncing: false,
      error: null,
    })
  },
}))

// The warning firehose + pushed health updates live for the app's lifetime.
// (bridge guard: pure helpers above stay importable from node unit tests)
if (typeof window !== 'undefined' && window.loredex) {
  onEvent((e) => {
    if (e.kind === 'git.warning') {
      useSync.setState((s) => ({
        warnings: pushWarning(s.warnings, { at: new Date().toISOString(), text: e.text }),
      }))
    } else if (e.kind === 'sync.changed') {
      // a fully clean tick (ok + reachable) retires the warning history —
      // the log shows only what happened since the last good sync
      useSync.setState((s) => ({
        health: e.health,
        warnings:
          dotTone(e.health) === 'ink'
            ? expireBefore(s.warnings, new Date().toISOString())
            : s.warnings,
      }))
    }
  })
}
