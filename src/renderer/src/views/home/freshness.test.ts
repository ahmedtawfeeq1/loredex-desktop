/** Story 2.5: freshness badge formatting. */
import { describe, expect, it } from 'vitest'
import { formatFreshness } from './freshness'

const NOW = new Date('2026-07-09T12:00:00Z')

describe('formatFreshness', () => {
  it('same-day brief is fresh and quiet', () => {
    expect(formatFreshness('2026-07-09T08:00:00Z', NOW)).toEqual({
      label: 'curated today',
      tone: 'fresh',
    })
  })
  it('1–6 days is aging (amber attention)', () => {
    expect(formatFreshness('2026-07-08T08:00:00Z', NOW)).toEqual({
      label: 'curated 1d ago',
      tone: 'aging',
    })
    expect(formatFreshness('2026-07-03T08:00:00Z', NOW).tone).toBe('aging')
  })
  it('7+ days is stale (rust)', () => {
    expect(formatFreshness('2026-07-01T08:00:00Z', NOW)).toEqual({
      label: 'curated 8d ago',
      tone: 'stale',
    })
  })
  it('no mtime = live-rendered brief, flagged for attention', () => {
    const f = formatFreshness(null, NOW)
    expect(f.tone).toBe('aging')
    expect(f.label).toContain('rendered live')
  })
})
