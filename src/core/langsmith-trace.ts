/**
 * Fetch the runs for one conversation out of LangSmith, so an agent can be
 * asked "what happened here" without anyone hunting for a trace first.
 *
 * The flow this serves: paste a conversation link from the user's OWN platform →
 * we resolve the id → query LangSmith by metadata → write the runs to a file →
 * the agent reads that file. No LangSmith UI, no manual export.
 *
 * WHY A FILE, not the IPC payload. One run of theirs is ~47 KB of inputs and
 * outputs, and a conversation is many turns. Pushing that through the seam and
 * into a chat message would blow the context before the agent read a word. A
 * path costs nothing, every provider can read a file, and the agent chooses how
 * much of it to pull in.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { langsmithEndpoint } from './langsmith-config'
import { conversationFilter, type TraceRef } from './langsmith-links'
import { scratchDir } from './paths'

/** Root runs only, and a ceiling: a long-running conversation is unbounded, and
 *  silently truncating to "the newest N" is honest only if we say so. */
const DEFAULT_LIMIT = 25

export interface TraceFetchResult {
  ok: boolean
  detail: string
  /** absolute path to the written JSON, when anything was found */
  path: string | null
  /** how many root runs were written */
  count: number
  /** true when the cap cut the result — the caller must say so */
  truncated: boolean
}

interface QueryBody {
  session?: string[]
  filter?: string
  trace?: string
  is_root?: boolean
  limit?: number
  order?: string
}

async function postRunsQuery(
  apiKey: string,
  body: QueryBody,
): Promise<{ runs: unknown[] } | { error: string }> {
  try {
    const res = await fetch(`${langsmithEndpoint()}/api/v1/runs/query`, {
      method: 'POST',
      headers: {
        'X-Api-Key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    })
    if (res.status === 401 || res.status === 403) {
      return { error: 'LangSmith rejected the API key (401) — check it in Settings' }
    }
    if (!res.ok) return { error: `LangSmith returned HTTP ${res.status}` }
    const parsed = (await res.json()) as { runs?: unknown[] }
    return { runs: Array.isArray(parsed.runs) ? parsed.runs : [] }
  } catch (e) {
    return { error: e instanceof Error ? e.message.split('\n')[0] : String(e) }
  }
}

/**
 * The tracing project's UUID, resolved from the name the user configured.
 *
 * LangSmith's API calls a tracing project a "session", and the runs query wants
 * the UUID, not the name. A missing/blank project means "search the whole
 * workspace" — allowed, just slower and noisier.
 */
export async function resolveProjectId(apiKey: string, name: string | null): Promise<string | null> {
  if (!name) return null
  // already a uuid — the user pasted the id rather than the name
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(name)) return name
  try {
    const res = await fetch(
      `${langsmithEndpoint()}/api/v1/sessions?name=${encodeURIComponent(name)}&limit=1`,
      { headers: { 'X-Api-Key': apiKey, Accept: 'application/json' }, signal: AbortSignal.timeout(15_000) },
    )
    if (!res.ok) return null
    const body = (await res.json()) as { id?: string }[] | { id?: string }
    const first = Array.isArray(body) ? body[0] : body
    return first?.id ?? null
  } catch {
    return null // unresolvable name → fall back to a workspace-wide search
  }
}

/** Where a fetched conversation lands. Under userData, not the vault: it is a
 *  scratch copy of someone else's system, not a note, and must never be routed
 *  into the dex or committed. */
function traceDir(): string {
  const dir = scratchDir('langsmith-traces')
  mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * Fetch everything LangSmith holds for one conversation (or one pasted run) and
 * write it to disk.
 *
 * `stamp` is passed in rather than read from a clock here — the same reason the
 * snapshot handler mints its stamp host-side and keeps the lib pure.
 */
export async function fetchTraceForRef(
  apiKey: string,
  ref: TraceRef,
  projectName: string | null,
  stamp: string,
  limit: number = DEFAULT_LIMIT,
): Promise<TraceFetchResult> {
  const projectId = await resolveProjectId(apiKey, projectName)

  const body: QueryBody =
    ref.kind === 'langsmith-run'
      ? // a pasted LangSmith URL: pull the WHOLE trace, not just that node —
        // the interesting part is usually a sibling or a child
        { trace: ref.runId, ...(ref.projectId ? { session: [ref.projectId] } : {}) }
      : {
          filter: conversationFilter(ref.candidates),
          is_root: true,
          limit,
          order: 'desc',
          ...(projectId ? { session: [projectId] } : {}),
        }

  const result = await postRunsQuery(apiKey, body)
  if ('error' in result) return { ok: false, detail: result.error, path: null, count: 0, truncated: false }

  const runs = result.runs
  if (runs.length === 0) {
    const where = projectName ? ` in project "${projectName}"` : ''
    return {
      ok: false,
      detail:
        ref.kind === 'conversation'
          ? `No runs found for conversation ${ref.id}${where}. Check the tracing project in Settings, or that this conversation's runs carry conversation_id / session_id / thread_id.`
          : `No runs found for that trace${where}.`,
      path: null,
      count: 0,
      truncated: false,
    }
  }

  // the BARE id (candidates[0] by construction), never the raw paste: `126` and
  // `conv-126` are the same conversation and must not produce two file names
  const label =
    ref.kind === 'conversation'
      ? `conversation-${ref.candidates[0]}`
      : `trace-${ref.runId.slice(0, 8)}`
  const path = join(traceDir(), `${label}-${stamp}.json`)
  writeFileSync(
    path,
    JSON.stringify(
      {
        fetched: stamp,
        source: 'langsmith',
        endpoint: langsmithEndpoint(),
        project: projectName,
        ref,
        runCount: runs.length,
        runs,
      },
      null,
      2,
    ),
    'utf8',
  )

  const truncated = ref.kind === 'conversation' && runs.length >= limit
  return {
    ok: true,
    // say when the cap cut it — a silent truncation reads as "that is the whole
    // conversation", which is exactly the wrong thing to believe while debugging
    detail: truncated
      ? `${runs.length} runs (capped at ${limit} — newest first; older turns not included)`
      : `${runs.length} run${runs.length === 1 ? '' : 's'}`,
    path,
    count: runs.length,
    truncated,
  }
}
