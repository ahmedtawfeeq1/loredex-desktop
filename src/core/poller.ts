/**
 * Remote-event poller (story 9.1 / epic3.story5, finishing deferred 3.5) —
 * the app's most safety-critical component. The discipline, in order:
 *
 *   1. `git fetch` every 60 s focused / 5 min blurred — never pull in the
 *      tick path; fetch never touches the worktree, so it is always safe and
 *      runs OUTSIDE the write lock.
 *   2. Parse notification events from `<last_seen_sha>..origin/<branch>`
 *      WITHOUT merging (`git log --name-status` scoped to handoff notes +
 *      `git show` per touched file) → emit `handoff.new` /
 *      `handoff.stateChanged`. The sender-notification path never waits on a
 *      merge.
 *   3. Advance the app-db poll cursor only AFTER events are emitted
 *      (exactly-once); a fresh cursor seeds to origin/<branch> and emits
 *      nothing (no notification storm on join).
 *   4. Integrate (pull) gated on `tryAcquire` (user work always wins) AND a
 *      clean worktree; dirty/busy → defer to next tick. After every pull the
 *      caller-supplied reconcile runs (F4 rule).
 */
import { basename, join } from 'node:path'
import type { CoreEvent } from '../shared/ipc-contract'
import type { HandoffCard, Identity, SyncHealth } from '../shared/types'
import type { PollCursor } from './db/index'

export const FOCUSED_INTERVAL_MS = 60_000
export const BLURRED_INTERVAL_MS = 300_000

/** The poller only reacts to handoff notes (architecture-m2.md §4 scope). */
export const HANDOFF_FILE_RE = /^projects\/[^/]+\/handoffs\/[^/]+\.md$/

/**
 * Vault-relative handoff paths touched in a `git log --name-status --format=%H`
 * window. Rename lines (`R<score>\told\tnew`) contribute the new path; pure
 * deletions are skipped (nothing to read — `git show` would fail anyway).
 */
export function touchedHandoffPaths(nameStatusLog: string): string[] {
  const paths = new Set<string>()
  for (const line of nameStatusLog.split('\n')) {
    const cols = line.split('\t')
    if (cols.length < 2) continue // commit-hash and blank lines
    const change = (cols[0] as string).trim()
    if (change.startsWith('D')) continue
    const path = (cols[cols.length - 1] as string).trim()
    if (HANDOFF_FILE_RE.test(path)) paths.add(path)
  }
  return [...paths]
}

/** `Name <email>` attribution line → Identity; unparseable degrades honestly. */
export function parseAttribution(line: unknown): Identity {
  if (typeof line === 'string') {
    const match = /^(.*?)\s*<([^<>]+)>\s*$/.exec(line)
    if (match) return { name: (match[1] as string) || 'unknown', email: match[2] as string }
    if (line.trim()) return { name: line.trim(), email: 'unknown' }
  }
  return { name: 'unknown', email: 'unknown' }
}

const ATTRIBUTION_FIELD: Record<string, string> = {
  accepted: 'accepted_by',
  declined: 'declined_by',
  snoozed: 'snoozed_by',
  consumed: 'consumed_by',
}

/**
 * One remote handoff doc vs the local copy → the CoreEvent it means, or null
 * (not a handoff note / no visible change). Pure — the unit-test surface.
 */
export function deriveRemoteEvent(opts: {
  vaultPath: string
  relPath: string
  remoteMeta: Record<string, unknown>
  localMeta: Record<string, unknown> | null
  today?: string
}): CoreEvent | null {
  const { remoteMeta, localMeta } = opts
  // same guard as the lib's listHandoffs: no status/from_project = not a card
  // (comments and ordinary notes never notify)
  if (!remoteMeta.status || !remoteMeta.from_project) return null
  const id = basename(opts.relPath, '.md')
  const status = String(remoteMeta.status)

  if (localMeta === null) {
    const today = opts.today ?? new Date().toISOString().slice(0, 10)
    const date = typeof remoteMeta.date === 'string' ? remoteMeta.date : ''
    const snoozedUntil =
      typeof remoteMeta.snoozed_until === 'string' ? remoteMeta.snoozed_until : undefined
    const card: HandoffCard = {
      id,
      name: id,
      from: String(remoteMeta.from_project),
      to: String(remoteMeta.to_project ?? opts.relPath.split('/')[1] ?? ''),
      objective: String(remoteMeta.objective ?? ''),
      date,
      ageDays: date ? daysBetween(date, today) : 0,
      status,
      path: join(opts.vaultPath, opts.relPath),
      readingOrder: [], // remote-only card: the board refetches after integrate
      kind: String(remoteMeta.kind ?? 'delivery'),
      ...(typeof remoteMeta.replies_to === 'string' ? { repliesTo: remoteMeta.replies_to } : {}),
      ...(typeof remoteMeta.fulfills === 'string' ? { fulfills: remoteMeta.fulfills } : {}),
      ...(snoozedUntil !== undefined ? { snoozedUntil } : {}),
      expired: status === 'snoozed' && Boolean(snoozedUntil) && (snoozedUntil as string) < today,
    }
    return { kind: 'handoff.new', handoff: card }
  }

  const localStatus = String(localMeta.status ?? 'open')
  if (localStatus === status) return null
  const by = parseAttribution(remoteMeta[ATTRIBUTION_FIELD[status] ?? ''])
  return {
    kind: 'handoff.stateChanged',
    id,
    from: localStatus,
    to: status,
    by,
    ...(status === 'declined' && typeof remoteMeta.declined_reason === 'string'
      ? { reason: remoteMeta.declined_reason }
      : {}),
    ...(status === 'snoozed' && typeof remoteMeta.snoozed_until === 'string'
      ? { until: remoteMeta.snoozed_until }
      : {}),
  }
}

function daysBetween(from: string, to: string): number {
  const ms = new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()
  return Math.max(0, Math.round(ms / 86_400_000))
}

// ── the loop ─────────────────────────────────────────────────────────────────

export interface PollerDeps {
  vaultPath: string
  /** resolved once at wiring — the vault's first remote (normally 'origin') */
  remote: string
  emit(event: CoreEvent): void
  /** app-db poll_cursor row for this vault (story 9.2 table) */
  getCursor(): PollCursor | null
  setCursor(cursor: PollCursor): void
  /** async git runner, cwd = vaultPath (never blocks the host) */
  git(args: readonly string[]): Promise<string>
  /** parsed frontmatter of the LOCAL copy; null when absent/unreadable */
  readLocalMeta(relPath: string): Record<string, unknown> | null
  /** lib parseDoc via the engine facade (sole loredex import site) */
  parseRemoteMeta(raw: string): Record<string, unknown>
  /** the single-flight write lock's tryAcquire — user work always wins */
  tryLock(): (() => void) | null
  /** lib pull+push + full reconcile (F4) — invoked UNDER the lock, clean tree */
  pullAndReconcile(): Promise<void>
  /** read-only lib syncStatus for sync.changed payloads */
  syncHealth(): SyncHealth
  /** story 9.3 seam: notification routing sees the parsed remote events */
  onRemoteEvents?(events: CoreEvent[]): void
}

export interface Poller {
  /** immediate first tick, then the focus-driven interval */
  start(): void
  stop(): void
  setFocused(focused: boolean): void
  /** "Sync now" resets the clock (AC1) */
  resetTimer(): void
  /** one poll: fetch → parse → emit → advance cursor → gated integrate */
  tick(): Promise<void>
}

export function createPoller(deps: PollerDeps): Poller {
  let timer: ReturnType<typeof setTimeout> | null = null
  let running = false
  let focused = true
  let inFlight = false
  let lastWarning = ''

  function schedule(): void {
    if (timer) clearTimeout(timer)
    if (!running) return
    timer = setTimeout(() => {
      void tick().finally(schedule)
    }, focused ? FOCUSED_INTERVAL_MS : BLURRED_INTERVAL_MS)
    timer.unref?.()
  }

  async function tick(): Promise<void> {
    if (inFlight) return
    inFlight = true
    try {
      const ref = await fetchAndParse()
      await integrate(ref)
      lastWarning = ''
    } catch (e) {
      // F8: surface, never swallow — but a persistent outage warns once, not
      // once per tick (the message repeats only after a healthy poll)
      const text = `remote poll failed: ${e instanceof Error ? e.message : String(e)}`
      if (text !== lastWarning) deps.emit({ kind: 'git.warning', text })
      lastWarning = text
    } finally {
      inFlight = false
    }
  }

  /** fetch (outside the lock) + parse remote events + cursor discipline. */
  async function fetchAndParse(): Promise<string> {
    const branch =
      deps.getCursor()?.branch ?? (await deps.git(['rev-parse', '--abbrev-ref', 'HEAD'])).trim()
    await deps.git(['fetch', deps.remote, branch])
    const ref = `${deps.remote}/${branch}`
    const remoteSha = (await deps.git(['rev-parse', ref])).trim()
    const lastFetchAt = new Date().toISOString()
    const cursor = deps.getCursor()

    if (!cursor) {
      // fresh cursor (join flow): seed and emit NOTHING — no storm
      deps.setCursor({ branch, lastSeenSha: remoteSha, lastFetchAt })
      return ref
    }
    if (remoteSha === cursor.lastSeenSha) {
      deps.setCursor({ ...cursor, lastFetchAt })
      return ref
    }

    const log = await deps.git([
      'log',
      '--name-status',
      '--format=%H',
      `${cursor.lastSeenSha}..${ref}`,
      '--',
      'projects',
    ])
    const events: CoreEvent[] = []
    for (const relPath of touchedHandoffPaths(log)) {
      let raw: string
      try {
        raw = await deps.git(['show', `${ref}:${relPath}`])
      } catch {
        continue // gone at the remote tip (deleted/renamed since)
      }
      try {
        const event = deriveRemoteEvent({
          vaultPath: deps.vaultPath,
          relPath,
          remoteMeta: deps.parseRemoteMeta(raw),
          localMeta: deps.readLocalMeta(relPath),
        })
        if (event) events.push(event)
      } catch {
        continue // unparseable remote note — skip, never crash the loop
      }
    }
    for (const event of events) deps.emit(event)
    if (events.length > 0) deps.onRemoteEvents?.(events)
    // exactly-once discipline: the cursor advances only AFTER events emitted
    deps.setCursor({ branch, lastSeenSha: remoteSha, lastFetchAt })
    return ref
  }

  /** gated pull: lock free (tryAcquire — skip if busy) AND clean worktree. */
  async function integrate(ref: string): Promise<void> {
    const behind = Number((await deps.git(['rev-list', '--count', `HEAD..${ref}`])).trim())
    if (!Number.isFinite(behind) || behind === 0) return
    const release = deps.tryLock()
    let pulled = false
    if (release) {
      try {
        if ((await deps.git(['status', '--porcelain'])).trim() === '') {
          await deps.pullAndReconcile()
          pulled = true
        }
      } finally {
        release()
      }
    }
    if (pulled) deps.emit({ kind: 'vault.changed', paths: [] }) // full refetch (F4)
    // deferred → panel shows "behind N, integrating…"; pulled → fresh health
    deps.emit({ kind: 'sync.changed', health: deps.syncHealth() })
  }

  return {
    start() {
      if (running) return
      running = true
      void tick().finally(schedule)
    },
    stop() {
      running = false
      if (timer) clearTimeout(timer)
      timer = null
    },
    setFocused(next) {
      if (focused === next) return
      focused = next
      schedule() // swap the cadence now, not after the old timeout fires
    },
    resetTimer() {
      schedule()
    },
    tick,
  }
}
