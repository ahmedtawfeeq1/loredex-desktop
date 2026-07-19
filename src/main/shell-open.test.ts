/**
 * WP-F: reveal/open ipc gate. electron's ipcMain + shell are stubbed; the
 * containment + allowlist run for real against a temp vault, so we assert the
 * exact shell call each request makes (launch vs reveal vs nothing).
 */
import { mkdirSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const handlers = new Map<string, (event: unknown, arg: unknown) => unknown>()
const shell = { showItemInFolder: vi.fn(), openPath: vi.fn(async () => '') }
vi.mock('electron', () => ({
  ipcMain: { handle: (ch: string, cb: (event: unknown, arg: unknown) => unknown) => handlers.set(ch, cb) },
  shell,
}))

let registerShellOpen: typeof import('./shell-open').registerShellOpen
let vault: string
const fakeWin = { id: 1 } as unknown as Electron.BrowserWindow
const fakeEvent = { sender: {} } as unknown as Electron.IpcMainInvokeEvent

const reveal = (rel: unknown): unknown => handlers.get('loredex:reveal-path')?.(fakeEvent, rel)
const open = (rel: unknown): unknown => handlers.get('loredex:open-path')?.(fakeEvent, rel)

beforeAll(async () => {
  ;({ registerShellOpen } = await import('./shell-open'))
  const sandbox = realpathSync(mkdtempSync(join(tmpdir(), 'loredex-shellopen-')))
  vault = join(sandbox, 'vault')
  mkdirSync(join(vault, 'projects', 'acme', 'sub'), { recursive: true })
  writeFileSync(join(vault, 'projects', 'acme', 'report.pdf'), 'x')
  writeFileSync(join(vault, 'projects', 'acme', 'run.sh'), 'x')
  // a teammate-committed symlink with an allowlisted NAME pointing at an in-vault
  // executable — the allowlist bypass the audit caught
  symlinkSync(
    join(vault, 'projects', 'acme', 'run.sh'),
    join(vault, 'projects', 'acme', 'invoice.pdf'),
  )
  mkdirSync(join(sandbox, 'outside'), { recursive: true })
  writeFileSync(join(sandbox, 'outside', 'secret.pdf'), 'x')
})

beforeEach(() => {
  handlers.clear()
  shell.showItemInFolder.mockClear()
  shell.openPath.mockClear()
})

describe('registerShellOpen (trusted root)', () => {
  const wire = (root: string | null): void =>
    registerShellOpen(
      () => fakeWin,
      () => root,
    )

  it('opens an allowlisted file in the default app', () => {
    wire(vault)
    expect(open('projects/acme/report.pdf')).toEqual({ ok: true })
    expect(shell.openPath).toHaveBeenCalledTimes(1)
    expect(shell.showItemInFolder).not.toHaveBeenCalled()
  })

  it('REVEALS (never launches) a non-allowlisted file', () => {
    wire(vault)
    expect(open('projects/acme/run.sh')).toEqual({ ok: true, revealed: true })
    expect(shell.openPath).not.toHaveBeenCalled()
    expect(shell.showItemInFolder).toHaveBeenCalledTimes(1)
  })

  it('REVEALS (never launches) a directory', () => {
    wire(vault)
    expect(open('projects/acme/sub')).toEqual({ ok: true, revealed: true })
    expect(shell.openPath).not.toHaveBeenCalled()
    expect(shell.showItemInFolder).toHaveBeenCalledTimes(1)
  })

  it('REVEALS (never launches) an allowlisted-NAME symlink to an in-vault executable', () => {
    wire(vault)
    // invoice.pdf → run.sh: the allowlist runs on the RESOLVED target (run.sh),
    // so this is revealed, not launched (the audit's ACE bypass, closed)
    expect(open('projects/acme/invoice.pdf')).toEqual({ ok: true, revealed: true })
    expect(shell.openPath).not.toHaveBeenCalled()
    expect(shell.showItemInFolder).toHaveBeenCalledTimes(1)
  })

  it('reveal shows the item in its folder', () => {
    wire(vault)
    expect(reveal('projects/acme/report.pdf')).toEqual({ ok: true })
    expect(shell.showItemInFolder).toHaveBeenCalledTimes(1)
  })

  it('rejects a path that escapes the vault — no shell call', () => {
    wire(vault)
    expect(open('../outside/secret.pdf')).toEqual({ ok: false })
    expect(shell.openPath).not.toHaveBeenCalled()
    expect(shell.showItemInFolder).not.toHaveBeenCalled()
  })

  it('rejects everything when no vault root is bound yet', () => {
    wire(null)
    expect(open('projects/acme/report.pdf')).toEqual({ ok: false })
    expect(reveal('projects/acme/report.pdf')).toEqual({ ok: false })
    expect(shell.openPath).not.toHaveBeenCalled()
    expect(shell.showItemInFolder).not.toHaveBeenCalled()
  })
})
