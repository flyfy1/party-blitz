// Server time offset. All countdowns use now(), never Date.now() directly.
let offset = 0
let samples = 0

/** Record one RPC round-trip: t0 = before send, t1 = after receive. */
export function applyServerNow(serverNow: string | undefined, t0: number, t1: number) {
  if (!serverNow) return
  const parsed = Date.parse(serverNow)
  if (Number.isNaN(parsed)) return
  const next = parsed - (t0 + t1) / 2
  // Smooth a little after the first sample so a slow request doesn't yank the clock.
  offset = samples === 0 ? next : offset * 0.5 + next * 0.5
  samples++
}

export const now = () => Date.now() + offset
export const getOffset = () => offset
export const ts = (iso: string) => Date.parse(iso)
