// 🟢 Reaction: red "WAIT…" until go_at (server clock), then green "TAP!". One tap only.
// Early tap = REACT_MAX penalty (locked, "Too early!"); never tapping = REACT_MAX (server counts missing as max).
import { useEffect, useMemo, useRef, useState } from 'react'
import { FACTIONS, KIND_META } from '../../shared/factions'
import { REACT_MAX, clampReact, parseReactOptions, reactVerdict } from '../../shared/react'
import { Collecting, Intro, MvpBanner, RankLine, vibrate } from './common'
import type { GameProps } from './types'
import './react.css'

const meta = KIND_META.react

export default function ReactGame(p: GameProps) {
  const { goAt } = useMemo(() => parseReactOptions(p.options, p.startsAt), [p.options, p.startsAt])
  const f = FACTIONS[p.faction]
  const style = { '--fc': f.color, '--fcl': f.light, '--fcd': f.dark } as React.CSSProperties
  const [go, setGo] = useState(() => p.now() >= goAt)
  const [value, setValue] = useState<number | null>(null) // null = not tapped yet
  const lockedRef = useRef(false)

  // New round → reset
  const lastKey = useRef(`${p.startsAt}`)
  useEffect(() => {
    if (lastKey.current !== `${p.startsAt}`) {
      lastKey.current = `${p.startsAt}`
      lockedRef.current = false
      setValue(null)
      setGo(p.now() >= goAt)
    }
  }, [p.startsAt, goAt, p])

  // Flip to green exactly at go_at on the server clock (rAF, so a throttled tab catches up)
  useEffect(() => {
    if (p.phase !== 'play' || go) return
    let raf = 0
    const tick = () => {
      if (p.now() >= goAt) {
        setGo(true)
        vibrate(40)
        return
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [p.phase, go, goAt, p])

  const tap = () => {
    if (p.phase !== 'play' || lockedRef.current) return
    lockedRef.current = true
    const t = p.now()
    const v = t < goAt ? REACT_MAX : clampReact(t - goAt)
    setValue(v)
    vibrate(v >= REACT_MAX ? [60, 40, 60] : v < 400 ? [15, 30, 15] : 25)
    void p.onSubmit(v)
  }

  const early = value !== null && value >= REACT_MAX && !go
  const ownLine = value === null ? "You didn't tap 💤" : early ? 'Too early! 🙈 (2000 ms)' : `${Math.round(value)} ms · ${reactVerdict(value)}`

  if (p.phase === 'intro') return <div className="pg" style={style}><Intro icon={meta.icon} verb={meta.verb} hint="Red = wait. Green = TAP. One tap only" /></div>
  if (p.phase === 'collect') return <div className="pg" style={style}><Collecting line={ownLine} /></div>
  if (p.phase === 'result' || p.phase === 'done') {
    return (
      <div className="pg-result" style={style}>
        <div className="pg-headline">
          <div className="rx-icon">{value === null ? '💤' : early ? '🙈' : '⚡'}</div>
          <h1 className="rx-ms">{value === null ? '—' : early ? 'Too early!' : `${Math.round(value)} ms`}</h1>
          <p>{value === null ? 'No tap this round' : early ? 'Counted as 2000 ms' : reactVerdict(value)}</p>
        </div>
        {p.isMvp && <MvpBanner />}
        {p.result && <RankLine faction={p.faction} result={p.result} />}
      </div>
    )
  }

  // PLAY
  const state = value !== null ? (early ? 'early' : 'done') : go ? 'go' : 'wait'
  return (
    <div className={`rx rx-${state}`} style={style} onPointerDown={tap}>
      {state === 'wait' && (
        <>
          <div className="rx-word">WAIT…</div>
          <p className="rx-hint">Tap only when it turns GREEN</p>
        </>
      )}
      {state === 'go' && (
        <>
          <div className="rx-word rx-pop">TAP!</div>
          <p className="rx-hint">NOW!</p>
        </>
      )}
      {state === 'early' && (
        <>
          <div className="rx-word rx-pop">Too early!</div>
          <p className="rx-hint">🙈 Counted as 2000 ms · wait for the result</p>
        </>
      )}
      {state === 'done' && (
        <>
          <div className="rx-ms rx-pop">{Math.round(value!)} ms</div>
          <div className="rx-word" style={{ fontSize: 40 }}>{reactVerdict(value!)}</div>
          <p className="rx-hint">Locked in · watch the big screen</p>
        </>
      )}
    </div>
  )
}
