/**
 * Genudo sign-in kill switch — shared by the core resolver and the client page,
 * so the credential that actually gets used and the control the user sees can
 * never disagree.
 *
 * Turned OFF 2026-07-29 at the user's request: browser sign-in has problems in
 * practice, and pasted tokens are the credential path that works. Everything
 * behind it is intact — the IPC channels, the keychain sessions, the refresh —
 * so flipping this back to `true` restores the feature, including any session
 * already stored (nothing is deleted here).
 *
 * WHY THIS ALSO GATES THE RESOLVER, not just the button: a stored session
 * OUTRANKS a pasted token (`clientTokenOverlay` / `resolveConnEnv` write the
 * live access token over the connection's credential refs). Hiding only the UI
 * would leave a client that signed in earlier still authenticating with that
 * session — a pasted token would sit there looking correct while a stale or
 * broken session did the talking, which is exactly the confusion this switch is
 * meant to end. With the flag off, sessions are ignored and the pasted token is
 * the only credential.
 */
export const GENUDO_SIGN_IN_ENABLED = false
