/**
 * Pure protocol-mapping helpers in acp.ts (acp blueprint 2026-07-18, step 4):
 * session/update → chunk/event/ignore actions and session/request_permission
 * → the acp.permission CoreEvent. Pure functions only — the session registry,
 * batching and adapter lifecycle are exercised by the dev-app smoke (no live
 * agent in unit tests). Heavy core deps are mocked so the import stays light.
 */
import { mkdirSync, mkdtempSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { RequestPermissionRequest, SessionNotification } from '@agentclientprotocol/sdk'

// acp.ts imports these at module scope for the (untested-here) session
// lifecycle — mock them so the unit test never touches sqlite or the MCP host
vi.mock('./mcp-server', () => ({
  getMcpStatus: vi.fn(() => ({ state: 'stopped', port: null })),
}))
vi.mock('./settings', () => ({
  mintAgentToken: vi.fn(() => 'tok'),
  revokeAgentToken: vi.fn(),
  loadPermissionRules: vi.fn(() => []),
}))

import {
  attachmentBlock,
  buildPromptBlocks,
  canLoadSession,
  continueCwd,
  deriveClientSlug,
  evaluatePermission,
  mapPermissionEvent,
  mapUpdate,
  resumeTargetSessionId,
  seedBlock,
} from './acp'
import type { PermissionRule } from '../shared/types'

type Update = SessionNotification['update']

describe('mapUpdate — chunks', () => {
  it('maps agent/thought text chunks to batchable chunk actions', () => {
    expect(
      mapUpdate('s1', { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Hi' } }),
    ).toEqual({ act: 'chunk', role: 'agent', text: 'Hi' })
    expect(
      mapUpdate('s1', { sessionUpdate: 'agent_thought_chunk', content: { type: 'text', text: 'hmm' } }),
    ).toEqual({ act: 'chunk', role: 'thought', text: 'hmm' })
  })

  it('drops non-text ContentBlocks (v1 ceiling)', () => {
    const image: Update = {
      sessionUpdate: 'agent_message_chunk',
      content: { type: 'image', data: '', mimeType: 'image/png' },
    }
    expect(mapUpdate('s1', image)).toEqual({ act: 'ignore' })
  })

  it('ignores user_message_chunk — we render the submitted text ourselves', () => {
    const echo: Update = {
      sessionUpdate: 'user_message_chunk',
      content: { type: 'text', text: 'my prompt' },
    }
    expect(mapUpdate('s1', echo)).toEqual({ act: 'ignore' })
  })
})

describe('mapUpdate — tool calls', () => {
  it('tool_call maps every field onto acp.tool', () => {
    expect(
      mapUpdate('s1', {
        sessionUpdate: 'tool_call',
        toolCallId: 't1',
        title: 'Read README',
        kind: 'read',
        status: 'pending',
      }),
    ).toEqual({
      act: 'event',
      event: {
        kind: 'acp.tool',
        sessionId: 's1',
        toolCallId: 't1',
        title: 'Read README',
        toolKind: 'read',
        status: 'pending',
      },
    })
  })

  it('tool_call_update passes through only what came — absent/null fields → undefined', () => {
    const sparse = mapUpdate('s1', {
      sessionUpdate: 'tool_call_update',
      toolCallId: 't1',
      status: 'completed',
      title: null, // protocol allows explicit null — must not surface as "null"
      kind: null,
    })
    expect(sparse).toEqual({
      act: 'event',
      event: {
        kind: 'acp.tool',
        sessionId: 's1',
        toolCallId: 't1',
        title: undefined,
        toolKind: undefined,
        status: 'completed',
      },
    })
  })
})

describe('mapUpdate — tool content + locations', () => {
  it('maps a Diff + locations onto acp.tool (oldText + line carried)', () => {
    expect(
      mapUpdate('s1', {
        sessionUpdate: 'tool_call',
        toolCallId: 't1',
        title: 'Edit a.md',
        kind: 'edit',
        status: 'in_progress',
        content: [{ type: 'diff', path: '/vault/notes/a.md', oldText: 'old', newText: 'new' }],
        locations: [{ path: '/vault/notes/a.md', line: 3 }],
      }),
    ).toEqual({
      act: 'event',
      event: {
        kind: 'acp.tool',
        sessionId: 's1',
        toolCallId: 't1',
        title: 'Edit a.md',
        toolKind: 'edit',
        status: 'in_progress',
        content: [{ kind: 'diff', path: '/vault/notes/a.md', oldText: 'old', newText: 'new' }],
        locations: [{ path: '/vault/notes/a.md', line: 3 }],
      },
    })
  })

  it('a new-file Diff (no oldText) omits oldText; a location without a line omits line', () => {
    expect(
      mapUpdate('s1', {
        sessionUpdate: 'tool_call',
        toolCallId: 't1',
        title: 'Create a.md',
        content: [{ type: 'diff', path: '/vault/a.md', newText: 'body' }],
        locations: [{ path: '/vault/a.md' }],
      }),
    ).toEqual({
      act: 'event',
      event: {
        kind: 'acp.tool',
        sessionId: 's1',
        toolCallId: 't1',
        title: 'Create a.md',
        toolKind: undefined,
        status: undefined,
        content: [{ kind: 'diff', path: '/vault/a.md', newText: 'body' }],
        locations: [{ path: '/vault/a.md' }],
      },
    })
  })

  it('maps text content and drops terminal + non-text blocks', () => {
    expect(
      mapUpdate('s1', {
        sessionUpdate: 'tool_call',
        toolCallId: 't1',
        title: 'Run',
        content: [
          { type: 'content', content: { type: 'text', text: 'output line' } },
          { type: 'terminal', terminalId: 'term-1' },
          { type: 'content', content: { type: 'image', data: '', mimeType: 'image/png' } },
        ],
      }),
    ).toMatchObject({
      act: 'event',
      event: { kind: 'acp.tool', content: [{ kind: 'text', text: 'output line' }] },
    })
  })

  it('omits content entirely when nothing maps (terminal-only) and locations when empty', () => {
    const r = mapUpdate('s1', {
      sessionUpdate: 'tool_call',
      toolCallId: 't1',
      title: 'Run',
      content: [{ type: 'terminal', terminalId: 'term-1' }],
      locations: [],
    }) as { act: 'event'; event: Record<string, unknown> }
    expect(r.event).not.toHaveProperty('content')
    expect(r.event).not.toHaveProperty('locations')
  })
})

describe('mapUpdate — commands, mode, usage', () => {
  it('available_commands_update → acp.commands (hint from input, optional)', () => {
    expect(
      mapUpdate('s1', {
        sessionUpdate: 'available_commands_update',
        availableCommands: [
          { name: 'plan', description: 'Make a plan', input: { hint: 'what to plan' } },
          { name: 'review', description: 'Review code' },
        ],
      }),
    ).toEqual({
      act: 'event',
      event: {
        kind: 'acp.commands',
        sessionId: 's1',
        commands: [
          { name: 'plan', description: 'Make a plan', hint: 'what to plan' },
          { name: 'review', description: 'Review code' },
        ],
      },
    })
  })

  it('current_mode_update → acp.mode with only the current id (no full set)', () => {
    expect(mapUpdate('s1', { sessionUpdate: 'current_mode_update', currentModeId: 'code' })).toEqual({
      act: 'event',
      event: { kind: 'acp.mode', sessionId: 's1', currentModeId: 'code' },
    })
  })

  it('usage_update → acp.usage context half, cost carried when present', () => {
    expect(
      mapUpdate('s1', {
        sessionUpdate: 'usage_update',
        used: 1000,
        size: 200000,
        cost: { amount: 0.12, currency: 'USD' },
      }),
    ).toEqual({
      act: 'event',
      event: {
        kind: 'acp.usage',
        sessionId: 's1',
        context: { used: 1000, size: 200000 },
        cost: { amount: 0.12, currency: 'USD' },
      },
    })
  })

  it('usage_update without cost omits cost', () => {
    expect(mapUpdate('s1', { sessionUpdate: 'usage_update', used: 500, size: 100000 })).toEqual({
      act: 'event',
      event: { kind: 'acp.usage', sessionId: 's1', context: { used: 500, size: 100000 } },
    })
  })
})

describe('mapUpdate — plan + unknown variants', () => {
  it('plan maps entries onto AcpPlanEntry (drops _meta)', () => {
    expect(
      mapUpdate('s1', {
        sessionUpdate: 'plan',
        entries: [
          { content: 'read the file', priority: 'high', status: 'in_progress', _meta: { x: 1 } },
          { content: 'edit it', priority: 'low', status: 'pending' },
        ],
      }),
    ).toEqual({
      act: 'event',
      event: {
        kind: 'acp.plan',
        sessionId: 's1',
        entries: [
          { content: 'read the file', priority: 'high', status: 'in_progress' },
          { content: 'edit it', priority: 'low', status: 'pending' },
        ],
      },
    })
  })

  it('genuinely unknown/unstable variants are ignored without throwing (sdk union is open)', () => {
    for (const variant of [
      'config_option_update',
      'session_info_update',
      'plan_update',
      'plan_removed',
      'unstable_v9',
    ]) {
      const update = { sessionUpdate: variant } as unknown as Update
      expect(mapUpdate('s1', update)).toEqual({ act: 'ignore' })
    }
  })
})

describe('B2 — cross-provider continuation seed (prepend logic)', () => {
  // the shape renderSeed produces: user/assistant turns verbatim, tool actions
  // reduced to title + touched filenames (agent-conversations.renderSeed)
  const seed = '**User:** Rename foo\n\n**Assistant:** Done\n\n**Tool:** Edit a.md — a.md'

  it('seedBlock → a plain text block when the adapter has no embeddedContext', () => {
    expect(seedBlock(seed, false)).toEqual({ type: 'text', text: seed })
  })

  it('seedBlock → an embedded {type:"resource"} block when embeddedContext is advertised', () => {
    expect(seedBlock(seed, true)).toEqual({
      type: 'resource',
      resource: { uri: 'loredex://conversation-seed', mimeType: 'text/markdown', text: seed },
    })
  })

  it('buildPromptBlocks prepends the seed as the FIRST block, the user turn second', () => {
    expect(buildPromptBlocks('now delete it', seed, false)).toEqual([
      { type: 'text', text: seed },
      { type: 'text', text: 'now delete it' },
    ])
  })

  it('buildPromptBlocks rides the seed as a resource block first when embeddedContext', () => {
    const blocks = buildPromptBlocks('now delete it', seed, true)
    expect(blocks).toHaveLength(2)
    expect(blocks[0]).toMatchObject({ type: 'resource' })
    expect(blocks[1]).toEqual({ type: 'text', text: 'now delete it' })
  })

  it('buildPromptBlocks with no pending seed is just the user turn (ordinary same-session prompt)', () => {
    // embeddedContext is irrelevant without a seed to carry
    expect(buildPromptBlocks('hello', null, false)).toEqual([{ type: 'text', text: 'hello' }])
    expect(buildPromptBlocks('hello', null, true)).toEqual([{ type: 'text', text: 'hello' }])
  })
})

describe('B4 — attachment blocks', () => {
  it('an image rides a {type:"image"} block ONLY when the adapter accepts images', () => {
    const img = { type: 'image' as const, mimeType: 'image/png', dataB64: 'AAAA' }
    expect(attachmentBlock(img, true)).toEqual({ type: 'image', data: 'AAAA', mimeType: 'image/png' })
    // unsupported → dropped (defence in depth behind the renderer's own gate)
    expect(attachmentBlock(img, false)).toBeNull()
  })

  it('a file path rides a baseline resource_link (file:// uri + basename, no gate)', () => {
    expect(attachmentBlock({ type: 'resource', path: '/tmp/reports/q3.pdf' }, false)).toEqual({
      type: 'resource_link',
      uri: 'file:///tmp/reports/q3.pdf',
      name: 'q3.pdf',
    })
  })

  it('buildPromptBlocks appends attachments AFTER the text (images gated, files always)', () => {
    const atts = [
      { type: 'image' as const, mimeType: 'image/png', dataB64: 'IMG' },
      { type: 'resource' as const, path: '/tmp/a.md' },
    ]
    // imageInput true → both blocks ride, after the text
    expect(buildPromptBlocks('look at these', null, false, atts, true)).toEqual([
      { type: 'text', text: 'look at these' },
      { type: 'image', data: 'IMG', mimeType: 'image/png' },
      { type: 'resource_link', uri: 'file:///tmp/a.md', name: 'a.md' },
    ])
    // imageInput false → the image is dropped, the file link still rides
    expect(buildPromptBlocks('look at these', null, false, atts, false)).toEqual([
      { type: 'text', text: 'look at these' },
      { type: 'resource_link', uri: 'file:///tmp/a.md', name: 'a.md' },
    ])
  })

  it('a seed still leads; attachments follow the text (continuation + attachment turn)', () => {
    const seed = '**User:** hi\n\n**Assistant:** yo'
    const blocks = buildPromptBlocks('and this file', seed, false, [{ type: 'resource', path: '/x/y.txt' }], true)
    expect(blocks).toEqual([
      { type: 'text', text: seed },
      { type: 'text', text: 'and this file' },
      { type: 'resource_link', uri: 'file:///x/y.txt', name: 'y.txt' },
    ])
  })

  it('no attachments → identical to the plain text turn (back-compat)', () => {
    expect(buildPromptBlocks('hello', null, false)).toEqual([{ type: 'text', text: 'hello' }])
    expect(buildPromptBlocks('hello', null, false, [], true)).toEqual([{ type: 'text', text: 'hello' }])
  })
})

describe('B2 — same-provider native resume vs cross-provider seed decision', () => {
  // a conversation that ran on claude (adapter session recorded) but never codex
  const loaded = {
    providers: [{ provider: 'claude' as const, acpSessionId: 'claude-sid-1' }],
  }

  it('resumeTargetSessionId returns the provider\'s own adapter session id', () => {
    expect(resumeTargetSessionId(loaded, 'claude')).toBe('claude-sid-1')
  })

  it('resumeTargetSessionId is null for a provider the conversation never ran on (→ seed)', () => {
    expect(resumeTargetSessionId(loaded, 'codex')).toBeNull()
  })

  it('resumeTargetSessionId is null when the provider row has no stored session id', () => {
    const noSid = { providers: [{ provider: 'codex' as const, acpSessionId: null }] }
    expect(resumeTargetSessionId(noSid, 'codex')).toBeNull()
  })

  it('canLoadSession: session/load ONLY with both a resume id AND the loadSession cap', () => {
    // same-provider, adapter advertises loadSession → native resume
    expect(canLoadSession('claude-sid-1', { loadSession: true })).toBe(true)
    // cross-provider: no stored id for the target → seed instead
    expect(canLoadSession(null, { loadSession: true })).toBe(false)
    // same-provider but the adapter can't load → seed fallback carries context
    expect(canLoadSession('claude-sid-1', { loadSession: false })).toBe(false)
    expect(canLoadSession('claude-sid-1', {})).toBe(false)
    expect(canLoadSession('claude-sid-1', undefined)).toBe(false)
  })
})

describe('mapPermissionEvent', () => {
  const req = (over: Partial<RequestPermissionRequest> = {}): RequestPermissionRequest => ({
    sessionId: 'adapter-sid',
    toolCall: { toolCallId: 't1', title: 'Write notes/a.md', kind: 'edit' },
    options: [
      { optionId: 'y', name: 'Allow', kind: 'allow_once' },
      { optionId: 'ya', name: 'Always allow', kind: 'allow_always' },
      { optionId: 'n', name: 'Reject', kind: 'reject_once' },
    ],
    ...over,
  })

  it('maps title/kind and the options verbatim, ordered as received', () => {
    expect(mapPermissionEvent('s1', 'r1', req())).toEqual({
      kind: 'acp.permission',
      sessionId: 's1', // OUR session id, never the adapter's
      requestId: 'r1',
      title: 'Write notes/a.md',
      toolKind: 'edit',
      options: [
        { optionId: 'y', name: 'Allow', kind: 'allow_once' },
        { optionId: 'ya', name: 'Always allow', kind: 'allow_always' },
        { optionId: 'n', name: 'Reject', kind: 'reject_once' },
      ],
    })
  })

  it('falls back to "Tool call" when the toolCall carries no title', () => {
    const e = mapPermissionEvent('s1', 'r2', req({ toolCall: { toolCallId: 't2', title: null } }))
    expect(e).toMatchObject({ title: 'Tool call', toolKind: undefined })
  })

  it('carries the toolCall diff + locations onto the permission (A3, ToolCall shapes)', () => {
    expect(
      mapPermissionEvent(
        's1',
        'r3',
        req({
          toolCall: {
            toolCallId: 't3',
            title: 'Write notes/a.md',
            kind: 'edit',
            content: [{ type: 'diff', path: '/vault/notes/a.md', oldText: 'old', newText: 'new' }],
            locations: [{ path: '/vault/notes/a.md', line: 3 }],
          },
        }),
      ),
    ).toEqual({
      kind: 'acp.permission',
      sessionId: 's1',
      requestId: 'r3',
      title: 'Write notes/a.md',
      toolKind: 'edit',
      options: [
        { optionId: 'y', name: 'Allow', kind: 'allow_once' },
        { optionId: 'ya', name: 'Always allow', kind: 'allow_always' },
        { optionId: 'n', name: 'Reject', kind: 'reject_once' },
      ],
      content: [{ kind: 'diff', path: '/vault/notes/a.md', oldText: 'old', newText: 'new' }],
      locations: [{ path: '/vault/notes/a.md', line: 3 }],
    })
  })

  it('omits content/locations when the toolCall carries none (terminal-only → clean event)', () => {
    const e = mapPermissionEvent(
      's1',
      'r4',
      req({
        toolCall: {
          toolCallId: 't4',
          title: 'Run build',
          content: [{ type: 'terminal', terminalId: 'term-1' }],
          locations: [],
        },
      }),
    ) as Record<string, unknown>
    expect(e).not.toHaveProperty('content')
    expect(e).not.toHaveProperty('locations')
  })
})

// WP-A: client slug from a session cwd (posix fixtures — the pure fn uses the
// platform's path.relative, exercised on the CI/dev mac).
describe('deriveClientSlug', () => {
  const vault = '/Users/x/Loredex'
  it('extracts the client from a projects/<client>/… cwd', () => {
    expect(deriveClientSlug(`${vault}/projects/acme_dental`, vault)).toBe('acme_dental')
    expect(deriveClientSlug(`${vault}/projects/acme_dental/pipelines/intake`, vault)).toBe(
      'acme_dental',
    )
  })
  it('returns null for the vault root itself', () => {
    expect(deriveClientSlug(vault, vault)).toBeNull()
  })
  it('returns null outside the vault', () => {
    expect(deriveClientSlug('/Users/x/Other/projects/acme', vault)).toBeNull()
  })
  it('returns null for a non-projects subtree (research dex layout)', () => {
    expect(deriveClientSlug(`${vault}/some_project/topic`, vault)).toBeNull()
    expect(deriveClientSlug(`${vault}/projects`, vault)).toBeNull() // no client segment
  })
})

// BL-5: continuing a thread must respawn in its own folder, so that folder's
// .mcp.json servers load again (MCP is discovered at adapter startup).
describe('continueCwd', () => {
  const sandbox = realpathSync(mkdtempSync(join(tmpdir(), 'loredex-continue-cwd-')))
  const vault = join(sandbox, 'vault')
  const clientDir = join(vault, 'projects', 'acme')
  mkdirSync(clientDir, { recursive: true })

  it('prefers the thread’s own recorded cwd', () => {
    expect(continueCwd({ cwd: clientDir, clientSlug: 'acme' }, vault)).toBe(clientDir)
  })
  it('derives from the client slug for older threads with no cwd', () => {
    expect(continueCwd({ cwd: null, clientSlug: 'acme' }, vault)).toBe(clientDir)
  })
  it('falls back to the vault root when the recorded folder is gone', () => {
    expect(continueCwd({ cwd: join(vault, 'projects', 'deleted'), clientSlug: null }, vault)).toBe(
      vault,
    )
  })
  it('falls back to the vault root when the slug folder is gone', () => {
    expect(continueCwd({ cwd: null, clientSlug: 'never-existed' }, vault)).toBe(vault)
  })
  it('is the vault root for an unscoped thread', () => {
    expect(continueCwd({}, vault)).toBe(vault)
  })
})

// WP-B: always-allow evaluation — auto-answer with the request's OWN allow_once
// option, or null (surface the modal). Decision derived from option KIND.
describe('evaluatePermission', () => {
  const rules: PermissionRule[] = [{ client: 'acme', toolKind: 'edit', decision: 'allow' }]
  const opts = [
    { optionId: 'a', kind: 'allow_once' },
    { optionId: 'b', kind: 'reject_once' },
  ]
  it('(a) auto-answers with the allow_once option when a rule matches', () => {
    expect(evaluatePermission(rules, 'acme', 'edit', opts)).toEqual({
      outcome: { outcome: 'selected', optionId: 'a' },
    })
  })
  it('(b) surfaces (null) when no rule matches the client', () => {
    expect(evaluatePermission(rules, 'other', 'edit', opts)).toBeNull()
  })
  it('(c) surfaces when the tool kind does not match', () => {
    expect(evaluatePermission(rules, 'acme', 'bash', opts)).toBeNull()
  })
  it('(d) never auto-answers a session with no client scope', () => {
    expect(evaluatePermission(rules, null, 'edit', opts)).toBeNull()
  })
  it('(e) never auto-answers a request with no tool kind', () => {
    expect(evaluatePermission(rules, 'acme', undefined, opts)).toBeNull()
  })
  it('(f) surfaces when the request offers no allow_once option (never the wrong kind)', () => {
    const noAllowOnce = [
      { optionId: 'x', kind: 'allow_always' },
      { optionId: 'y', kind: 'reject_once' },
    ]
    expect(evaluatePermission(rules, 'acme', 'edit', noAllowOnce)).toBeNull()
  })
})
