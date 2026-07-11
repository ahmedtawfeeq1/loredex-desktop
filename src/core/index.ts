/**
 * Core host entry — forked from main via utilityProcess.fork.
 * Receives brokered MessagePortMain ends from main and serves the typed IPC
 * seam over them (dispatch + event fan-out in ./ipc).
 */
import { join } from 'node:path'
import type { CoreControlMessage, PortLike } from '../shared/ipc-contract'
import { loadContractGlobs, loadProjectRoots, resolveRoots, scanContracts } from './contracts'
import { getPollCursor, initAppDb, setPollCursor, vaultId } from './db/index'
import { reconcileSnoozeTimers, sweepExpiredSnoozes } from './db/snooze'
import { invalidateAtlas } from './atlas'
import { removeDiscovery } from './discovery'
import * as engine from './engine'
import { clearFacetCache } from './facets'
import { gitAsync, withGitIdentity } from './git'
import { initGhCapability } from './github'
import { registerCoreHandlers, runSuggestionScan } from './handlers'
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
import { startVaultWatcher } from './watcher'
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
// boot evidence for packaged/dev smokes (story 15.1) — app.db is the ABI canary
if (appDb && userDataDir) console.log(`[loredex-core] app.db open — ${join(userDataDir, 'app.db')}`)
initSettings(userDataDir)
const ipc = createCoreIpc()
// Display requests (native notifications, dock badge) go to main over the
// control channel — core decides, main displays (story 3.7).
const hooks: { onSyncRun?: () => void } = {}
const notifier = registerCoreHandlers(ipc, (msg) => process.parentPort.postMessage(msg), hooks)
// Startup check: seed the snapshot + set the badge before any user action.
notifier.refresh()
// gh capability probe (story 12.2 AC1): detected once at startup, cached in
// app-db meta (the meta cache answers until the probe lands); Settings
// re-checks via github.capability {refresh}. Absent gh = plain links, no PRs.
void initGhCapability(appDb)

// vault_id scopes every app-db row (story 9.2); null without a config or db.
const vid = config && appDb ? vaultId(config.vaultPath, engine.identity().remote) : null

/**
 * The F4 reconcile everyone shares (stories 9.1/9.3): caches invalidated,
 * badge + new-handoff check rerun, snooze_timers ← frontmatter. Callers decide
 * what vault.changed to emit (batch paths vs full refresh).
 */
function reconcileState(): void {
  invalidateLinkIndex()
  clearFacetCache()
  invalidateAtlas()
  const cards = notifier.refresh()
  if (appDb && vid) reconcileSnoozeTimers(appDb, vid, cards)
}

// Snooze expiry sweep (stories 9.2/9.3): once a minute, due un-notified timers
// emit snooze.expired ONCE per machine (toast + board resort renderer-side;
// status is never auto-written) and the badge recomputes (expired count open).
function sweepSnoozes(): void {
  if (!appDb || !vid) return
  try {
    reconcileSnoozeTimers(appDb, vid, engine.handoffs({ direction: 'all' }))
    const due = sweepExpiredSnoozes(appDb, vid, new Date().toISOString().slice(0, 10))
    for (const handoffId of due) ipc.emit({ kind: 'snooze.expired', handoffId })
    if (due.length > 0) notifier.refresh()
  } catch {
    // no config / unreadable vault — nothing to sweep
  }
}
if (appDb && vid) {
  sweepSnoozes()
  setInterval(sweepSnoozes, 60_000).unref?.()
}

// Contract intelligence post-integrate scan (story 11.1 AC5): after a pull
// lands, rescan the registered repos (incremental — only since the newest
// cached sha per file) and announce genuinely NEW rows as contract.changed.
// Read-only against the repos; fire-and-forget, never blocks the tick.
function scanContractsAfterIntegrate(): void {
  if (!appDb || !vid || !config) return
  const db = appDb
  const { roots } = resolveRoots({
    openVaultPath: config.vaultPath,
    fileConfig: engine.configFileProjects(),
    appRoots: loadProjectRoots(db, vid),
  })
  scanContracts({ db, roots, userGlobs: loadContractGlobs(db, vid), git: gitAsync })
    .then((fresh) => {
      for (const row of fresh) {
        ipc.emit({ kind: 'contract.changed', project: row.project, file: row.file, sha: row.sha })
      }
      // story 12.2 (AC3): poller-integrate scan feeds the suggest pipeline —
      // merged PR / mentioned commit ↔ open|accepted handoffs; SUGGESTS only
      runSuggestionScan((e) => ipc.emit(e), fresh)
    })
    .catch(() => {
      // a repo being mid-rewrite is not this app's problem — next scan catches up
    })
}

// Vault watcher (story 9.3): CLI/agent/local edits surface live. Debounced
// batches refresh the changed paths; storms (pull bursts) reconcile from disk
// instead of trusting per-file events (F4). Refresh buttons become fallbacks.
if (config) {
  const vaultPath = config.vaultPath
  void startVaultWatcher({
    vaultPath,
    sink: {
      onBatch: (paths) => {
        reconcileState()
        sweepSnoozes() // a local snooze edit may expire/arm a timer right now
        ipc.emit({ kind: 'vault.changed', paths })
      },
      onStorm: () => {
        reconcileState()
        ipc.emit({ kind: 'vault.changed', paths: [] }) // full refetch
      },
    },
    onError: (text) => ipc.emit({ kind: 'git.warning', text }),
  }).then(() => {
    // boot evidence for packaged/dev smokes (story 15.1)
    console.log(`[loredex-core] vault watcher armed — ${vaultPath}`)
  }).catch((e: unknown) => {
    // Watcher caveat: if FSEvents refuses to arm, local edits would otherwise
    // never surface (a purely-local vault has no poller to catch them). Fall
    // back to a slow safety-net reconcile so live refresh degrades to a poll,
    // not to nothing. Warn loudly so the failure isn't silent.
    ipc.emit({
      kind: 'git.warning',
      text: `vault watcher failed to start — live refresh degraded to a 15s poll (${
        e instanceof Error ? e.message : String(e)
      })`,
    })
    setInterval(() => {
      reconcileState()
      ipc.emit({ kind: 'vault.changed', paths: [] }) // unknown scope → full refetch
    }, 15_000).unref?.()
  })
}

// Remote-event poller (story 9.1): fetch → parse remote events → gated
// integrate, only for a vault with an origin remote (identity() reads
// .git/config). The db (cursor store) exists whenever main forked us with
// --user-data; a bare test host has neither, hence no poller.
let poller: Poller | null = null
if (config && appDb && vid) {
  const remoteUrl = engine.identity().remote
  if (remoteUrl) {
    const db = appDb
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
      // UNDER the lock, clean tree: lib pull+push, rebuilt indexes, then the
      // shared F4 reconcile (caches, badge, snooze mirror) + expiry sweep.
      pullAndReconcile: async () => {
        const profile = loadIdentityProfile()
        if (profile) withGitIdentity(profile, () => engine.pullPush())
        else engine.pullPush()
        engine.rebuildVaultIndexes()
        reconcileState()
        sweepSnoozes()
        scanContractsAfterIntegrate() // story 11.1 AC5 — async, off the tick path
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
