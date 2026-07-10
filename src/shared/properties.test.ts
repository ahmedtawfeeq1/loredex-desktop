/**
 * Properties model (epic20, D1 amendment 7 §C): type inference from key+value
 * and the managed-key guard the panel and the writer both trust.
 */
import { describe, expect, it } from 'vitest'
import {
  emptyValueForType,
  inferPropertyType,
  isManagedKey,
  MANAGED_FRONTMATTER_KEYS,
} from './properties'

describe('inferPropertyType', () => {
  it('arrays and the tags key are tag lists', () => {
    expect(inferPropertyType('tags', ['api', 'throttle'])).toBe('tags')
    expect(inferPropertyType('tags', undefined)).toBe('tags')
    expect(inferPropertyType('whatever', ['a'])).toBe('tags')
  })

  it('status/type/kind are selects regardless of value', () => {
    expect(inferPropertyType('status', 'active')).toBe('select')
    expect(inferPropertyType('type', 'research')).toBe('select')
    expect(inferPropertyType('kind', 'request')).toBe('select')
  })

  it('http(s) strings are urls (before the date/path rules)', () => {
    expect(inferPropertyType('link', 'https://example.dev/x')).toBe('url')
    expect(inferPropertyType('homepage', 'http://a.b')).toBe('url')
  })

  it('the date key, *_at / *_until keys, and ISO-date strings are dates', () => {
    expect(inferPropertyType('date', '2026-07-11')).toBe('date')
    expect(inferPropertyType('reviewed_at', '2026-07-11T00:00:00Z')).toBe('date')
    expect(inferPropertyType('valid_until', '2026-08-01')).toBe('date')
    expect(inferPropertyType('whenever', '2026-07-11')).toBe('date')
  })

  it('*_path / *_rel keys and slash-y no-space strings are paths', () => {
    expect(inferPropertyType('spec_path', 'docs/spec.md')).toBe('path')
    expect(inferPropertyType('doc_rel', 'a/b')).toBe('path')
    expect(inferPropertyType('ref', 'src/core/engine.ts')).toBe('path')
  })

  it('plain prose is text', () => {
    expect(inferPropertyType('objective', 'ship the properties panel')).toBe('text')
    expect(inferPropertyType('session', 'abc123')).toBe('text')
  })
})

describe('isManagedKey', () => {
  it('locks the provenance / lifecycle / schema keys', () => {
    for (const key of ['loredex', 'source_path', 'source_project', 'source_rel', 'loredex_schema'])
      expect(isManagedKey(key)).toBe(true)
    expect(MANAGED_FRONTMATTER_KEYS).toContain('consumed_by')
  })

  it('leaves user fields editable', () => {
    for (const key of ['tags', 'status', 'type', 'topic', 'project', 'date', 'objective', 'note'])
      expect(isManagedKey(key)).toBe(false)
  })
})

describe('emptyValueForType', () => {
  it('tags start as an empty array, everything else as an empty string', () => {
    expect(emptyValueForType('tags')).toEqual([])
    expect(emptyValueForType('text')).toBe('')
    expect(emptyValueForType('date')).toBe('')
  })
})
