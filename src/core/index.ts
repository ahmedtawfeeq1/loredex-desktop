/**
 * Core host entry — forked from main via utilityProcess.fork.
 * Receives brokered MessagePortMain ends from main and serves the typed IPC
 * seam over them (dispatch + event fan-out in ./ipc).
 */
import { join } from 'node:path'
import type { CoreControlMessage, PortLike } from '../shared/ipc-contract'
import { getPollCursor, initAppDb, setPollCursor, vaultId } from './db/index'
import { reconcileSnoozeTimers } from './db/snooze'
import { removeDiscovery } from './discovery'
import * as engine from './engine'
import { clearFacetCache } from './facets'
import { gitAsync, withGitIdentity } from './git'
import { registerCoreHandlers } from './handlers'
import { createCoreIpc } from './ipc'
import { invalidateLinkIndex } from './links'
import { bootMcpServer, PREFERRED_MCP_PORT } from './mcp-server'
import { createPoller, type Poller } from './poller'
import {
  initSettings,
  loadIdentityProfile,
  loadMcpPortOverride,
  loadOrCreateMcpToken,
} from './settings'
import { writeLock } from './write-lock'

// Config resolves exactly once, BEFORE any handler is registered (F6).
// Main passes the picked vault (persisted userData JSON) as `--vault <path>`;
// the override wins over any loredex config file (story 1.4).
const vaultFlag = process.argv.indexOf('--vault')
const vaultOverride = vaultFlag !== -1 ? process.argv[vaultFlag + 1] : undefined
const config = engine.initEngine(vaultOverride)
// app.db opens FIRST (story 9.2 — the core host is the sole opener); settings
// then live in its meta table, importing the v0.1 settings.json shim once.
const userDataFlag = process.argv.indexOf('--user-data')
const userDataDir = userDataFlag !== -1 ? process.argv[userDataFlag + 1] : undefined
const appDb = initAppDb(userDataDir)
initSettings(userDataDir)
const ipc = createCoreIpc()
// Display requests (native notifications, dock badge) go to main over the
// control channel — core decides, main displays (story 3.7).
const hooks: { onSyncRun?: () => void } = {}
const notifier = registerCoreHandlers(ipc, (msg) => process.parentPort.postMessage(msg), hooks)
// Startup check: seed the snapshot + set the badge before any user action.
notifier.refresh()

// Remote-event poller (story 9.1): fetch → parse remote events → gated
// integrate, only for a vault with an origin remote (identity() reads
// .git/config). The db (cursor store) exists whenever main forked us with
// --user-data; a bare test host has neither, hence no poller.
let poller: Poller | null = null
if (config && appDb) {
  const remoteUrl = engine.identity().remote
  if (remoteUrl) {
    const db = appDb
    const vid = vaultId(config.vaultPath, remoteUrl)
    const vaultPath = config.vaultPath
    poller = createPoller({
      vaultPath,
      remote: 'origin', // identity().remote is read from [remote "origin"]
      emit: (event) => ipc.emit(event),
      getCursor: () => getPollCursor(db, vid),
      setCursor: (cursor) => setPollCursor(db, vid, cursor),
      git: (args) => gitAsync(vaultPath, args),
      readLocalMeta: (relPath) => {
        try {
          return engine.noteMeta(join(vaultPath, relPath))
        } catch {
          return null // not on disk yet (remote-only) or unreadable
        }
      },
      parseRemoteMeta: (raw) => engine.parseMarkdown(raw).meta as Record<string, unknown>,
      tryLock: () => writeLock.tryAcquire(),
      // UNDER the lock, clean tree: lib pull+push, then the F4 full reconcile —
      // rebuilt indexes, invalidated caches, badge/notification check, and
      // snooze_timers ← frontmatter (story 9.2 mirror).
      pullAndReconcile: async () => {
        const profile = loadIdentityProfile()
        if (profile) withGitIdentity(profile, () => engine.pullPush())
        else engine.pullPush()
        engine.rebuildVaultIndexes()
        invalidateLinkIndex()
        clearFacetCache()
        reconcileSnoozeTimers(db, vid, notifier.refresh())
      },
      syncHealth: () => engine.syncHealth(),
    })
    poller.start()
    hooks.onSyncRun = () => poller?.resetTimer()
  }
}

// In-app MCP server (story 1.6): shares the once-resolved config — the F6 fix
// by construction. No config yet (picker pending) → no server; picking a vault
// restarts this host, which boots it then.
if (config) {
  const portOverride = loadMcpPortOverride()
  void bootMcpServer({
    port: portOverride ?? PREFERRED_MCP_PORT,
    portOverride,
    token: loadOrCreateMcpToken(),
    onWarning: (text) => ipc.emit({ kind: 'git.warning', text }),
  })
}
// Clean shutdown removes the discovery file (main kills this host on quit —
// SIGTERM on posix; 'exit' also covers engine crashes after a clean boot).
process.on('exit', () => removeDiscovery())
process.on('SIGTERM', () => process.exit(0))
process.on('SIGINT', () => process.exit(0))

function mainPortAdapter(port: Electron.MessagePortMain): PortLike {
  return {
    postMessage: (data) => port.postMessage(data),
    onMessage: (cb) => port.on('message', (e) => cb(e.data)),
    start: () => port.start(),
  }
}

type PortEvent = { data: unknown; ports: Electron.MessagePortMain[] }

process.parentPort.on('message', (e: PortEvent) => {
  const msg = e.data as CoreControlMessage | null
  // story 9.1: main forwards window focus/blur — the poller swaps its cadence
  if (msg?.t === 'focus') {
    poller?.setFocused(msg.focused)
    return
  }
  if (msg?.t !== 'port' || !e.ports[0]) return
  ipc.attach(mainPortAdapter(e.ports[0]))
})

console.log(
  `[loredex-core] core host started — config: ${config ? config.vaultPath : 'none (vault picker pending)'}`,
)

export { ipc }
