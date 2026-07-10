/**
 * Wizard envelope-code → message + recovery map (story 13.1 AC3/AC4, 13.2
 * AC3). Every failure gets a specific headline, one "what to do" sentence
 * (DESIGN quality floor) and a recovery affordance the modal renders; raw git
 * output stays behind a details expander, never the headline.
 */
import { isErrEnvelope } from '../../../../shared/ipc-contract'
import type { WizardFlow } from '../../../../shared/types'

export type WizardRecovery = 'retry-form' | 'open-local' | 'offer-join' | 'close'

export interface WizardFailure {
  message: string
  hint: string
  recovery: WizardRecovery
  /** the created-anyway local vault path (create flow, post-scaffold failures) */
  localVaultCreated: boolean
  gitOutput?: string
}

function failureDetail(detail: unknown): { localVaultCreated: boolean; gitOutput?: string } {
  const d = (detail ?? {}) as { localVaultCreated?: unknown; gitOutput?: unknown }
  return {
    localVaultCreated: d.localVaultCreated === true,
    ...(typeof d.gitOutput === 'string' && d.gitOutput ? { gitOutput: d.gitOutput } : {}),
  }
}

export function describeWizardFailure(err: unknown, flow: WizardFlow): WizardFailure {
  if (!isErrEnvelope(err)) {
    return {
      message: err instanceof Error ? err.message : String(err),
      hint: 'Try again.',
      recovery: 'retry-form',
      localVaultCreated: false,
    }
  }
  const detail = failureDetail(err.detail)
  const base = { message: err.message, ...detail }
  switch (err.code) {
    case 'DEST_NOT_EMPTY':
      return { ...base, hint: 'Pick a different (empty or new) folder.', recovery: 'retry-form' }
    case 'REMOTE_UNREACHABLE':
      return detail.localVaultCreated
        ? {
            ...base,
            hint: 'Open the local vault now — retry remote wiring any time from Sync settings.',
            recovery: 'open-local',
          }
        : { ...base, hint: 'Fix the URL or your git credentials, then try again.', recovery: 'retry-form' }
    case 'PUSH_REJECTED':
      return detail.localVaultCreated
        ? {
            ...base,
            hint: 'Open the local vault now — or join the remote instead of pushing over it.',
            recovery: 'open-local',
          }
        : { ...base, hint: 'Use “Join a vault” with this URL instead.', recovery: 'offer-join' }
    case 'IDENTITY_MISSING':
      return { ...base, hint: 'Set your name and email in the identity step below.', recovery: 'retry-form' }
    case 'CLONE_AUTH_FAILED':
      return { ...base, hint: 'Fix the URL or your git credentials, then try again.', recovery: 'retry-form' }
    case 'NOT_A_VAULT':
      return {
        ...base,
        hint: 'The clone was kept on disk — nothing was deleted. Check you have the right repository.',
        recovery: 'close',
      }
    default:
      return {
        ...base,
        hint: flow === 'create' ? 'Check the inputs and try again.' : 'Check the URL and try again.',
        recovery: 'retry-form',
      }
  }
}

/** Human labels for the step ids the core sequences emit (m2 §7 order). */
export const WIZARD_STEP_LABELS: Record<string, string> = {
  destination: 'Destination folder',
  preflight: 'Check remote',
  identity: 'Identity',
  scaffold: 'Scaffold vault',
  remote: 'Wire remote',
  seed: 'First sync',
  clone: 'Clone',
  validate: 'Validate vault shape',
  handshake: 'Schema handshake',
  register: 'Register vault',
  finish: 'Merge driver & first fetch',
}
