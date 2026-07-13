/**
 * Font catalog — single source of truth for the picker, the live apply, and the
 * specimen preview. Fonts are bundled woff2 (offline). Every non-Arabic stack
 * lists an Arabic fallback so Arabic glyphs render with a real face regardless
 * of the Latin font chosen for a role. `system` = today's OS stacks, no files.
 */

export type FontCategory = 'Sans' | 'Display' | 'Mono' | 'Arabic'

export interface FontDef {
  id: string
  name: string
  category: FontCategory
  /** CSS font-family value applied to the role */
  stack: string
  /** woff2 filenames bundled under assets/fonts/ (empty for system) */
  files: string[]
}

const AR_SANS = "'Tajawal'"
const AR_SERIF = "'Amiri'"

export const SYSTEM_FONT: FontDef = {
  id: 'system',
  name: 'System',
  category: 'Sans',
  stack: `-apple-system, BlinkMacSystemFont, 'SF Pro Text', ${AR_SANS}, sans-serif`,
  files: [],
}

export const FONTS: readonly FontDef[] = [
  SYSTEM_FONT,
  // Sans
  { id: 'dm-sans', name: 'DM Sans', category: 'Sans', stack: `'DM Sans', ${AR_SANS}, sans-serif`, files: ['dm-sans-400.woff2', 'dm-sans-700.woff2'] },
  { id: 'sora', name: 'Sora', category: 'Sans', stack: `'Sora', ${AR_SANS}, sans-serif`, files: ['sora-400.woff2', 'sora-700.woff2'] },
  { id: 'saira', name: 'Saira', category: 'Sans', stack: `'Saira', ${AR_SANS}, sans-serif`, files: ['saira-400.woff2', 'saira-700.woff2'] },
  { id: 'noto-sans', name: 'Noto Sans', category: 'Sans', stack: `'Noto Sans', ${AR_SANS}, sans-serif`, files: ['noto-sans-400.woff2', 'noto-sans-700.woff2'] },
  { id: 'alexandria', name: 'Alexandria', category: 'Sans', stack: `'Alexandria', ${AR_SANS}, sans-serif`, files: ['alexandria-400.woff2', 'alexandria-700.woff2'] },
  // Display
  { id: 'archivo-black', name: 'Archivo Black', category: 'Display', stack: `'Archivo Black', ${AR_SANS}, sans-serif`, files: ['archivo-black-400.woff2'] },
  { id: 'unbounded', name: 'Unbounded', category: 'Display', stack: `'Unbounded', ${AR_SANS}, sans-serif`, files: ['unbounded-400.woff2', 'unbounded-700.woff2'] },
  { id: 'workbench', name: 'Workbench', category: 'Display', stack: `'Workbench', ${AR_SANS}, sans-serif`, files: ['workbench-400.woff2'] },
  { id: 'press-start-2p', name: 'Press Start 2P', category: 'Display', stack: `'Press Start 2P', ${AR_SANS}, monospace`, files: ['press-start-2p-400.woff2'] },
  { id: 'geist-pixel', name: 'Geist Pixel', category: 'Display', stack: `'Geist Pixel', ${AR_SANS}, monospace`, files: ['geist-pixel-400.woff2'] },
  // Mono
  { id: 'roboto-mono', name: 'Roboto Mono', category: 'Mono', stack: `'Roboto Mono', ${AR_SANS}, monospace`, files: ['roboto-mono-400.woff2', 'roboto-mono-700.woff2'] },
  { id: 'space-mono', name: 'Space Mono', category: 'Mono', stack: `'Space Mono', ${AR_SANS}, monospace`, files: ['space-mono-400.woff2', 'space-mono-700.woff2'] },
  // Arabic
  { id: 'tajawal', name: 'Tajawal', category: 'Arabic', stack: `'Tajawal', sans-serif`, files: ['tajawal-400.woff2', 'tajawal-700.woff2'] },
  { id: 'amiri', name: 'Amiri', category: 'Arabic', stack: `'Amiri', ${AR_SERIF}, serif`, files: ['amiri-400.woff2', 'amiri-700.woff2'] },
]

export function fontById(id: string): FontDef {
  return FONTS.find((f) => f.id === id) ?? SYSTEM_FONT
}

const CATEGORY_ORDER: FontCategory[] = ['Sans', 'Display', 'Mono', 'Arabic']

export function fontsByCategory(): Array<{ category: FontCategory; fonts: FontDef[] }> {
  return CATEGORY_ORDER.map((category) => ({
    category,
    fonts: FONTS.filter((f) => f.category === category),
  }))
}
