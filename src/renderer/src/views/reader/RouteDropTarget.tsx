/**
 * Reader drop target (story 7.4 AC2): dropping a markdown file offers the
 * route flow. The drop is the user's consent for that ONE file (NFR12); the
 * real path comes from preload webUtils, never a renderer fs call.
 */
import { useState } from 'react'
import { pathForFile } from '../../api'
import { useRoute } from '../../stores/route'
import { useToasts } from '../../stores/toasts'

const hasFiles = (e: React.DragEvent): boolean =>
  Array.from(e.dataTransfer.types).includes('Files')

export function RouteDropTarget({ children }: { children: React.ReactNode }): React.JSX.Element {
  // dragenter/leave fire per child element — a depth counter keeps the overlay stable
  const [depth, setDepth] = useState(0)

  return (
    <div
      className="drop-target"
      onDragEnter={(e) => {
        if (hasFiles(e)) setDepth((d) => d + 1)
      }}
      onDragLeave={(e) => {
        if (hasFiles(e)) setDepth((d) => Math.max(0, d - 1))
      }}
      onDragOver={(e) => {
        if (hasFiles(e)) e.preventDefault() // allow the drop
      }}
      onDrop={(e) => {
        if (!hasFiles(e)) return
        e.preventDefault()
        setDepth(0)
        const file = e.dataTransfer.files[0]
        if (!file) return
        const path = pathForFile(file)
        if (!path.endsWith('.md')) {
          useToasts.getState().push('Cannot route this file', 'only markdown (.md) files route')
          return
        }
        void useRoute.getState().startWithFile(path)
      }}
    >
      {children}
      {depth > 0 && (
        <div className="drop-overlay" aria-hidden>
          <p>Drop to route into the vault</p>
        </div>
      )}
    </div>
  )
}
