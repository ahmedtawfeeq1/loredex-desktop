import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  BUNDLED_GENUDO_PLUGIN_VERSION,
  GENUDO_PLUGIN_FILES,
  getGenudoPluginStatus,
  installGenudoPlugin,
  isGenudoPluginInstalled,
} from './genudo-plugin-bundle'

describe('genudo-plugin-bundle', () => {
  let tmp: string

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'genudo-plugin-test-'))
  })

  afterEach(() => {
    try {
      rmSync(tmp, { recursive: true, force: true })
    } catch {
      // ignore
    }
  })

  it('declares version 1.0.0 and bundles all 7 official files (skills, rules, manifest)', () => {
    expect(BUNDLED_GENUDO_PLUGIN_VERSION).toBe('1.0.0')
    const files = Object.keys(GENUDO_PLUGIN_FILES)
    expect(files).toContain('plugin.json')
    expect(files).not.toContain('mcp_config.json')
    expect(files).toContain('rules/genudo-conventions.md')
    expect(files).toContain('skills/pipeline-management/SKILL.md')
    expect(files).toContain('skills/knowledge-tables/SKILL.md')
    expect(files).toContain('skills/messaging-operations/SKILL.md')
    expect(files).toContain('skills/stage-followups/SKILL.md')
    expect(files).toContain('README.md')
    expect(files.length).toBe(7)
  })

  it('detects uninstalled state accurately', () => {
    expect(isGenudoPluginInstalled(tmp)).toBe(false)
    const status = getGenudoPluginStatus(tmp)
    expect(status.installed).toBe(false)
    expect(status.version).toBeNull()
    expect(status.bundledVersion).toBe('1.0.0')
  })

  it('installs all files to the target directory and reports installed, purging any legacy mcp_config.json', () => {
    // Seed a legacy mcp_config.json to ensure it gets purged
    const legacyMcp = join(tmp, 'mcp_config.json')
    writeFileSync(legacyMcp, '{}')

    const res = installGenudoPlugin(tmp)
    expect(res.ok).toBe(true)
    expect(res.files.length).toBe(Object.keys(GENUDO_PLUGIN_FILES).length)

    expect(isGenudoPluginInstalled(tmp)).toBe(true)
    const status = getGenudoPluginStatus(tmp)
    expect(status.installed).toBe(true)
    expect(status.version).toBe('1.0.0')

    // Verify key files exist on disk
    expect(existsSync(join(tmp, 'plugin.json'))).toBe(true)
    expect(existsSync(join(tmp, 'rules', 'genudo-conventions.md'))).toBe(true)
    expect(existsSync(join(tmp, 'skills', 'pipeline-management', 'SKILL.md'))).toBe(true)

    // Verify mcp_config.json was purged to prevent duplicate genudo_genudo server
    expect(existsSync(legacyMcp)).toBe(false)
  })
})
