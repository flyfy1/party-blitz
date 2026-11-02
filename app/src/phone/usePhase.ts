import { useEffect, useState } from 'react'
import { now, parseTs } from '../shared/time'
import { phaseAt, type Phase, type Timing } from '../shared/timing'
import type { RoundPayload } from '../shared/types'

/** Server-time-driven phase for the current round; `remaining` = whole seconds left in the phase. */
export function usePhase(round: RoundPayload | null, timing: Timing) {
  const [phase, setPhase] = useState<Phase>('intro')
  const [remaining, setRemaining] = useState(0)
  const roundId = round?.round_id
  const startsAt = round ? parseTs(round.starts_at) : 0
  const endsAt = round ? parseTs(round.ends_at) : 0

  useEffect(() => {
    if (!roundId) return
    let raf = 0
    const tick = () => {
      const n = now()
      const p = phaseAt(n, startsAt, endsAt, timing)
      setPhase((prev) => (prev === p ? prev : p))
      const target = p === 'intro' ? startsAt : p === 'play' ? endsAt : endsAt + timing.collect
      const r = Math.max(0, Math.ceil((target - n) / 1000))
      setRemaining((prev) => (prev === r ? prev : r))
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [roundId, startsAt, endsAt, timing])

  return { phase, remaining }
}
