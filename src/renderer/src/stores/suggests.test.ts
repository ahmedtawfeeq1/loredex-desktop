/**
 * Story 12.2 AC4/AC5: Apply payload correctness — a suggestion rides the
 * ORDINARY writer channels (consumed → handoffs.consume, the lib's one
 * consume writer; accepted → handoffs.setStatus). The store adds/dedupes
 * suggestions; nothing writes without apply()/dismiss() being called.
 */
import { describe, expect, it } from 'vitest'
import { applyChannel, suggestionKey, useSuggests } from './suggests'

describe('applyChannel (the Apply → writer-channel routing)', () => {
  it('consumed rides handoffs.consume — setHandoffStatus has no consumed arm', () => {
    expect(applyChannel('consumed')).toBe('handoffs.consume')
  })
  it('accepted rides handoffs.setStatus', () => {
    expect(applyChannel('accepted')).toBe('handoffs.setStatus')
  })
})

describe('suggestion stack', () => {
  it('adds and dedupes by handoffId:sha; reset clears', () => {
    const s = { handoffId: 'h1', suggested: 'consumed' as const, sha: 'a'.repeat(40) }
    useSuggests.getState().add(s)
    useSuggests.getState().add({ ...s, prUrl: 'https://github.com/x/y/pull/1' })
    expect(useSuggests.getState().suggestions).toHaveLength(1)
    expect(suggestionKey(s)).toBe(`h1:${'a'.repeat(40)}`)
    useSuggests.getState().add({ ...s, sha: 'b'.repeat(40) })
    expect(useSuggests.getState().suggestions).toHaveLength(2)
    useSuggests.getState().reset()
    expect(useSuggests.getState().suggestions).toEqual([])
  })
})
