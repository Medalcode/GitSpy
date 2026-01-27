type RateState = {
  remaining: number
  resetAt: number // epoch seconds
}

let state: RateState = { remaining: Infinity, resetAt: 0 }

function nowSecs() {
  return Math.floor(Date.now() / 1000)
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function updateFromHeaders(headers: Record<string, any>) {
  try {
    const rem = headers['x-ratelimit-remaining'] ?? headers['x-ratelimit-remaining']
    const reset = headers['x-ratelimit-reset'] ?? headers['x-ratelimit-reset']
    if (rem !== undefined) state.remaining = Number(rem)
    if (reset !== undefined) state.resetAt = Number(reset)
  } catch (e) {
    // ignore parsing errors
  }
}

export async function waitForAllowance(tokens = 1) {
  // If remaining is infinite (not initialized), allow immediately
  if (!isFinite(state.remaining)) return

  // fast-path
  if (state.remaining >= tokens) {
    state.remaining = Math.max(0, state.remaining - tokens)
    return
  }

  // need to wait until reset
  const resetAtMs = state.resetAt * 1000
  const nowMs = Date.now()
  const waitMs = Math.max(0, resetAtMs - nowMs) + 500 // small buffer
  if (waitMs > 0) {
    await sleep(waitMs)
  }

  // after sleeping, clear remaining to a safe default until headers update
  state.remaining = 0
}

export async function backoffUntilReset(attempt = 0) {
  const maxBackoff = 60 * 1000 // 1 minute cap
  const resetAtMs = state.resetAt * 1000
  const nowMs = Date.now()
  const baseWait = Math.max(0, resetAtMs - nowMs)
  const expo = Math.min(maxBackoff, (2 ** attempt) * 1000)
  const waitMs = Math.max(baseWait, expo)
  await sleep(waitMs + 200)
}

export function getState() {
  return { ...state }
}
