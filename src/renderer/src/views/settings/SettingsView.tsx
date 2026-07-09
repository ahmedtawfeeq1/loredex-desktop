/** Settings view (story 3.4): identity profile; MCP host section (story 1.6). */
import { IdentityForm } from './IdentityForm'
import { McpSection } from './McpSection'

export function SettingsView(): React.JSX.Element {
  return (
    <div className="settings">
      <div className="board-header">
        <span className="pane-list-title">Settings</span>
      </div>
      <IdentityForm />
      <McpSection />
    </div>
  )
}
