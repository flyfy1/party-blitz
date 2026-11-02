// 🎯 Perfect Stop: a pointer sweeps back and forth, speeding up; one tap freezes it and submits the deviation.
import { useEffect, useRef, useState } from 'react'
import { now, parseTs } from '../shared/time'
import type { Phase } from '../shared/timing'
import type { RoundPayload } from '../shared/types'

interface Props {
  round: RoundPayload
  phase: Phase
  remaining: number
  submit: (roundId: string, value: number) => Promise<void>
  onLocal: (value: number) => void
}

const PERIOD_START = 1600 // ms for a full back-and-forth at the start
const PERIOD_END = 700 // ms at the end of PLAY

export default function Stop({ round, phase, remaining, submit, onLocal }: Props) {
  const [stopped, setStopped] = useState<number | null>(null) // deviation 0..1
  const posRef = useRef(0.5)
  const ptrRef = useRef<HTMLDivElement>(null)
  const accRef = useRef(0)
  const lastRef = useRef(0)
  const playing = phase === 'play'

  useEffect(() => {
    if (!playing || stopped !== null) return
    const s = parseTs(round.starts_at)
    const e = parseTs(round.ends_at)
    const dur = Math.max(1, e - s)
    let raf = 0
    lastRef.current = now()
    const tick = () => {
      const n = now()
      const dt = Math.max(0, n - lastRef.current)
      lastRef.current = n
      const t = Math.min(1, Math.max(0, (n - s) / dur))
      const period = PERIOD_START + (PERIOD_END - PERIOD_START) * t
      accRef.current += dt / period
      const ph = accRef.current % 1
      const pos = ph < 0.5 ? ph * 2 : 2 - ph * 2 // triangle wave 0→1→0
      posRef.current = pos
      if (ptrRef.current) ptrRef.current.style.left = `calc(${(pos * 100).toFixed(2)}% - 9px)`
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, stopped, round.starts_at, round.ends_at])

  const onTap = () => {
    if (!playing || stopped !== null) return
    const dev = Math.min(1, Math.abs(posRef.current - 0.5) * 2)
    setStopped(dev)
    onLocal(dev)
    if (navigator.vibrate) navigator.vibrate(dev < 0.05 ? [20, 40, 20] : 15)
    submit(round.round_id, dev)
  }

  const accuracy = stopped === null ? null : Math.round((1 - stopped) * 100)
  const verdict = stopped === null ? '' : stopped < 0.05 ? 'PERFECT!' : stopped < 0.2 ? 'Nice' : 'Meh'

  return (
    <div className="ph-game stop-area" onPointerDown={onTap}>
      {playing && <div className="ph-timer">{remaining}</div>}
      {!playing && <div className="ph-big cn pop">Time's up!</div>}
      {stopped !== null ? (
        <div className="ph-center">
          <div className="ph-big cn pop">{verdict}</div>
          <div className="ph-count-static">{accuracy}%</div>
          <div className="ph-sub">accuracy</div>
        </div>
      ) : playing ? (
        <div className="ph-center">
          <div className="ph-sub">Tap anywhere to stop</div>
        </div>
      ) : (
        <div className="ph-center">
          <div className="ph-sub">You didn't tap 😶</div>
        </div>
      )}
      <div className="stop-bar">
        <div className="stop-center" />
        <div className="stop-mark" style={{ left: '25%' }} />
        <div className="stop-mark" style={{ left: '75%' }} />
        <div ref={ptrRef} className={`stop-ptr ${stopped !== null ? 'frozen' : ''}`} style={{ left: 'calc(50% - 9px)' }} />
      </div>
    </div>
  )
}
