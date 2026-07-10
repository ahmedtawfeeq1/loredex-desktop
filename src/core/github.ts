/**
 * GitHub layer (architecture-m2.md §6).
 *
 * Story 12.1: derive each repo's web base from its REAL origin remote —
 * `git remote get-url origin` — normalized by the one shared rule
 * (shared/github.ts), cached per repo per session.
 *
 * Story 12.2: gh-powered PR status + the merged→suggest pipeline. The gh CLI
 * is the ONLY network path (no REST, no tokens, no OAuth); capability is
 * feature-detected once at core-host startup, cached in app-db `meta`, and
 * re-checked on settings change. Without gh everything degrades to plain
 * commit links. THE categorical rule: this module SUGGESTS status changes
 * (suggest.statusChange events) and owns ZERO write paths — Apply is an
 * ordinary user-invoked writer channel; it never imports the engine.
 */
import { execFile, execFileSync } from 'node:child_process'
import { promisify } from 'node:util'
import { githubRepoSlug, githubWebBase } from '../shared/github'
import type { CoreEvent } from '../shared/ipc-contract'
import type { ContractLink, HandoffCard, PrInfo } from '../shared/types'
import { mentionedOnly, type MentionedLink } from './contracts'
import { type AppDb, metaGet, metaSet } from './db/index'

/** sync git runner seam (tests stub it; prod shells out, 10 s guard). */
export type GitRunner = (cwd: string, args: readonly string[]) => string

const defaultRunner: GitRunner = (cwd, args) =>
  execFileSync('git', [...args], { cwd, encoding: 'utf8', timeout: 10_000 })

/** repoRoot → origin url (null = no remote / not a repo), one query per session. */
const remoteCache = new Map<string, string | null>()

/** A repo's origin remote url, cached per repo per session. Failures (no
 *  origin, not a git repo) cache as null — honest plain chips, no retry storm. */
export function originRemote(repoRoot: string, run: GitRunner = defaultRunner): string | null {
  const cached = remoteCache.get(repoRoot)
  if (cached !== undefined) return cached
  let remote: string | null
  try {
    remote = run(repoRoot, ['remote', 'get-url', 'origin']).trim() || null
  } catch {
    remote = null
  }
  remoteCache.set(repoRoot, remote)
  return remote
}

/** THE per-repo commit-link base: real origin remote → normalized GitHub web
 *  base; null = non-GitHub / no remote (chips render plain, never broken). */
export function remoteWebBase(repoRoot: string, run?: GitRunner): string | null {
  return githubWebBase(originRemote(repoRoot, run))
}

// ── gh capability (story 12.2 AC1: detect once, cache in meta, degrade) ─────

/** async exec seam: resolves stdout, rejects on nonzero exit / timeout. */
export type ExecRunner = (
  cmd: string,
  args: readonly string[],
  opts: { timeoutMs: number; cwd?: string },
) => Promise<string>

const execFileAsync = promisify(execFile)

const defaultExec: ExecRunner = async (cmd, args, opts) => {
  const { stdout } = await execFileAsync(cmd, [...args], {
    encoding: 'utf8',
    timeout: opts.timeoutMs,
    maxBuffer: 4 * 1024 * 1024,
    ...(opts.cwd ? { cwd: opts.cwd } : {}),
  })
  return stdout
}

/** The decided lookup timeout (m2 §6 verbatim). */
export const GH_TIMEOUT_MS = 5_000

export const GH_CAPABILITY_META_KEY = 'gh_capability'

/** gh usable = `gh --version` && `gh auth status` both exit 0. No REST
 *  fallback, no tokens, no OAuth — absent/unauthenticated gh means plain
 *  commit links and an honest Settings hint. */
export async function detectGh(exec: ExecRunner = defaultExec): Promise<boolean> {
  try {
    await exec('gh', ['--version'], { timeoutMs: GH_TIMEOUT_MS })
    await exec('gh', ['auth', 'status'], { timeoutMs: GH_TIMEOUT_MS })
    return true
  } catch {
    return false
  }
}

/** this-session detection result; null = probe not finished yet */
let ghCapable: boolean | null = null

/** Detect + cache (module + app-db meta). Called once at core-host startup
 *  and again on the Settings re-check (github.capability refresh). */
export async function initGhCapability(
  db: AppDb | null,
  exec: ExecRunner = defaultExec,
): Promise<boolean> {
  const gh = await detectGh(exec)
  ghCapable = gh
  if (db) metaSet(db, GH_CAPABILITY_META_KEY, gh ? 'true' : 'false')
  return gh
}

/** Current capability: this session's probe when it has landed, else the
 *  app-db meta cache from a prior run, else false (degrade, never guess). */
export function ghCapability(db: AppDb | null): boolean {
  if (ghCapable !== null) return ghCapable
  return db ? metaGet(db, GH_CAPABILITY_META_KEY) === 'true' : false
}

// ── PR lookup (story 12.2 AC2: command shape + timeout + cache, verbatim) ───

/** `gh pr list` args, m2 §6 verbatim. */
export function prListArgs(slug: string, sha: string): string[] {
  // prettier-ignore
  return [
    'pr', 'list',
    '--repo', slug,
    '--search', sha,
    '--state', 'all',
    '--json', 'number,title,state,mergedAt,url',
  ]
}

/** gh JSON → the PR to show: a merged PR wins (the suggestion tier), else the
 *  first row. Malformed output / no rows → null (plain link, never an error). */
export function parsePrList(raw: string): PrInfo | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!Array.isArray(parsed)) return null
  const prs: PrInfo[] = []
  for (const row of parsed) {
    const r = row as Record<string, unknown>
    if (
      typeof r?.url === 'string' &&
      typeof r.number === 'number' &&
      typeof r.title === 'string' &&
      (r.state === 'OPEN' || r.state === 'CLOSED' || r.state === 'MERGED')
    ) {
      prs.push({
        url: r.url,
        number: r.number,
        title: r.title,
        state: r.state,
        mergedAt: typeof r.mergedAt === 'string' ? r.mergedAt : null,
      })
    }
  }
  return prs.find((p) => p.state === 'MERGED') ?? prs[0] ?? null
}

/** per-sha session cache, keyed repoRoot:sha (timeouts cache as null too —
 *  a slow gh must not stall every render until it recovers) */
const prCache = new Map<string, PrInfo | null>()

export interface PrLookupDeps {
  db: AppDb | null
  exec?: ExecRunner
  /** story 12.1 git runner seam (slug derivation) */
  run?: GitRunner
}

/** The github.prForCommit channel body: capability-gated, slug from the repo's
 *  real origin, 5 s timeout, per-sha session cache. Every failure path is
 *  null — the chip renders a plain commit link, never an error. */
export async function prForCommit(
  repoRoot: string,
  sha: string,
  deps: PrLookupDeps,
): Promise<PrInfo | null> {
  const key = `${repoRoot}:${sha}`
  const cached = prCache.get(key)
  if (cached !== undefined) return cached
  let result: PrInfo | null = null
  if (ghCapability(deps.db)) {
    const slug = githubRepoSlug(originRemote(repoRoot, deps.run))
    if (slug) {
      try {
        result = parsePrList(
          await (deps.exec ?? defaultExec)('gh', prListArgs(slug, sha), {
            timeoutMs: GH_TIMEOUT_MS,
            cwd: repoRoot,
          }),
        )
      } catch {
        result = null // gh error / timeout — degrade to the plain link
      }
    }
  }
  prCache.set(key, result)
  return result
}

// ── merged→suggest pipeline (story 12.2 AC3/AC4 — SUGGESTS, never writes) ───

export interface SuggestionEvent {
  handoffId: string
  suggested: 'consumed' | 'accepted'
  evidence: { sha: string; prUrl?: string }
}

/** app_settings key for a persisted dismissal (m2 §6 verbatim). */
export function dismissKey(handoffId: string, sha: string): string {
  return `dismissed:${handoffId}:${sha}`
}

/**
 * The pure trigger matrix (AC5 test surface). Inputs are read-only views and
 * the return value is data — this function (and this module) owns zero write
 * paths; applying a suggestion is the user's click on an ordinary writer
 * channel.
 *
 * Rules, decided:
 * - only `mentioned`-tier links enter (MentionedLink — heuristic cannot pass
 *   the type, story 11.3 guardrail);
 * - handoff must be `open` or `accepted` (nothing else has a next step here);
 * - ownership: the handoff's TO project is one of my registered projects —
 *   accept/consume are recipient transitions. No registered projects (picker
 *   vault) = every project is mine, same rule as the notifier (story 3.7);
 * - merged PR → suggest `consumed` (the work landed; open→consumed stays the
 *   legal CLI skip-accept path). Mentioned commit without a merged PR →
 *   suggest `accepted`, and only for an `open` handoff;
 * - dismissed (persisted) and already-suggested (session) never re-fire.
 */
export function evaluateSuggestions(opts: {
  changes: ReadonlyArray<{ sha: string; links: readonly MentionedLink[]; pr: PrInfo | null }>
  cards: readonly HandoffCard[]
  myProjects: readonly string[]
  isDismissed(handoffId: string, sha: string): boolean
  alreadySuggested(handoffId: string, sha: string): boolean
}): SuggestionEvent[] {
  const byId = new Map(opts.cards.map((c) => [c.id, c]))
  const events: SuggestionEvent[] = []
  const seen = new Set<string>()
  for (const change of opts.changes) {
    const merged = change.pr?.state === 'MERGED'
    for (const link of change.links) {
      const card = byId.get(link.handoffId)
      if (!card) continue
      if (card.status !== 'open' && card.status !== 'accepted') continue
      if (opts.myProjects.length > 0 && !opts.myProjects.includes(card.to)) continue
      const suggested = merged ? 'consumed' : card.status === 'open' ? 'accepted' : null
      if (!suggested) continue
      const key = `${link.handoffId}:${change.sha}`
      if (seen.has(key)) continue
      if (opts.isDismissed(link.handoffId, change.sha)) continue
      if (opts.alreadySuggested(link.handoffId, change.sha)) continue
      seen.add(key)
      events.push({
        handoffId: link.handoffId,
        suggested,
        evidence: { sha: change.sha, ...(change.pr ? { prUrl: change.pr.url } : {}) },
      })
    }
  }
  return events
}

/** session dedupe: a suggestion fires once per host lifetime unless dismissed
 *  (persisted dismissals outlive the session) */
const suggestedKeys = new Set<string>()

export interface SuggestPipelineDeps {
  emit(event: CoreEvent): void
  /** lib board cards (read-only) */
  cards(): HandoffCard[]
  /** registered project names ("my projects", story 3.7 rule) */
  myProjects(): string[]
  /** story 11.3 computeLinks output for a fresh change sha — the pipeline
   *  applies the mentionedOnly guard itself (heuristic cannot enter) */
  linksFor(sha: string): ContractLink[]
  /** persisted dismissal check (app_settings) */
  isDismissed(handoffId: string, sha: string): boolean
  /** gh lookup — the production prForCommit with its caches; tests stub it */
  prFor(repoRoot: string, sha: string): Promise<PrInfo | null>
}

/**
 * Evaluate freshly-scanned contract changes (poller integrate + on-demand
 * scans both feed this) and emit suggest.statusChange for each hit. gh is
 * consulted only for changes that actually carry a mentioned link — no PR
 * lookup storm. Emits events; writes NOTHING.
 */
export async function suggestFromFreshChanges(
  deps: SuggestPipelineDeps,
  fresh: ReadonlyArray<{ repoRoot: string; sha: string }>,
): Promise<void> {
  // one evaluation per sha (a commit touching N contract files is one commit)
  const bySha = new Map<string, string>()
  for (const row of fresh) if (!bySha.has(row.sha)) bySha.set(row.sha, row.repoRoot)
  const linked = [...bySha].map(([sha, repoRoot]) => ({
    sha,
    repoRoot,
    links: mentionedOnly(deps.linksFor(sha)),
  }))
  const candidates = linked.filter((c) => c.links.length > 0)
  if (candidates.length === 0) return
  const changes = await Promise.all(
    candidates.map(async (c) => ({
      sha: c.sha,
      links: c.links,
      pr: await deps.prFor(c.repoRoot, c.sha),
    })),
  )
  const events = evaluateSuggestions({
    changes,
    cards: deps.cards(),
    myProjects: deps.myProjects(),
    isDismissed: deps.isDismissed,
    alreadySuggested: (handoffId, sha) => suggestedKeys.has(`${handoffId}:${sha}`),
  })
  for (const event of events) {
    suggestedKeys.add(`${event.handoffId}:${event.evidence.sha}`)
    deps.emit({ kind: 'suggest.statusChange', ...event })
  }
}

/** Test seam: forget every session cache (remotes, capability, PRs, fired
 *  suggestions) — session caches have no prod invalidation by design. */
export function clearGithubCaches(): void {
  remoteCache.clear()
  prCache.clear()
  suggestedKeys.clear()
  ghCapable = null
}
