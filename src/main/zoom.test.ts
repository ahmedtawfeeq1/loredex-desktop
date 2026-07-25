/**
 * App-wide zoom. The parts worth pinning are the ones that are wrong by default:
 * the level is CLAMPED (Chrome's 25%–500%), SHARED by every window rather than
 * per-webContents, and PERSISTED so a restart and every pop-out agree with it.
 */
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

let userData = ''
const windows: { isDestroyed: () => boolean; webContents: { setZoomLevel: (n: number) => void } }[] =
  []
const levels: number[] = []

vi.mock('electron', () => ({
  app: { getPath: () => userData },
  BrowserWindow: { getAllWindows: () => windows },
}))

const mod = await import('./zoom')

function addWindow(): void {
  windows.push({
    isDestroyed: () => false,
    webContents: { setZoomLevel: (n: number) => void levels.push(n) },
  })
}

beforeEach(() => {
  userData = mkdtempSync(join(tmpdir(), 'zoom-'))
  windows.length = 0
  levels.length = 0
  mod.zoomReset()
  levels.length = 0
})

const saved = (): unknown => JSON.parse(readFileSync(join(userData, 'zoom.json'), 'utf8'))

describe('zoom level', () => {
  it('applies to EVERY open window, not just the focused one', () => {
    addWindow()
    addWindow()
    mod.zoomIn()
    expect(levels).toEqual([1, 1])
  })

  it('steps in both directions and returns to 100%', () => {
    addWindow()
    mod.zoomIn()
    mod.zoomIn()
    mod.zoomOut()
    mod.zoomReset()
    expect(levels).toEqual([1, 2, 1, 0])
  })

  it('clamps at Chrome’s bounds instead of zooming to nothing', () => {
    addWindow()
    for (let i = 0; i < 40; i++) mod.zoomOut()
    expect(levels.at(-1)).toBe(-7)
    levels.length = 0
    for (let i = 0; i < 40; i++) mod.zoomIn()
    expect(levels.at(-1)).toBe(9)
  })

  it('a no-op step neither re-applies nor rewrites the file', () => {
    addWindow()
    for (let i = 0; i < 9; i++) mod.zoomIn()
    levels.length = 0
    mod.zoomIn() // already at the ceiling
    expect(levels).toEqual([])
  })

  it('persists the level so a restart keeps it', () => {
    addWindow()
    mod.zoomIn()
    expect(saved()).toEqual({ level: 1 })
  })

  it('reads a persisted level back', () => {
    writeFileSync(join(userData, 'zoom.json'), JSON.stringify({ level: 3 }))
    mod.loadZoom()
    addWindow()
    mod.zoomIn()
    expect(levels).toEqual([4])
  })

  /** A corrupt file must never stop the app opening — 100% is always safe. */
  it('falls back to 100% on a corrupt or nonsense file', () => {
    writeFileSync(join(userData, 'zoom.json'), '{not json')
    mod.loadZoom()
    addWindow()
    mod.zoomIn()
    expect(levels).toEqual([1])

    writeFileSync(join(userData, 'zoom.json'), JSON.stringify({ level: 'huge' }))
    mod.loadZoom()
    levels.length = 0
    mod.zoomReset()
    expect(levels).toEqual([0])
  })

  it('clamps a persisted level that is out of range', () => {
    writeFileSync(join(userData, 'zoom.json'), JSON.stringify({ level: 999 }))
    mod.loadZoom()
    addWindow()
    mod.zoomOut()
    expect(levels).toEqual([8]) // clamped to 9 on load, then one step down
  })
})
