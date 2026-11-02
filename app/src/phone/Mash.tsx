// ⚡ Tap Frenzy: count pointerdown locally, submit the cumulative count every 1000ms.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Phase } from '../shared/timing'

interface Props {
  roundId: string
  phase: Phase
  remaining: number
  submit: (roundId: string, value: number) => Promise<void>
  onLocal: (value: number) => void
}

interface Ripple {
  id: number
  x: number
  y: number
}

export default function Mash({ roundId, phase, remaining, submit, onLocal }: Props) {
  const [count, setCount] = useState(0)
  const [ripples, setRipples] = useState<Ripple[]>([])
  const countRef = useRef(0)
  const sentRef = useRef(0)
  const rippleId = useRef(0)
  const playing = phase === 'play'

  const flush = useCallback(() => {
    if (countRef.current <= sentRef.current) return
    sentRef.current = countRef.current
    submit(roundId, countRef.current)
  }, [roundId, submit])

  // Submit schedule: first after a random 0–1000ms offset, then every 1000ms. Force a flush when PLAY ends.
  useEffect(() => {
    if (!playing) return
    let interval: ReturnType<typeof setInterval> | undefined
    const first = setTimeout(() => {
      flush()
      interval = setInterval(flush, 1000)
    }, Math.random() * 1000)
    return () => {
      clearTimeout(first)
      if (interval) clearInterval(interval)
      flush()
    }
  }, [playing, flush])

  // Safety net: flush again on unmount (result arrived) in case the last one failed to send.
  useEffect(() => () => flush(), [flush])

  const onTap = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!playing) return
    countRef.current += 1
    setCount(countRef.current)
    onLocal(countRef.current)
    if (navigator.vibrate) navigator.vibrate(10)
    const rect = e.currentTarget.getBoundingClientRect()
    const r = { id: rippleId.current++, x: e.clientX - rect.left, y: e.clientY - rect.top }
    setRipples((rs) => [...rs.slice(-11), r])
    setTimeout(() => setRipples((rs) => rs.filter((x) => x.id !== r.id)), 500)
  }

  return (
    <div className="ph-game">
      {playing ? (
        <>
          <div className="ph-timer">{remaining}</div>
          <div className="ph-count" key={count}>
            {count}
          </div>
          <div className="ph-sub">taps</div>
          <button className="mash-btn" onPointerDown={onTap} onContextMenu={(e) => e.preventDefault()}>
            <span className="mash-label cn">MASH!</span>
            {ripples.map((r) => (
              <span key={r.id} className="ripple" style={{ left: r.x, top: r.y }} />
            ))}
          </button>
        </>
      ) : (
        <div className="ph-center">
          <div className="ph-big cn pop">Time's up!</div>
          <div className="ph-count-static">{count}</div>
          <div className="ph-sub">taps · waiting for results…</div>
        </div>
      )}
    </div>
  )
}
