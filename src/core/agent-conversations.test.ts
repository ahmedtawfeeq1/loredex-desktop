/**
 * ACP conversation transcript (Phase 2 B0): append/load round-trip + renderSeed
 * shape. Real app.db over a tmp dir (db.test.ts style) — the tables are exercised
 * exactly as the acp.ts flush seams drive them (contiguous runs merge, tools
 * upsert by toolCallId, thoughts persist but never seed).
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { AppDb } from './db/index'
import { openAppDb } from './db/index'
import {
  appendMessage,
  createConversation,
  deleteConversationIfEmpty,
  listConversations,
  loadConversation,
  renderSeed,
  setConvProviderSession,
} from './agent-conversations'

const db = (): AppDb => openAppDb(mkdtempSync(join(tmpdir(), 'loredex-convdb-')))

describe('createConversation + loadConversation', () => {
  it('creates a vault-scoped thread and round-trips its metadata', () => {
    const d = db()
    const { id } = createConversation(d, 'v1', { agent: 'claude' })
    const loaded = loadConversation(d, id)
    expect(loaded).toMatchObject({
      id,
      vaultId: 'v1',
      title: null,
      lastProvider: 'claude',
      providers: [],
      messages: [],
    })
    d.close()
  })

  it('returns null for an unknown id', () => {
    const d = db()
    expect(loadConversation(d, 'nope')).toBeNull()
    d.close()
  })

  it('persists + round-trips the WP-A client slug (list + load)', () => {
    const d = db()
    const { id } = createConversation(d, 'v1', { agent: 'claude', clientSlug: 'acme_dental' })
    expect(loadConversation(d, id)!.clientSlug).toBe('acme_dental')
    expect(listConversations(d, 'v1')[0].clientSlug).toBe('acme_dental')
    // a vault-root thread carries null
    const bare = createConversation(d, 'v1', { agent: 'claude' })
    expect(loadConversation(d, bare.id)!.clientSlug).toBeNull()
    d.close()
  })
})

describe('appendMessage — auto-title (#20)', () => {
  it('titles the thread from the first user turn, once, leaving later/renamed titles alone', () => {
    const d = db()
    const { id } = createConversation(d, 'v1', { agent: 'claude' })
    appendMessage(d, id, { role: 'user', text: 'Draft the lead reactivation follow-up' })
    expect(loadConversation(d, id)!.title).toBe('Draft the lead reactivation follow-up')
    appendMessage(d, id, { role: 'user', text: 'a totally different second question' })
    expect(loadConversation(d, id)!.title).toBe('Draft the lead reactivation follow-up') // unchanged
    d.close()
  })

  it('clips a long first turn on a word boundary with an ellipsis', () => {
    const d = db()
    const { id } = createConversation(d, 'v1', { agent: 'claude' })
    appendMessage(d, id, {
      role: 'user',
      text: 'Please summarize every single knowledge table row for this client thoroughly',
    })
    const title = loadConversation(d, id)!.title!
    expect(title.length).toBeLessThanOrEqual(49)
    expect(title.endsWith('…')).toBe(true)
    d.close()
  })
})

describe('appendMessage — round-trip + merge rules', () => {
  it('grows a contiguous same-role run into ONE row; a role switch / tool breaks it', () => {
    const d = db()
    const { id } = createConversation(d, 'v1', { agent: 'claude' })
    appendMessage(d, id, { role: 'user', text: 'hi' })
    appendMessage(d, id, { role: 'agent', text: 'he' })
    appendMessage(d, id, { role: 'agent', text: 'llo' }) // grows the agent row
    appendMessage(d, id, { role: 'tool', tool: { toolCallId: 't1', title: 'Read a.md' } })
    appendMessage(d, id, { role: 'agent', text: 'done' }) // last row is tool → new row
    expect(loadConversation(d, id)!.messages).toEqual([
      { role: 'user', text: 'hi' },
      { role: 'agent', text: 'hello' },
      { role: 'tool', tool: { toolCallId: 't1', title: 'Read a.md' } },
      { role: 'agent', text: 'done' },
    ])
    d.close()
  })

  it('upserts a tool row by toolCallId, sparse-merging (an update keeps the prior title)', () => {
    const d = db()
    const { id } = createConversation(d, 'v1', { agent: 'claude' })
    appendMessage(d, id, {
      role: 'tool',
      tool: { toolCallId: 't1', title: 'Edit a.md', toolKind: 'edit', status: 'pending' },
    })
    // a tool_call_update carries only the changed field — title/kind survive
    appendMessage(d, id, { role: 'tool', tool: { toolCallId: 't1', status: 'completed' } })
    // a diff arrives on a later update
    appendMessage(d, id, {
      role: 'tool',
      tool: {
        toolCallId: 't1',
        content: [{ kind: 'diff', path: '/vault/notes/a.md', newText: 'body' }],
        locations: [{ path: '/vault/notes/a.md', line: 3 }],
      },
    })
    const msgs = loadConversation(d, id)!.messages
    expect(msgs).toHaveLength(1) // one row, not three
    expect(msgs[0]).toEqual({
      role: 'tool',
      tool: {
        toolCallId: 't1',
        title: 'Edit a.md',
        toolKind: 'edit',
        status: 'completed',
        content: [{ kind: 'diff', path: '/vault/notes/a.md', newText: 'body' }],
        locations: [{ path: '/vault/notes/a.md', line: 3 }],
      },
    })
    d.close()
  })

  it('persists thought rows (kept for hydration, unlike the seed)', () => {
    const d = db()
    const { id } = createConversation(d, 'v1', { agent: 'claude' })
    appendMessage(d, id, { role: 'thought', text: 'thinking…' })
    appendMessage(d, id, { role: 'agent', text: 'answer' })
    expect(loadConversation(d, id)!.messages).toEqual([
      { role: 'thought', text: 'thinking…' },
      { role: 'agent', text: 'answer' },
    ])
    d.close()
  })
})

describe('setConvProviderSession', () => {
  it('records the adapter session id per provider and follows last_provider', () => {
    const d = db()
    const { id } = createConversation(d, 'v1', { agent: 'claude' })
    setConvProviderSession(d, id, 'claude', 'claude-sid-1')
    setConvProviderSession(d, id, 'codex', 'codex-sid-1') // provider switch (B2)
    setConvProviderSession(d, id, 'claude', 'claude-sid-2') // upsert, not duplicate
    const loaded = loadConversation(d, id)!
    expect(loaded.lastProvider).toBe('claude') // followed the most recent attach
    expect(loaded.providers).toEqual([
      { provider: 'claude', acpSessionId: 'claude-sid-2' },
      { provider: 'codex', acpSessionId: 'codex-sid-1' },
    ])
    d.close()
  })
})

describe('listConversations', () => {
  it('lists a vault newest-updated first, scoped to the vault', () => {
    // distinct system times so updated_at doesn't collide at ms resolution
    vi.useFakeTimers()
    try {
      const d = db()
      vi.setSystemTime(new Date('2026-07-18T10:00:00Z'))
      const a = createConversation(d, 'v1', { agent: 'claude' }).id
      vi.setSystemTime(new Date('2026-07-18T10:00:01Z'))
      const b = createConversation(d, 'v1', { agent: 'codex' }).id
      vi.setSystemTime(new Date('2026-07-18T10:00:02Z'))
      createConversation(d, 'v2', { agent: 'claude' }) // another vault — never listed for v1
      vi.setSystemTime(new Date('2026-07-18T10:00:03Z'))
      appendMessage(d, a, { role: 'user', text: 'later' }) // touch a → most-recently-updated
      const list = listConversations(d, 'v1')
      expect(list.map((c) => c.id)).toEqual([a, b])
      // the first user turn auto-titles the thread (#20)
      expect(list[0]).toMatchObject({ id: a, lastProvider: 'claude', title: 'later' })
      // limit honored
      expect(listConversations(d, 'v1', 1).map((c) => c.id)).toEqual([a])
      d.close()
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('renderSeed', () => {
  it('is a compact provider-neutral transcript: turns verbatim, tools → filenames, thoughts dropped, diff bodies elided', () => {
    const d = db()
    const { id } = createConversation(d, 'v1', { agent: 'claude' })
    appendMessage(d, id, { role: 'user', text: 'fix the note' })
    appendMessage(d, id, { role: 'thought', text: 'internal reasoning' })
    appendMessage(d, id, { role: 'agent', text: 'on it' })
    appendMessage(d, id, {
      role: 'tool',
      tool: {
        toolCallId: 't1',
        title: 'Edit a.md',
        // diff body must NOT appear in the seed — only the filename
        content: [{ kind: 'diff', path: '/abs/vault/notes/a.md', oldText: 'X', newText: 'Y' }],
        locations: [{ path: '/abs/vault/notes/b.md', line: 3 }],
      },
    })
    expect(renderSeed(d, id)).toBe(
      ['**User:** fix the note', '**Assistant:** on it', '**Tool:** Edit a.md — a.md, b.md'].join(
        '\n\n',
      ),
    )
    d.close()
  })

  it('is empty for an unknown conversation', () => {
    const d = db()
    expect(renderSeed(d, 'nope')).toBe('')
    d.close()
  })
})

describe('renderSeed — no machine paths leak into the cross-provider seed', () => {
  it('collapses absolute POSIX paths in a tool title to the basename', () => {
    const d = db()
    const { id } = createConversation(d, 'v1', { agent: 'claude' })
    appendMessage(d, id, { role: 'tool', tool: { toolCallId: 't1', title: 'Read /Users/alice/vault/notes/x.md' } })
    const seed = renderSeed(d, id)
    expect(seed).toContain('Read x.md')
    expect(seed).not.toContain('/Users/alice')
    d.close()
  })

  it('collapses a Windows path and leaves ratios like 3/4 alone', () => {
    const d = db()
    const { id } = createConversation(d, 'v1', { agent: 'claude' })
    appendMessage(d, id, { role: 'tool', tool: { toolCallId: 't1', title: 'Edit C:\\Users\\bob\\a.md' } })
    appendMessage(d, id, { role: 'agent', text: 'progress 3/4 done' })
    const seed = renderSeed(d, id)
    expect(seed).toContain('Edit a.md')
    expect(seed).not.toContain('C:\\Users')
    expect(seed).toContain('3/4') // a ratio is not a path token
    d.close()
  })
})

describe('deleteConversationIfEmpty — GC opened-then-closed rows', () => {
  it('drops a message-less conversation (+ its provider rows)', () => {
    const d = db()
    const { id } = createConversation(d, 'v1', { agent: 'claude' })
    setConvProviderSession(d, id, 'claude', 'acp-1')
    deleteConversationIfEmpty(d, id)
    expect(loadConversation(d, id)).toBeNull()
    d.close()
  })

  it('keeps a conversation once it has any message', () => {
    const d = db()
    const { id } = createConversation(d, 'v1', { agent: 'claude' })
    appendMessage(d, id, { role: 'user', text: 'hi' })
    deleteConversationIfEmpty(d, id)
    expect(loadConversation(d, id)).not.toBeNull()
    d.close()
  })
})
