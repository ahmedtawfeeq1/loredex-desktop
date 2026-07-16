/**
 * Nav glyphs for the collapsed 56px icon rail (story 16.2, Addendum D1).
 * Inline geometric SVGs — DESIGN.md bans emoji in chrome and the story bans
 * new deps; stroke rides currentColor so active/hover states just work.
 */
import type { AppView } from '../stores/app'

const GLYPHS: Record<AppView, React.JSX.Element> = {
  home: (
    <>
      <path d="M3 8 8 3.5 13 8" />
      <path d="M4.5 7.5V13h7V7.5" />
    </>
  ),
  reader: (
    <>
      <rect x="4" y="2.5" width="8" height="11" rx="1" />
      <path d="M6 5.5h4M6 8h4M6 10.5h2.5" />
    </>
  ),
  handoffs: <path d="M11 3.5 13 5.5m0 0L11 7.5M13 5.5H3.5M5 8.5l-2 2m0 0 2 2m-2-2h9.5" />,
  plan: (
    <>
      <rect x="2.5" y="3" width="3.2" height="10" rx="0.8" />
      <rect x="6.4" y="3" width="3.2" height="6.5" rx="0.8" />
      <rect x="10.3" y="3" width="3.2" height="8.2" rx="0.8" />
    </>
  ),
  clients: (
    <>
      <circle cx="5.5" cy="5" r="2" />
      <circle cx="10.5" cy="5" r="2" />
      <path d="M2.5 13c0-2 1.4-3.2 3-3.2S8.5 11 8.5 13M7.5 13c0-2 1.4-3.2 3-3.2s3 1.2 3 3.2" />
    </>
  ),
  atlas: (
    <>
      <circle cx="8" cy="4" r="1.7" />
      <circle cx="4" cy="12" r="1.7" />
      <circle cx="12" cy="12" r="1.7" />
      <path d="M7.2 5.5 4.8 10.4M8.8 5.5l2.4 4.9M5.7 12h4.6" />
    </>
  ),
  contracts: (
    <>
      <path d="M4.5 2.5h5l3 3v8h-8z" />
      <path d="M9.5 2.5v3h3" />
    </>
  ),
  search: (
    <>
      <circle cx="7" cy="7" r="3.5" />
      <path d="m9.7 9.7 3.3 3.3" />
    </>
  ),
  feed: <path d="M2.5 8.5H5l1.5-4 3 7L11 8.5h2.5" />,
  sync: (
    <>
      <path d="M12.7 6.8A5 5 0 0 0 4 5.2M3.3 9.2A5 5 0 0 0 12 10.8" />
      <path d="M12.7 3v3.8H8.9M3.3 13V9.2h3.8" />
    </>
  ),
  settings: (
    <>
      <path d="M2.5 5.5h11M2.5 10.5h11" />
      <circle cx="6" cy="5.5" r="1.6" />
      <circle cx="10" cy="10.5" r="1.6" />
    </>
  ),
}

export function NavIcon({ view }: { view: AppView }): React.JSX.Element {
  return (
    <svg
      className="nav-icon"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {GLYPHS[view]}
    </svg>
  )
}

/** Pane-header collapse/expand chevron — rails (16.2) + tree sections (16.3)
 *  share it: `down` = an expanded section row. */
export function RailChevron({ dir }: { dir: 'left' | 'right' | 'down' }): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 16 16"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {dir === 'left' ? (
        <path d="M9.5 3.5 5 8l4.5 4.5" />
      ) : dir === 'right' ? (
        <path d="M6.5 3.5 11 8l-4.5 4.5" />
      ) : (
        <path d="M3.5 6.5 8 11l4.5-4.5" />
      )}
    </svg>
  )
}
