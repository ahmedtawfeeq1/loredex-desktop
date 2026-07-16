/**
 * Loredex R1 brand mark (handoff/brand/loredex-mark.svg, locked 2026-07-13):
 * cobalt gradient tile, two filed cards — the front card carries the bracket
 * glyph and a green "live" row. Hexes are brand constants from the locked
 * asset, not theme tokens: the mark is identical in both themes. The brass
 * placeholder mark is retired (DESIGN v3 §8).
 */
import { useId } from 'react'

export function BrandMark({
  size = 22,
  className,
}: {
  size?: number
  className?: string
}): React.JSX.Element {
  const gradientId = useId()
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6E96EE" />
          <stop offset="1" stopColor="#3F69CC" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="11" fill={`url(#${gradientId})`} />
      <g transform="rotate(-10 22 25)">
        <rect x="15" y="15" width="13.5" height="18.5" rx="2.4" fill="#BFC8DA" />
      </g>
      <g transform="rotate(7 25 25)">
        <rect x="18.5" y="15" width="14.5" height="19" rx="2.6" fill="#F5F8FF" />
        <path
          d="M24 20 H21.4 V29.8 H24"
          fill="none"
          stroke="#3F69CC"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <rect x="26" y="20.4" width="4.6" height="1.9" rx=".95" fill="#93A6C9" />
        <rect x="26" y="23.9" width="4.6" height="1.9" rx=".95" fill="#93A6C9" />
        <rect x="26" y="27.4" width="4.6" height="1.9" rx=".95" fill="#3BCB8B" />
      </g>
    </svg>
  )
}
