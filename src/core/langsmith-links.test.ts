import { describe, expect, it } from 'vitest'
import { conversationFilter, parseTraceRef } from './langsmith-links'

describe('parseTraceRef — whatever the user pastes', () => {
  it('a bare conversation id', () => {
    expect(parseTraceRef('126')).toEqual({
      kind: 'conversation',
      id: '126',
      candidates: ['126', 'conv-126'],
    })
  })

  it('the `conv-126` spelling their runs actually carry', () => {
    expect(parseTraceRef('conv-126')).toMatchObject({
      kind: 'conversation',
      candidates: ['126', 'conv-126'],
    })
  })

  /** The REAL console links, confirmed 2026-07-23 — production first. The
   *  parser is host-agnostic (it keys on the parameter), so prod and dev are
   *  the same case; both are pinned so a route rename fails here first. */
  it('the production console link: app.genudo.ai/inboxes?conversation=<id>', () => {
    expect(parseTraceRef('http://app.genudo.ai/inboxes?conversation=128')).toEqual({
      kind: 'conversation',
      id: '128',
      candidates: ['128', 'conv-128'],
    })
  })

  it('the dev console link resolves identically — the host is not part of it', () => {
    expect(parseTraceRef('https://devconsole.loop-x.co/inboxes?conversation=128')).toMatchObject({
      id: '128',
    })
  })

  it('an explicit query parameter wins over any other digits in the URL', () => {
    expect(
      parseTraceRef('https://app.genudo.ai/inboxes?pipeline=97&conversation_id=126&page=3'),
    ).toMatchObject({ kind: 'conversation', id: '126' })
  })

  it('…including when the console adds filters around it', () => {
    expect(
      parseTraceRef('http://app.genudo.ai/inboxes?pipeline=97&conversation=128&tab=all'),
    ).toMatchObject({ id: '128' })
  })

  it('a path segment', () => {
    expect(parseTraceRef('https://app.genudo.ai/conversations/126')).toMatchObject({ id: '126' })
    expect(parseTraceRef('https://app.genudo.ai/inbox/thread/126?x=1')).toMatchObject({ id: '126' })
  })

  it('a conv- slug anywhere in pasted text', () => {
    expect(parseTraceRef('the bad one was conv-126 yesterday')).toMatchObject({ id: 'conv-126' })
  })

  /** A wrong id looks exactly like a conversation with no traces — silence is
   *  worse than "I could not read that", so we refuse instead of guessing. */
  it('refuses to guess an id from stray digits', () => {
    expect(parseTraceRef('https://app.genudo.ai/inboxes?page=3')).toBeNull()
    expect(parseTraceRef('https://localhost:3000/')).toBeNull()
    expect(parseTraceRef('')).toBeNull()
    expect(parseTraceRef('   ')).toBeNull()
  })

  it('a LangSmith run URL is a different question, answered differently', () => {
    expect(
      parseTraceRef(
        'https://smith.langchain.com/o/e0f1ea46-2fc2-405b-99a1-fbe87481bb3e/projects/p/36afcf8f-a5c8-41f8-aa5d-41efc5d4c7cf/r/2f1e0b7c-1111-4222-8333-444455556666?trace=x',
      ),
    ).toEqual({
      kind: 'langsmith-run',
      runId: '2f1e0b7c-1111-4222-8333-444455556666',
      projectId: '36afcf8f-a5c8-41f8-aa5d-41efc5d4c7cf',
    })
  })

  it('a public share URL still yields the run', () => {
    expect(
      parseTraceRef('https://smith.langchain.com/public/abc/r/2f1e0b7c-1111-4222-8333-444455556666'),
    ).toMatchObject({ kind: 'langsmith-run', projectId: null })
  })
})

describe('conversationFilter — the LangSmith query DSL', () => {
  it('matches the id under any of the three keys their runs use', () => {
    const f = conversationFilter(['126', 'conv-126'])
    expect(f).toContain('in(metadata_key, ["conversation_id", "session_id", "thread_id"])')
  })

  it('matches both spellings of the same conversation', () => {
    const f = conversationFilter(['126', 'conv-126'])
    expect(f).toContain('or(eq(metadata_value, "126"), eq(metadata_value, "conv-126"))')
  })

  it('a single candidate needs no or()', () => {
    expect(conversationFilter(['126'])).toContain('), eq(metadata_value, "126"))')
    expect(conversationFilter(['126'])).not.toContain('or(')
  })

  it('escapes a quote so a crafted id cannot rewrite the expression', () => {
    expect(conversationFilter(['a"b'])).toContain('eq(metadata_value, "a\\"b")')
  })
})
