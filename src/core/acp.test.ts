/**
 * Pure protocol-mapping helpers in acp.ts (acp blueprint 2026-07-18, step 4):
 * session/update → chunk/event/ignore actions and session/request_permission
 * → the acp.permission CoreEvent. Pure functions only — the session registry,
 * batching and adapter lifecycle are exercised by the dev-app smoke (no live
 * agent in unit tests). Heavy core deps are mocked so the import stays light.
 */
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
}))

import { mapPermissionEvent, mapUpdate } from './acp'

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
