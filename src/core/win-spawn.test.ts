/**
 * Windows spawn resolution. The failure this guards against is subtle: cmd.exe
 * runs fine, cannot find `npx`, and emits "is not recognized as an internal or
 * external command, operable program or batch file" — which the UI used to
 * report as a bad TOKEN, sending people to re-paste a working credential.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  explainSpawnFailure,
  isCommandNotFound,
  withResolvedNpx,
  resolveNpx,
  widenNodePath,
} from './win-spawn'

describe('widenNodePath', () => {
  it('POSIX: appends an existing per-user Node dir (nvm), keeping PATH first', () => {
    const home = mkdtempSync(join(tmpdir(), 'loredex-nodepath-'))
    const nvmBin = join(home, '.nvm', 'versions', 'node', 'v20.20.1', 'bin')
    mkdirSync(nvmBin, { recursive: true })
    const out = widenNodePath({ PATH: '/usr/bin:/bin' }, 'darwin', home)
    const parts = (out.PATH ?? '').split(':')
    expect(parts[0]).toBe('/usr/bin') // never reordered
    expect(parts).toContain(nvmBin)
  })

  it('POSIX: unchanged when the only candidates are already on PATH or absent', () => {
    const home = mkdtempSync(join(tmpdir(), 'loredex-nodepath-empty-'))
    // the two absolute system dirs candidateDirs might find are already present,
    // and nvm/volta/asdf do not exist in this tmp home → nothing to append
    const env = { PATH: '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin', X: '1' }
    expect(widenNodePath(env, 'darwin', home)).toBe(env)
  })

  it('appends a per-user npm dir that exists, keeping the original PATH first', () => {
    const home = mkdtempSync(join(tmpdir(), 'loredex-winpath-'))
    const npmDir = join(home, 'AppData', 'Roaming', 'npm')
    mkdirSync(npmDir, { recursive: true })
    const out = widenNodePath({ PATH: 'C:\\Windows\\System32' }, 'win32', home)
    const parts = (out.PATH ?? '').split(';')
    expect(parts[0]).toBe('C:\\Windows\\System32') // never reordered
    expect(parts).toContain(npmDir)
  })

  it('never adds a directory that does not exist', () => {
    const home = mkdtempSync(join(tmpdir(), 'loredex-winpath-empty-'))
    const out = widenNodePath({ PATH: 'C:\\Windows\\System32' }, 'win32', home)
    expect(out.PATH).toBe('C:\\Windows\\System32')
  })

  it('does not duplicate a directory already on PATH', () => {
    const home = mkdtempSync(join(tmpdir(), 'loredex-winpath-dup-'))
    const npmDir = join(home, 'AppData', 'Roaming', 'npm')
    mkdirSync(npmDir, { recursive: true })
    const out = widenNodePath({ PATH: npmDir }, 'win32', home)
    expect((out.PATH ?? '').split(';').filter((p) => p === npmDir)).toHaveLength(1)
  })

  /**
   * Windows spells it `Path`, not `PATH`, and that is what `process.env`
   * enumerates. Spreading it into a plain object and then setting `PATH` leaves
   * BOTH keys in the object, so the environment block handed to CreateProcess
   * has two PATH entries and the un-widened one can win — which made the whole
   * widening a silent no-op on the machines that needed it most.
   */
  it('replaces the existing PATH key whatever its casing — never leaves two', () => {
    const home = mkdtempSync(join(tmpdir(), 'loredex-winpath-case-'))
    const npmDir = join(home, 'AppData', 'Roaming', 'npm')
    mkdirSync(npmDir, { recursive: true })
    const out = widenNodePath({ Path: 'C:\\Windows\\System32' }, 'win32', home)
    const pathKeys = Object.keys(out).filter((k) => k.toLowerCase() === 'path')
    expect(pathKeys).toHaveLength(1)
    const value = out[pathKeys[0] as string] ?? ''
    expect(value.split(';')[0]).toBe('C:\\Windows\\System32')
    expect(value.split(';')).toContain(npmDir)
  })

  it('leaves unrelated variables alone', () => {
    const home = mkdtempSync(join(tmpdir(), 'loredex-winpath-other-'))
    mkdirSync(join(home, 'AppData', 'Roaming', 'npm'), { recursive: true })
    const out = widenNodePath({ Path: 'C:\\', GENUDO_TOKEN: 'abc' }, 'win32', home)
    expect(out.GENUDO_TOKEN).toBe('abc')
  })
})

describe('resolveNpx', () => {
  it('returns the absolute npx.cmd when it exists, so PATH lookup is skipped', () => {
    const home = mkdtempSync(join(tmpdir(), 'loredex-npx-'))
    const npmDir = join(home, 'AppData', 'Roaming', 'npm')
    mkdirSync(npmDir, { recursive: true })
    writeFileSync(join(npmDir, 'npx.cmd'), '@echo off')
    expect(resolveNpx({}, 'win32', home)).toBe(join(npmDir, 'npx.cmd'))
  })

  it('is null when Node is genuinely absent — nothing to point cmd at', () => {
    const home = mkdtempSync(join(tmpdir(), 'loredex-npx-none-'))
    expect(resolveNpx({}, 'win32', home)).toBeNull()
  })

  it('prefers a directory already on PATH over the guessed locations', () => {
    const home = mkdtempSync(join(tmpdir(), 'loredex-npx-pref-'))
    const onPath = join(home, 'custom')
    const guessed = join(home, 'AppData', 'Roaming', 'npm')
    mkdirSync(onPath, { recursive: true })
    mkdirSync(guessed, { recursive: true })
    writeFileSync(join(onPath, 'npx.cmd'), '@echo off')
    writeFileSync(join(guessed, 'npx.cmd'), '@echo off')
    expect(resolveNpx({ Path: onPath }, 'win32', home)).toBe(join(onPath, 'npx.cmd'))
  })

  it('resolves npx on POSIX — the nvm bin is checked ahead of system dirs', () => {
    const home = mkdtempSync(join(tmpdir(), 'loredex-npx-posix-'))
    const nvmBin = join(home, '.nvm', 'versions', 'node', 'v20.20.1', 'bin')
    mkdirSync(nvmBin, { recursive: true })
    writeFileSync(join(nvmBin, 'npx'), '#!/bin/sh')
    // nvm is first in candidateDirs, so this wins over any /usr/local/bin/npx
    // that happens to exist on the machine running the test
    expect(resolveNpx({}, 'darwin', home)).toBe(join(nvmBin, 'npx'))
  })
})

describe('explainSpawnFailure', () => {
  it("recognises cmd.exe's message and blames PATH, not the token", () => {
    const raw = "'npx' is not recognized as an internal or external command,\noperable program or batch file."
    expect(isCommandNotFound(raw)).toBe(true)
    // an empty home, so this asserts the message rather than the dev machine
    const msg = explainSpawnFailure(raw, 'npx', 'win32', mkdtempSync(join(tmpdir(), 'lx-')), {})
    expect(msg).toMatch(/not a token problem/)
    expect(msg).toMatch(/nodejs\.org/)
  })

  it('recognises the POSIX form too', () => {
    expect(isCommandNotFound('spawn npx ENOENT')).toBe(true)
  })

  it('POSIX: blames PATH, never the credentials, and never says "token"', () => {
    // the word "token" must not appear — the client card keys its "re-paste
    // token" hint off that word, and this failure is never about the credential
    const home = mkdtempSync(join(tmpdir(), 'loredex-exp-posix-'))
    const msg = explainSpawnFailure('spawn npx ENOENT', 'npx', 'darwin', home, {})
    expect(msg).toMatch(/PATH problem/)
    expect(msg).not.toMatch(/token/i)
  })

  it('passes a genuine auth failure through untouched', () => {
    const raw = '401 unauthorized — invalid token'
    expect(explainSpawnFailure(raw, 'npx', 'win32')).toBe(raw)
  })
})

describe('withResolvedNpx', () => {
  it('substitutes the absolute npx.cmd into a cmd /c invocation', () => {
    const home = mkdtempSync(join(tmpdir(), 'loredex-wrn-'))
    const npmDir = join(home, 'AppData', 'Roaming', 'npm')
    mkdirSync(npmDir, { recursive: true })
    writeFileSync(join(npmDir, 'npx.cmd'), '@echo off')
    const out = withResolvedNpx(
      { command: 'cmd', args: ['/c', 'npx', '-y', 'genudo-mcp-client'] },
      {},
      'win32',
      home,
    )
    expect(out.args).toEqual(['/c', join(npmDir, 'npx.cmd'), '-y', 'genudo-mcp-client'])
  })

  it('is unchanged when nothing is found, so the caller still gets the real error', () => {
    const home = mkdtempSync(join(tmpdir(), 'loredex-wrn-none-'))
    const safe = { command: 'cmd', args: ['/c', 'npx', '-y', 'x'] }
    expect(withResolvedNpx(safe, {}, 'win32', home)).toEqual(safe)
  })

  it('leaves a non-npx command alone', () => {
    const home = mkdtempSync(join(tmpdir(), 'loredex-wrn-other-'))
    const safe = { command: 'cmd', args: ['/c', 'uvx', 'thing'] }
    expect(withResolvedNpx(safe, {}, 'win32', home)).toEqual(safe)
  })

  it('POSIX: rewrites the command itself to the absolute npx', () => {
    const home = mkdtempSync(join(tmpdir(), 'loredex-wrn-posix-'))
    const nvmBin = join(home, '.nvm', 'versions', 'node', 'v20.20.1', 'bin')
    mkdirSync(nvmBin, { recursive: true })
    writeFileSync(join(nvmBin, 'npx'), '#!/bin/sh')
    const out = withResolvedNpx({ command: 'npx', args: ['-y', 'x'] }, {}, 'darwin', home)
    expect(out.command).toBe(join(nvmBin, 'npx'))
    expect(out.args).toEqual(['-y', 'x'])
  })

  it('POSIX: leaves a non-npx command alone', () => {
    const safe = { command: 'uvx', args: ['thing'] }
    expect(withResolvedNpx(safe, {}, 'darwin', mkdtempSync(join(tmpdir(), 'lx-')))).toBe(safe)
  })
})

describe('explainSpawnFailure — telling the two Windows cases apart', () => {
  const NOT_FOUND = "'npx' is not recognized as an internal or external command"

  it('says Node is not installed when nothing is found anywhere', () => {
    const home = mkdtempSync(join(tmpdir(), 'loredex-exp-none-'))
    const msg = explainSpawnFailure(NOT_FOUND, 'npx', 'win32', home, {})
    expect(msg).toMatch(/Node\.js is not installed on this computer/)
    expect(msg).toMatch(/not a token problem/)
  })

  it('says so, with the path, when npx IS present but would not start', () => {
    const home = mkdtempSync(join(tmpdir(), 'loredex-exp-found-'))
    const npmDir = join(home, 'AppData', 'Roaming', 'npm')
    mkdirSync(npmDir, { recursive: true })
    writeFileSync(join(npmDir, 'npx.cmd'), '@echo off')
    const msg = explainSpawnFailure(NOT_FOUND, 'npx', 'win32', home, {})
    expect(msg).toContain(join(npmDir, 'npx.cmd'))
    expect(msg).not.toMatch(/not installed on this computer/)
  })
})
