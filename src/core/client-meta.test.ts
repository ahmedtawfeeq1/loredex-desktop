/**
 * Client metadata writes (reported: the fleet groups by manager and shows tag
 * chips, but nothing in the app could change either — you had to hand-edit
 * _index/products.json and _index/clients.json).
 *
 * Runs against a throwaway vault, never tests/fixtures/vault: these are WRITES,
 * and a test that dirties the shared fixture poisons every other suite.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { fleet, initEngine, setClientManager, setClientTagsFor } from './engine'

/** what the client page's pickers read — the fleet, not a bespoke IPC call */
const vocabulary = (): { managers: string[]; tags: string[] } => {
  const all = fleet()
  return {
    managers: [...new Set(all.map((c) => c.manager).filter((m): m is string => !!m))],
    tags: [...new Set(all.flatMap((c) => c.tags))],
  }
}

const ME = { name: 'Test User', email: 'test@example.com' }
const CLIENT = 'acme-co'

beforeAll(() => {
  const vault = mkdtempSync(join(tmpdir(), 'loredex-meta-vault-'))
  mkdirSync(join(vault, 'projects', CLIENT), { recursive: true })
  mkdirSync(join(vault, '_index'), { recursive: true })
  const configDir = mkdtempSync(join(tmpdir(), 'loredex-meta-config-'))
  writeFileSync(
    join(configDir, 'config.json'),
    JSON.stringify({ vaultPath: vault, sync: 'none', projects: {} }),
  )
  process.env.LOREDEX_CONFIG_DIR = configDir
  initEngine()
})

describe('assigning a client to a manager', () => {
  it('files the client, and the manager joins the picker vocabulary', () => {
    expect(setClientManager(CLIENT, 'salman-hamdy', ME)).toEqual({ manager: 'salman-hamdy' })
    expect(vocabulary().managers).toContain('salman-hamdy')
  })

  it('moves the client rather than filing it twice', () => {
    setClientManager(CLIENT, 'ahmed-essam', ME)
    const { managers } = vocabulary()
    expect(managers).toContain('ahmed-essam')
  })

  it('trims what was typed into the New manager field', () => {
    expect(setClientManager(CLIENT, '  rania-fouad  ', ME).manager).toBe('rania-fouad')
  })

  it('unassigns on null or a blank name — the Unassigned option', () => {
    expect(setClientManager(CLIENT, null, ME)).toEqual({ manager: null })
    expect(setClientManager(CLIENT, '   ', ME)).toEqual({ manager: null })
  })
})

describe('editing tags', () => {
  it('saves the set, stripping #, blanks and duplicates', () => {
    const { tags } = setClientTagsFor(CLIENT, ['#new-platform', ' vip ', '', 'vip'], ME)
    expect([...tags].sort()).toEqual(['new-platform', 'vip'])
  })

  it('replaces the whole set — removing a chip removes the tag', () => {
    setClientTagsFor(CLIENT, ['new-platform', 'vip'], ME)
    expect(setClientTagsFor(CLIENT, ['vip'], ME).tags).toEqual(['vip'])
  })

  it('accepts an empty set — a client with no tags is valid', () => {
    expect(setClientTagsFor(CLIENT, [], ME).tags).toEqual([])
  })

  it('offers every tag in the dex as a suggestion', () => {
    setClientTagsFor(CLIENT, ['old-platform'], ME)
    expect(vocabulary().tags).toContain('old-platform')
  })
})
