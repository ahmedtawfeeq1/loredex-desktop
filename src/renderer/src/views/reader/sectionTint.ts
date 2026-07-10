/**
 * Deterministic section tints (story 16.3, DESIGN.md Addendum D1 "Vault tree
 * sections"): the 8-tint palette verbatim from D1, picked by a stable hash of
 * the section name — the same project is the same color on every launch and
 * every machine (FNV-1a, no randomness, no insertion order). The hex rides an
 * inline `--section-color`; the 12%/20% alpha tinting is the stylesheet's job.
 */

/** D1 palette, exact hexes in spec order. */
export const TREE_TINTS = [
  '#7C9A6D', // sage
  '#C07856', // clay
  '#6B7FA3', // slate
  '#8A8F55', // moss
  '#B07285', // rose
  '#B99B5F', // sand
  '#5F9490', // teal
  '#8D6E97', // plum
] as const

/** FNV-1a 32-bit of the section name → one of the 8 D1 tints. */
export function sectionTint(name: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < name.length; i++) {
    h = Math.imul(h ^ name.charCodeAt(i), 0x01000193)
  }
  return TREE_TINTS[(h >>> 0) % TREE_TINTS.length]
}
