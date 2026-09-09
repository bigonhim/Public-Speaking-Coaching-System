// A one-shot flag marking "we just signed in", so /welcome can tell a fresh
// arrival from a deliberate replay and greet them accordingly.
//
// sessionStorage, not localStorage: the reel belongs to a sign-in, and a new
// tab is a new arrival. Every access is guarded — Safari's private mode throws
// on write, and a decorative greeting is never worth taking the page down for.

const KEY = 'cadence.welcomePending'

export function markWelcomePending(): void {
  try {
    sessionStorage.setItem(KEY, '1')
  } catch {
    /* storage unavailable — the reel just plays its neutral opening */
  }
}

/** Reads the flag without clearing it. Used by the route guard to decide where
 *  a freshly-authenticated visitor goes. */
export function isWelcomePending(): boolean {
  try {
    return sessionStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

/** Reads and clears the flag. */
export function consumeWelcomePending(): boolean {
  try {
    const pending = sessionStorage.getItem(KEY) === '1'
    sessionStorage.removeItem(KEY)
    return pending
  } catch {
    return false
  }
}
