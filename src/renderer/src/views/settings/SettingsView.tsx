/** Settings view (story 3.4): identity profile. More sections arrive with their stories. */
import { IdentityForm } from './IdentityForm'

export function SettingsView(): React.JSX.Element {
  return (
    <div className="settings">
      <div className="board-header">
        <span className="pane-list-title">Settings</span>
      </div>
      <IdentityForm />
    </div>
  )
}
