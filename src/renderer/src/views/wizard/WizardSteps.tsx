/**
 * Wizard progress list (stories 13.1/13.2): one row per wizard.progress step,
 * DESIGN stamp-adjacent status chips — running gold, done ok, warn/failed
 * rust (warn continues, failed stops). Details render mono under the row.
 */
import type { WizardStepRow } from '../../stores/wizard'
import { WIZARD_STEP_LABELS } from './wizard-errors'

export function WizardSteps({ steps }: { steps: WizardStepRow[] }): React.JSX.Element {
  return (
    <ol className="wizard-steps" aria-label="Progress">
      {steps.map((row) => (
        <li key={row.step} className="wizard-step" data-status={row.status}>
          <span className="wizard-step-dot" aria-hidden="true" />
          <div className="wizard-step-body">
            <span className="wizard-step-label">
              {WIZARD_STEP_LABELS[row.step] ?? row.step}
              <span className="wizard-step-status">
                {row.status === 'running'
                  ? 'working…'
                  : row.status === 'done'
                    ? 'done'
                    : row.status === 'warn'
                      ? 'warning'
                      : 'failed'}
              </span>
            </span>
            {row.detail && <span className="wizard-step-detail mono">{row.detail}</span>}
          </div>
        </li>
      ))}
    </ol>
  )
}
