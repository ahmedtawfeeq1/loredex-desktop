/**
 * epic4.story2 dedupe helper: findDuplicateReceipt matches a preview's stamped
 * source_hash against non-undone route receipts.
 */
import { describe, expect, it } from 'vitest'
import type { RouteReceipt } from '../../../shared/types'
import { findDuplicateReceipt } from './route'

const receipt = (id: string, contentHash: string, undone = false): RouteReceipt => ({
  id,
  appliedAt: `2026-07-1${id}T00:00:00.000Z`,
  mode: 'copy',
  contentHash,
  written: [`/vault/${id}.md`],
  sources: [{ path: `/src/${id}.md`, priorContent: '' }],
  ...(undone ? { undone: true } : {}),
})

describe('findDuplicateReceipt', () => {
  it('matches a non-undone receipt by content hash', () => {
    const history = [receipt('1', 'aaa'), receipt('2', 'bbb')]
    expect(findDuplicateReceipt(history, 'bbb')).toEqual({
      receiptId: '2',
      appliedAt: '2026-07-12T00:00:00.000Z',
    })
  })

  it('ignores undone receipts — an undone route is no longer a duplicate', () => {
    const history = [receipt('1', 'aaa', true)]
    expect(findDuplicateReceipt(history, 'aaa')).toBeNull()
  })

  it('returns null when the hash is absent (move routes stamp no source_hash)', () => {
    expect(findDuplicateReceipt([receipt('1', 'aaa')], undefined)).toBeNull()
    expect(findDuplicateReceipt([receipt('1', 'aaa')], '')).toBeNull()
    expect(findDuplicateReceipt([receipt('1', 'aaa')], 'zzz')).toBeNull()
  })
})
