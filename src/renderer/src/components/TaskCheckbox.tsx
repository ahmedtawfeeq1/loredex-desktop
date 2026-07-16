/**
 * Interactive checklist checkbox. The reader (NoteArticle) provides a toggle
 * handler via TasksContext; everywhere else renderMarkdown runs without one
 * (previews, briefs) the checkbox stays the inert GFM default. The handler
 * receives the task's document-order index (stamped on the parent <li> by
 * remarkTaskIndexes) and the DESIRED state; the note file is the only truth —
 * local state is just optimism until the reload re-renders from disk.
 */
import { createContext, useContext, useEffect, useState } from 'react'

export type TaskToggle = (index: number, checked: boolean) => void

export const TasksContext = createContext<TaskToggle | null>(null)

export function MarkdownTaskCheckbox(
  props: React.InputHTMLAttributes<HTMLInputElement>,
): React.JSX.Element {
  const onToggle = useContext(TasksContext)
  const [checked, setChecked] = useState(Boolean(props.checked))
  useEffect(() => setChecked(Boolean(props.checked)), [props.checked])
  if (props.type !== 'checkbox' || !onToggle) return <input {...props} readOnly />
  return (
    <input
      type="checkbox"
      className="task-checkbox"
      checked={checked}
      onChange={(e) => {
        const li = e.currentTarget.closest('li[data-task-index]')
        if (!li) return
        setChecked(e.currentTarget.checked)
        onToggle(Number(li.getAttribute('data-task-index')), e.currentTarget.checked)
      }}
    />
  )
}
