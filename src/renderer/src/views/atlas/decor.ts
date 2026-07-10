/**
 * Ring taxonomy for atlas cards (stories 10.5–10.7): selected, tour pulse,
 * search tiers, path gold, focus fade — each visually distinct (UA solved
 * this with distinct ring states on one card component; so do we). Pure
 * class computation, unit-tested.
 */

export interface AtlasDecor {
  /** tour step highlight (gold pulse; static ring under reduced-motion) */
  tour?: ReadonlySet<string>
  /** search-hit ring tiers, 1 = strongest (navy, width by tier) */
  search?: ReadonlyMap<string, 1 | 2 | 3>
  /** traced path membership — gold, the view's critical-path spend */
  path?: ReadonlySet<string>
  pathEdges?: ReadonlySet<string>
  /** focus mode: the visible 1-hop set; everything else fades */
  focus?: ReadonlySet<string> | null
  /** changed-since overlay (10.7): touched nodes glow (--ok, never gold)… */
  changed?: ReadonlySet<string>
  /** …and their 1-hop neighbors carry a distinct affected ring */
  affected?: ReadonlySet<string>
}

export function nodeDecorClass(id: string, decor: AtlasDecor | undefined): string {
  if (!decor) return ''
  let cls = ''
  if (decor.tour?.has(id)) cls += ' atlas-node-tour'
  const tier = decor.search?.get(id)
  if (tier !== undefined) cls += ` atlas-ring-search-${tier}`
  if (decor.path?.has(id)) cls += ' atlas-node-path'
  if (decor.changed?.has(id)) cls += ' atlas-node-changed'
  else if (decor.affected?.has(id)) cls += ' atlas-node-affected'
  if (decor.focus && !decor.focus.has(id)) cls += ' atlas-node-faded'
  return cls
}

export function edgeDecorClass(
  edge: { id: string; source: string; target: string },
  decor: AtlasDecor | undefined,
): string {
  if (!decor) return ''
  let cls = ''
  if (decor.pathEdges?.has(edge.id)) cls += ' atlas-edge-path'
  if (decor.focus && !(decor.focus.has(edge.source) && decor.focus.has(edge.target))) {
    cls += ' atlas-edge-faded'
  }
  return cls
}
