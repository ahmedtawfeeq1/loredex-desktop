/**
 * loredex://join deep link (story 13.2): main forwards the raw URL, the
 * renderer parses it here and opens the join wizard pre-filled — the paste
 * path stays available either way. Params are remote/branch (m2 §7; the M1
 * registry-payload idea is superseded — the registry rides the vault).
 */
export interface JoinLink {
  remote: string
  branch?: string
}

export function parseJoinLink(raw: string): JoinLink | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== 'loredex:') return null
  // both spellings arrive in the wild: loredex://join?… and loredex:join?…
  const action = url.host || url.pathname.replace(/^\/+/, '')
  if (action !== 'join') return null
  const remote = url.searchParams.get('remote')?.trim()
  if (!remote) return null
  const branch = url.searchParams.get('branch')?.trim()
  return { remote, ...(branch ? { branch } : {}) }
}
