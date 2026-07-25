/**
 * The conversation → runs lookup. Asserted against the metadata shape of a REAL
 * export (al-hazem-tech, 2026-07-23): conversation_id 126 as a number,
 * session_id/thread_id as "conv-126".
 */
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./langsmith-config', () => ({
  langsmithEndpoint: () => 'https://api.smith.langchain.com',
}))

const { setUserDataDir } = await import('./paths')
const { fetchTraceForRef } = await import('./langsmith-trace')
const { parseTraceRef } = await import('./langsmith-links')

const STAMP = '2026-07-23T10-00-00-000Z'
const ref = (text: string) => {
  const r = parseTraceRef(text)
  if (!r) throw new Error(`unparseable: ${text}`)
  return r
}

/** Capture every request the fetch layer makes, and script the replies. */
function stubFetch(replies: ((url: string, init?: RequestInit) => Response)[]): {
  calls: { url: string; body: unknown }[]
} {
  const calls: { url: string; body: unknown }[] = []
  let i = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({
        url: String(url),
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      })
      const reply = replies[Math.min(i, replies.length - 1)]
      i += 1
      return reply(String(url), init)
    }),
  )
  return { calls }
}

beforeEach(() => setUserDataDir(mkdtempSync(join(tmpdir(), 'ls-ud-'))))
afterEach(() => vi.unstubAllGlobals())

const ok = (body: unknown) => () => new Response(JSON.stringify(body), { status: 200 })

describe('fetchTraceForRef — by conversation', () => {
  it('resolves the project name to a uuid, then scopes the query to it', async () => {
    const { calls } = stubFetch([
      ok([{ id: '36afcf8f-a5c8-41f8-aa5d-41efc5d4c7cf', name: 'genudo-staging' }]),
      ok({ runs: [{ id: 'r1' }] }),
    ])
    await fetchTraceForRef('lsv2_pt_k', ref('126'), 'genudo-staging', STAMP)
    expect(calls[0].url).toContain('/api/v1/sessions?name=genudo-staging')
    expect(calls[1].url).toContain('/api/v1/runs/query')
    expect(calls[1].body).toMatchObject({ session: ['36afcf8f-a5c8-41f8-aa5d-41efc5d4c7cf'] })
  })

  it('a uuid in the project field is used directly — no name lookup', async () => {
    const { calls } = stubFetch([ok({ runs: [{ id: 'r1' }] })])
    await fetchTraceForRef('k', ref('126'), '36afcf8f-a5c8-41f8-aa5d-41efc5d4c7cf', STAMP)
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toContain('/runs/query')
  })

  it('queries ROOT runs, newest first, matching both id spellings', async () => {
    const { calls } = stubFetch([ok({ runs: [{ id: 'r1' }] })])
    await fetchTraceForRef('k', ref('126'), null, STAMP)
    const body = calls[0].body as { filter: string; is_root: boolean; order: string }
    expect(body.is_root).toBe(true)
    expect(body.order).toBe('desc')
    expect(body.filter).toContain('"conversation_id", "session_id", "thread_id"')
    expect(body.filter).toContain('eq(metadata_value, "126")')
    expect(body.filter).toContain('eq(metadata_value, "conv-126")')
  })

  it('writes the runs to a file and returns only the path', async () => {
    stubFetch([ok({ runs: [{ id: 'r1', outputs: { response: 'hi' } }] })])
    const res = await fetchTraceForRef('k', ref('conv-126'), 'genudo-staging', STAMP)
    expect(res.ok).toBe(true)
    expect(res.count).toBe(1)
    // `conv-126` and `126` are one conversation — one file name, not two
    expect(res.path).toContain('conversation-126')
    expect(res.path).not.toContain('conv-126')
    const written = JSON.parse(readFileSync(res.path as string, 'utf8'))
    expect(written).toMatchObject({ source: 'langsmith', project: 'genudo-staging', runCount: 1 })
    expect(written.runs[0].outputs.response).toBe('hi')
  })

  /** A silent truncation reads as "that is the whole conversation" — which is
   *  the worst possible thing to believe while debugging one. */
  it('says so when the cap cut the result', async () => {
    stubFetch([ok({ runs: Array.from({ length: 3 }, (_, i) => ({ id: `r${i}` })) })])
    const res = await fetchTraceForRef('k', ref('126'), null, STAMP, 3)
    expect(res.truncated).toBe(true)
    expect(res.detail).toMatch(/capped at 3/)
    expect(res.detail).toMatch(/older turns not included/)
  })

  it('no runs is an explanation, not an empty success', async () => {
    stubFetch([ok({ runs: [] })])
    const res = await fetchTraceForRef('k', ref('999'), 'genudo-staging', STAMP)
    expect(res.ok).toBe(false)
    expect(res.path).toBeNull()
    expect(res.detail).toContain('conversation 999')
    expect(res.detail).toContain('genudo-staging')
  })

  it('a 401 names the credential instead of blaming the feature', async () => {
    stubFetch([() => new Response('', { status: 401 })])
    const res = await fetchTraceForRef('k', ref('126'), null, STAMP)
    expect(res.detail).toMatch(/rejected the API key/i)
  })

  it('an unreachable host is one line, never a thrown page', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('getaddrinfo ENOTFOUND nope\n  at x')
      }),
    )
    const res = await fetchTraceForRef('k', ref('126'), null, STAMP)
    expect(res).toMatchObject({ ok: false, detail: 'getaddrinfo ENOTFOUND nope' })
  })
})

describe('fetchTraceForRef — by pasted LangSmith run URL', () => {
  it('pulls the WHOLE trace, not just the node that was linked', async () => {
    const { calls } = stubFetch([ok({ runs: [{ id: 'a' }, { id: 'b' }] })])
    const res = await fetchTraceForRef(
      'k',
      ref(
        'https://smith.langchain.com/o/e0f1ea46-2fc2-405b-99a1-fbe87481bb3e/projects/p/36afcf8f-a5c8-41f8-aa5d-41efc5d4c7cf/r/2f1e0b7c-1111-4222-8333-444455556666',
      ),
      null,
      STAMP,
    )
    const body = calls[0].body as { trace: string; session: string[]; is_root?: boolean }
    expect(body.trace).toBe('2f1e0b7c-1111-4222-8333-444455556666')
    expect(body.session).toEqual(['36afcf8f-a5c8-41f8-aa5d-41efc5d4c7cf'])
    // a trace query returns every run in the trace; is_root would drop the
    // children, which are usually the interesting part
    expect(body.is_root).toBeUndefined()
    expect(res.count).toBe(2)
  })
})
