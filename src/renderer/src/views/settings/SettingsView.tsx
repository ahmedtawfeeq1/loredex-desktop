/**
 * Settings view (story 3.4): identity profile; MCP host section (story 1.6);
 * appearance (story 14.1). One gold primary per view: Save identity — the MCP
 * save is a navy-outline secondary.
 */
import { IdentityForm } from './IdentityForm'
import { McpSection } from './McpSection'
import { ThemeSection } from './ThemeSection'

export function SettingsView(): React.JSX.Element {
  return (
    <div className="settings">
      <div className="board-header">
        <span className="pane-list-title">Settings</span>
      </div>
      <ThemeSection />
      <IdentityForm />
      <McpSection />
    </div>
  )
}
