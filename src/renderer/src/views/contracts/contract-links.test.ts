/** Story 11.3: reverse contract-link index correctness. */
import { describe, expect, it } from 'vitest'
import type { ContractChange } from '../../../../shared/types'
import { reverseContractLinks } from './contract-links'

const change = (over: Partial<ContractChange>): ContractChange => ({
  repoRoot: '/repos/backend',
  project: 'backend',
  file: 'openapi.yaml',
  sha: 'a'.repeat(40),
  date: '2026-07-09T10:00:00+02:00',
  author: 'Dana',
  subject: 'feat',
  adds: 1,
  dels: 0,
  links: [],
  ...over,
})

describe('reverseContractLinks', () => {
  it('inverts change.links into handoffId → chips, tier preserved', () => {
    const index = reverseContractLinks([
      change({ links: [{ handoffId: 'h1', confidence: 'mentioned' }] }),
      change({
        sha: 'b'.repeat(40),
        file: 'postman_collection.json',
        links: [
          { handoffId: 'h1', confidence: 'heuristic' },
          { handoffId: 'h2', confidence: 'mentioned' },
        ],
      }),
    ])
    expect(index['h1']).toEqual([
      {
        repoRoot: '/repos/backend',
        file: 'openapi.yaml',
        sha: 'a'.repeat(40),
        project: 'backend',
        confidence: 'mentioned',
      },
      {
        repoRoot: '/repos/backend',
        file: 'postman_collection.json',
        sha: 'b'.repeat(40),
        project: 'backend',
        confidence: 'heuristic',
      },
    ])
    expect(index['h2']).toHaveLength(1)
    expect(index['h3']).toBeUndefined()
  })

  it('dedupes per (sha, file), upgrading heuristic → mentioned', () => {
    const dup = [
      change({ links: [{ handoffId: 'h1', confidence: 'heuristic' }] }),
      change({ links: [{ handoffId: 'h1', confidence: 'mentioned' }] }),
    ]
    const index = reverseContractLinks(dup)
    expect(index['h1']).toHaveLength(1)
    expect(index['h1']?.[0]?.confidence).toBe('mentioned')
  })

  it('mentioned chips sort before heuristic ones', () => {
    const index = reverseContractLinks([
      change({ links: [{ handoffId: 'h1', confidence: 'heuristic' }] }),
      change({
        sha: 'c'.repeat(40),
        links: [{ handoffId: 'h1', confidence: 'mentioned' }],
      }),
    ])
    expect(index['h1']?.map((c) => c.confidence)).toEqual(['mentioned', 'heuristic'])
  })
})
