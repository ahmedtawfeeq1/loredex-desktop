/**
 * Story 15.1 — the dev ABI shim MUST stay inert everywhere except an Electron
 * process with a staged binary: vitest runs plain node, so a wrong `true`
 * here would point better-sqlite3 at an Electron-ABI binary and kill the
 * suite; a wrong `false` in dev resurrects the crash-loop.
 */
import { describe, expect, it } from 'vitest'
import { electronNativeBinding } from './native-binding'

const asVersions = (v: Record<string, string>) => v as unknown as NodeJS.ProcessVersions

describe('electronNativeBinding', () => {
  it('is undefined under plain node (vitest ABI stays default)', () => {
    expect(electronNativeBinding(asVersions({ node: '20.0.0' }), () => true)).toBeUndefined()
  })

  it('returns the staged path under Electron when the staging dir exists', () => {
    const seen: string[] = []
    const result = electronNativeBinding(asVersions({ node: '22.0.0', electron: '43.1.0' }), (p) => {
      seen.push(p)
      return true
    })
    expect(result).toBeDefined()
    expect(result).toMatch(/\.loredex-natives\/electron\/better_sqlite3\.node$/)
    expect(seen).toEqual([result])
  })

  it('is undefined under Electron without a staged binary (packaged app → default lookup)', () => {
    expect(
      electronNativeBinding(asVersions({ node: '22.0.0', electron: '43.1.0' }), () => false),
    ).toBeUndefined()
  })
})
