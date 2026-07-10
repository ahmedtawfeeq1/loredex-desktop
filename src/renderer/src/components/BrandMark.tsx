/**
 * Compact loredex mark — the app icon's inner composition (gold dex ring,
 * paper file, amber ctx chip) as an inline SVG for chrome use: sidebar
 * wordmark row and designed empty states. Colors ride theme tokens where
 * they must adapt; the gold ring and amber chip are brand constants.
 */
export function BrandMark({ size = 22 }: { size?: number }): React.JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="50" cy="50" r="44" fill="none" stroke="#D9A441" strokeWidth="7" />
      <g transform="rotate(5 52 55)">
        <path
          d="M 34 28 H 56 L 68 40 V 74 A 5 5 0 0 1 63 79 H 39 A 5 5 0 0 1 34 74 Z"
          fill="var(--brand-paper, #FAF8F1)"
          stroke="var(--hairline)"
          strokeWidth="1.5"
        />
        <path d="M 56 28 L 68 40 H 60 A 4 4 0 0 1 56 36 Z" fill="#D8D2C2" />
        <rect x="41" y="48" width="17" height="4.5" rx="2.25" fill="#BFB8A6" />
        <rect x="41" y="57" width="21" height="4.5" rx="2.25" fill="#BFB8A6" />
      </g>
      <rect x="56" y="18" width="30" height="17" rx="8" fill="#E0A83E" />
      <text
        x="71"
        y="30.5"
        textAnchor="middle"
        fontFamily="var(--font-mono)"
        fontSize="11"
        fontWeight="700"
        fill="#131826"
      >
        ctx
      </text>
    </svg>
  )
}
