/**
 * The fleet-wide staged-edits scan. Two things matter most:
 *   - it must NEVER claim an edit is unpushed when nothing recorded a push —
 *     `unknown` is the honest answer, and this view exists to stop the guessing,
 *   - it must read both the genudo MCP's CURRENT convention and the proposed
 *     one, so it works today and keeps working after they adopt.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { dateFromName, pipelineFromName, readState, scanStagedEdits } from './staged-edits'

let vault: string
const client = (name: string): string => join(vault, 'projects', name)

function stage(clientName: string, batch: string, version: string, files: string[]): string {
  const dir = join(client(clientName), 'instructions-updates', batch, version)
  mkdirSync(dir, { recursive: true })
  for (const f of files) writeFileSync(join(dir, f), 'x')
  return dir
}

beforeEach(() => {
  vault = mkdtempSync(join(tmpdir(), 'loredex-staged-'))
  mkdirSync(join(vault, 'projects'), { recursive: true })
})

describe('state — honest about what it cannot know', () => {
  it('is `unknown` when nothing records a push, NOT `staged`', () => {
    const dir = stage('acme', 'main_2026-07-15', 'v1', ['instructions.md'])
    // this is the situation across the whole live fleet today
    expect(readState(dir)).toBe('unknown')
  })

  it('reads `pushed` from manifest.json when the MCP writes one', () => {
    const dir = stage('acme', 'main_2026-07-15', 'v1', [])
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ state: 'pushed' }))
    expect(readState(dir)).toBe('pushed')
  })

  it('falls back to the CHANGES.md status line — the human-facing half', () => {
    const dir = stage('acme', 'main_2026-07-15', 'v1', [])
    writeFileSync(join(dir, 'CHANGES.md'), '# x\n**Status:** PUSHED · 2026-07-20 14:41 UTC\n')
    expect(readState(dir)).toBe('pushed')
  })

  it('stays `unknown` on a malformed manifest rather than guessing', () => {
    const dir = stage('acme', 'main_2026-07-15', 'v1', [])
    writeFileSync(join(dir, 'manifest.json'), '{not json')
    expect(readState(dir)).toBe('unknown')
  })
})

describe('scan', () => {
  it('finds the CURRENT genudo convention (instructions-updates/)', () => {
    stage('acme', 'hazem-tech_2026-07-20', 'v2', ['a.md', 'b.md'])
    const r = scanStagedEdits(vault)
    expect(r.edits).toHaveLength(1)
    expect(r.edits[0]).toMatchObject({
      client: 'acme',
      version: 'v2',
      pipeline: 'hazem-tech',
      when: '2026-07-20',
      fileCount: 2,
      state: 'unknown',
    })
  })

  it('also finds the PROPOSED convention (pipelines/<unit>/versions/)', () => {
    const dir = join(client('acme'), 'pipelines', 'hazem-tech', 'versions', 'v01_2026-07-21')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'manifest.json'), JSON.stringify({ state: 'staged' }))
    const r = scanStagedEdits(vault)
    expect(r.edits[0]).toMatchObject({ pipeline: 'hazem-tech', state: 'staged' })
    expect(r.manifestsPresent).toBe(true)
  })

  it('reports clientsScanned so "3 of 67" is meaningful', () => {
    for (const c of ['a', 'b', 'c']) mkdirSync(client(c), { recursive: true })
    stage('a', 'p_2026-07-20', 'v1', [])
    const r = scanStagedEdits(vault)
    expect(r.clientsScanned).toBe(3)
    expect(r.edits).toHaveLength(1)
  })

  it('sorts newest first', () => {
    stage('acme', 'p_2026-07-15', 'v1', [])
    stage('acme', 'p_2026-07-21', 'v1', [])
    expect(scanStagedEdits(vault).edits.map((e) => e.when)).toEqual(['2026-07-21', '2026-07-15'])
  })

  it('is empty and does not throw on a dex with no clients at all', () => {
    expect(scanStagedEdits(vault)).toMatchObject({ edits: [], manifestsPresent: false })
  })
})

describe('name parsing', () => {
  it('pulls the date and pipeline out of the folder name', () => {
    expect(dateFromName('hazem-tech_2026-07-20')).toBe('2026-07-20')
    expect(pipelineFromName('hazem-tech_2026-07-20')).toBe('hazem-tech')
    expect(pipelineFromName('v2')).toBeNull() // no date to split on
  })
})
