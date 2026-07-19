/**
 * WP-F: a binary/document file (pdf, xlsx, png, …) can't render in the in-app
 * reader — this card offers Open (OS default app, allowlist-gated main-side) and
 * Reveal (OS file manager). Reached via a deep-link / programmatic open; the
 * tree opens binaries directly. Filename + two actions, no preview.
 */
import { openPath, revealPath } from '../../api'

/** 'Finder' / 'Explorer' / 'file manager' for the reveal button label. */
function fileManagerName(): string {
  const p = typeof window !== 'undefined' ? window.loredex?.platform : ''
  if (p === 'darwin') return 'Finder'
  if (p === 'win32') return 'Explorer'
  return 'file manager'
}

export function UnsupportedFileView({ path }: { path: string }): React.JSX.Element {
  const name = path.split('/').pop() ?? path
  return (
    <div className="unsupported-file">
      <div className="unsupported-file-icon" aria-hidden>
        ⧉
      </div>
      <div className="unsupported-file-name">{name}</div>
      <div className="unsupported-file-hint">
        This file opens in your operating system, not the in-app reader.
      </div>
      <div className="unsupported-file-actions">
        <button type="button" className="button-emphasis" onClick={() => void openPath(path)}>
          Open in default app
        </button>
        <button type="button" className="button-secondary" onClick={() => void revealPath(path)}>
          Reveal in {fileManagerName()}
        </button>
      </div>
    </div>
  )
}
