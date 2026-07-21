/**
 * The two properties that let loredex and the genudo MCP write the same folder
 * without destroying each other's work:
 *
 *   1. a refresh deletes only what the pull OWNS — never `versions/`, whose
 *      CHANGES.md records why a change was made and cannot be reconstructed
 *      from the platform,
 *   2. identical platform input produces byte-identical files, so a refresh over
 *      an already-current mirror is a zero-line diff rather than churn.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { orderedEntries, planFiles, toYaml, writePlan } from './genudo-pull'

const PIPELINE = {
  id: 111,
  name: 'Hazem tech',
  persona: '## Identity\n- Agent: Khaled',
  instructions: '## Your Role\nYou are Khaled.',
  model_temperature: 0.3,
  status: 'active',
}
const STAGES = [
  {
    id: 756,
    name: 'New Lead',
    order: 0,
    instructions: '## Goal\nGreet and qualify.',
    enter_condition: '- first message\n- returning lead\n',
  },
]
const BUNDLE = [{ pipeline: PIPELINE, stages: STAGES, actions: [], variables: [] }]

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'loredex-pull-'))
})

describe('writePlan — deletes only what it owns', () => {
  it("never removes versions/ — the genudo MCP's snapshots and CHANGES.md survive", () => {
    const versionDir = join(dir, 'pipelines', 'hazem-tech', 'versions', 'v01_2026-07-20')
    mkdirSync(versionDir, { recursive: true })
    writeFileSync(join(versionDir, 'CHANGES.md'), '# why this change\nExpected impact: …')

    writePlan(dir, planFiles('acme', BUNDLE as never))

    // the one artifact a re-pull cannot reconstruct
    expect(existsSync(join(versionDir, 'CHANGES.md'))).toBe(true)
    expect(readFileSync(join(versionDir, 'CHANGES.md'), 'utf8')).toContain('Expected impact')
  })

  it('leaves any other tool’s files in the unit folder alone', () => {
    const unit = join(dir, 'pipelines', 'hazem-tech')
    mkdirSync(unit, { recursive: true })
    writeFileSync(join(unit, 'README.md'), 'team notes')
    writeFileSync(join(unit, 'manifest.json'), '{}')

    writePlan(dir, planFiles('acme', BUNDLE as never))

    expect(existsSync(join(unit, 'README.md'))).toBe(true)
    expect(existsSync(join(unit, 'manifest.json'))).toBe(true)
  })

  it('DOES remove a stage that no longer exists upstream', () => {
    const gone = join(dir, 'pipelines', 'hazem-tech', 'stages', '09_deleted-upstream')
    mkdirSync(gone, { recursive: true })
    writeFileSync(join(gone, '_instructions.md'), 'stale')

    writePlan(dir, planFiles('acme', BUNDLE as never))

    // stages are regenerated wholesale — a stale stage folder would be a lie
    expect(existsSync(gone)).toBe(false)
    expect(
      readdirSync(join(dir, 'pipelines', 'hazem-tech', 'stages')).sort(),
    ).toEqual(['00_new-lead'])
  })

  it('replaces its own field files rather than leaving a stale copy', () => {
    const unit = join(dir, 'pipelines', 'hazem-tech')
    mkdirSync(unit, { recursive: true })
    writeFileSync(join(unit, '_persona.md'), 'OLD PERSONA')

    writePlan(dir, planFiles('acme', BUNDLE as never))

    expect(readFileSync(join(unit, '_persona.md'), 'utf8')).toContain('Khaled')
    expect(readFileSync(join(unit, '_persona.md'), 'utf8')).not.toContain('OLD PERSONA')
  })
})

describe('idempotence — identical input, byte-identical output', () => {
  it('a second pull over the same data changes nothing on disk', () => {
    writePlan(dir, planFiles('acme', BUNDLE as never))
    const snapshot = (): Record<string, string> => {
      const out: Record<string, string> = {}
      const walk = (d: string, prefix = ''): void => {
        for (const e of readdirSync(d, { withFileTypes: true })) {
          const rel = prefix ? `${prefix}/${e.name}` : e.name
          if (e.isDirectory()) walk(join(d, e.name), rel)
          else out[rel] = readFileSync(join(d, e.name), 'utf8')
        }
      }
      walk(dir)
      return out
    }
    const first = snapshot()
    writePlan(dir, planFiles('acme', BUNDLE as never))
    expect(snapshot()).toEqual(first)
  })

  it('key order does not depend on how the API happened to order its JSON', () => {
    const a = toYaml({ status: 'active', id: 111, name: 'X', zeta: 1, alpha: 2 })
    const b = toYaml({ alpha: 2, zeta: 1, name: 'X', status: 'active', id: 111 })
    expect(a).toBe(b)
  })

  it('puts identity first, then alphabetical — readable AND deterministic', () => {
    expect(orderedEntries({ zeta: 1, name: 'X', alpha: 2, id: 7 }).map(([k]) => k)).toEqual([
      'id',
      'name',
      'alpha',
      'zeta',
    ])
  })
})

describe('formatting', () => {
  it('multi-line prose is a block scalar, so a one-bullet edit is a one-line diff', () => {
    const yaml = toYaml({ enter_condition: '- first message\n- returning lead' })
    expect(yaml).toContain('enter_condition: |-')
    expect(yaml).toContain('  - first message')
    expect(yaml).not.toContain('\\n') // never an escaped one-liner
  })
})
