/**
 * Windows spawn resolution. The failure this guards against is subtle: cmd.exe
 * runs fine, cannot find `npx`, and emits "is not recognized as an internal or
 * external command, operable program or batch file" — which the UI used to
 * report as a bad TOKEN, sending people to re-paste a working credential.
 */
import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { explainSpawnFailure, isCommandNotFound, widenWindowsPath } from './win-spawn'

describe('widenWindowsPath', () => {
  it('is a no-op off Windows — macOS/Linux behaviour is untouched', () => {
    const env = { PATH: '/usr/bin' }
    expect(widenWindowsPath(env, 'darwin')).toBe(env)
    expect(widenWindowsPath(env, 'linux')).toBe(env)
  })

  it('appends a per-user npm dir that exists, keeping the original PATH first', () => {
    const home = mkdtempSync(join(tmpdir(), 'loredex-winpath-'))
    const npmDir = join(home, 'AppData', 'Roaming', 'npm')
    mkdirSync(npmDir, { recursive: true })
    const out = widenWindowsPath({ PATH: 'C:\\Windows\\System32' }, 'win32', home)
    const parts = (out.PATH ?? '').split(';')
    expect(parts[0]).toBe('C:\\Windows\\System32') // never reordered
    expect(parts).toContain(npmDir)
  })

  it('never adds a directory that does not exist', () => {
    const home = mkdtempSync(join(tmpdir(), 'loredex-winpath-empty-'))
    const out = widenWindowsPath({ PATH: 'C:\\Windows\\System32' }, 'win32', home)
    expect(out.PATH).toBe('C:\\Windows\\System32')
  })

  it('does not duplicate a directory already on PATH', () => {
    const home = mkdtempSync(join(tmpdir(), 'loredex-winpath-dup-'))
    const npmDir = join(home, 'AppData', 'Roaming', 'npm')
    mkdirSync(npmDir, { recursive: true })
    const out = widenWindowsPath({ PATH: npmDir }, 'win32', home)
    expect((out.PATH ?? '').split(';').filter((p) => p === npmDir)).toHaveLength(1)
  })
})

describe('explainSpawnFailure', () => {
  it("recognises cmd.exe's message and blames PATH, not the token", () => {
    const raw = "'npx' is not recognized as an internal or external command,\noperable program or batch file."
    expect(isCommandNotFound(raw)).toBe(true)
    const msg = explainSpawnFailure(raw, 'npx', 'win32')
    expect(msg).toMatch(/PATH problem, not a token problem/)
    expect(msg).toMatch(/nodejs\.org/)
  })

  it('recognises the POSIX form too', () => {
    expect(isCommandNotFound('spawn npx ENOENT')).toBe(true)
  })

  it('passes a genuine auth failure through untouched', () => {
    const raw = '401 unauthorized — invalid token'
    expect(explainSpawnFailure(raw, 'npx', 'win32')).toBe(raw)
  })
})
