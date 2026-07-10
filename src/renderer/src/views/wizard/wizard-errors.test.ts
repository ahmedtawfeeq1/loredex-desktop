/**
 * Story 13.1 AC3/AC4 (+13.2 AC3): every wizard failure code maps to a specific
 * message, a "what to do" hint, and the right recovery affordance — including
 * the intact-local-vault path after scaffold.
 */
import { describe, expect, it } from 'vitest'
import { ipcError } from '../../../../shared/ipc-contract'
import { describeWizardFailure } from './wizard-errors'

describe('describeWizardFailure', () => {
  it('DEST_NOT_EMPTY → retry with a different folder', () => {
    const f = describeWizardFailure(
      ipcError('DEST_NOT_EMPTY', 'that folder already has files in it', {
        localVaultCreated: false,
      }),
      'create',
    )
    expect(f.recovery).toBe('retry-form')
    expect(f.localVaultCreated).toBe(false)
  })

  it('REMOTE_UNREACHABLE pre-scaffold → retry-form; post-scaffold → open-local', () => {
    const pre = describeWizardFailure(
      ipcError('REMOTE_UNREACHABLE', 'could not reach', { localVaultCreated: false }),
      'create',
    )
    expect(pre.recovery).toBe('retry-form')
    const post = describeWizardFailure(
      ipcError('REMOTE_UNREACHABLE', 'push failed', {
        localVaultCreated: true,
        gitOutput: 'fatal: auth',
      }),
      'create',
    )
    expect(post.recovery).toBe('open-local')
    expect(post.localVaultCreated).toBe(true)
    expect(post.gitOutput).toBe('fatal: auth')
    expect(post.hint).toContain('Sync settings')
  })

  it('PUSH_REJECTED before writes offers the join flow instead', () => {
    const f = describeWizardFailure(
      ipcError('PUSH_REJECTED', 'remote has commits', { localVaultCreated: false }),
      'create',
    )
    expect(f.recovery).toBe('offer-join')
  })

  it('IDENTITY_MISSING points at the identity step', () => {
    const f = describeWizardFailure(ipcError('IDENTITY_MISSING', 'set your name'), 'create')
    expect(f.recovery).toBe('retry-form')
    expect(f.hint).toContain('identity')
  })

  it('CLONE_AUTH_FAILED retries the form; NOT_A_VAULT closes and keeps the clone', () => {
    expect(describeWizardFailure(ipcError('CLONE_AUTH_FAILED', 'x'), 'join').recovery).toBe(
      'retry-form',
    )
    const nav = describeWizardFailure(ipcError('NOT_A_VAULT', 'not a vault'), 'join')
    expect(nav.recovery).toBe('close')
    expect(nav.hint).toContain('kept')
  })

  it('non-envelope errors degrade honestly', () => {
    const f = describeWizardFailure(new Error('boom'), 'create')
    expect(f.message).toBe('boom')
    expect(f.recovery).toBe('retry-form')
  })
})
