/**
 * Ring taxonomy for atlas cards (stories 10.5–10.7): selected, tour pulse,
 * search tiers, path gold, focus fade, changed glow, affected ring — each
 * visually distinct (UA solved this with distinct ring states on one card
 * component; so do we). Pure class computation, unit-tested.
 */

export interface AtlasDecor {
  /** tour step highlight (gold pulse; static ring under reduced-motion) */
  tour?: ReadonlySet<string>
}

export function nodeDecorClass(id: string, decor: AtlasDecor | undefined): string {
  if (!decor) return ''
  let cls = ''
  if (decor.tour?.has(id)) cls += ' atlas-node-tour'
  return cls
}
