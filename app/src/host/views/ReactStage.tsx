// 🟢 Reaction big screen: three mascots on a start line, "READY…" pulse until go_at, then a full-screen
// green flash + horn; mascots lunge forward by faction average speed; at collect the 3 fastest names show with ms.
// Props match MinorityStage (rows/counts/secondsLeft/collecting/roundIdx/options); optional startsAt (server ms)
// lets go_after_ms be used instead of go_at. Wire in Screen.tsx next to MinorityStage.
import { useEffect, useMemo, useRef, useState } from 'react'
import { FACTIONS, KIND_META } from '../../shared/factions'
import { REACT_MAX, clampReact, parseReactOptions, reactMvp } from '../../shared/react'
import { now } from '../../shared/time'
import type { InputRow, Triple } from '../../shared/types'
import { sfx } from '../sfx'
import { burst, shake } from '../views'
import './react-stage.css'

export interface ReactStageProps {
  rows: InputRow[]
  counts: Triple
  secondsLeft: number
  collecting: boolean
  roundIdx: number
  options?: unknown
  /** PLAY start on the server clock (ms); only needed when options carry go_after_ms without go_at */
  startsAt?: number
}

const LANE_LEN = 1180 // px the leader can travel

export function ReactStage({ rows, counts, secondsLeft, collecting, roundIdx, options, startsAt = 0 }: ReactStageProps) {
  const { goAt } = useMemo(() => parseReactOptions(options, startsAt), [options, startsAt])
  const [goRound, setGoRound] = useState(-1) // roundIdx whose go_at has passed
  const [flash, setFlash] = useState(false)
  const firedFor = useRef(-1)
  const go = goRound === roundIdx

  // Flip to green on the server clock; horn + flash + shake once per round
  useEffect(() => {
    let raf = 0
    const tick = () => {
      if (now() >= goAt) {
        if (firedFor.current !== roundIdx) {
          firedFor.current = roundIdx
          setGoRound(roundIdx)
          setFlash(true)
          try { sfx.horn() } catch { /* audio locked */ }
          shake(250)
          burst(0.5, 0.35, ['#19c25c', '#a7f3c0', '#ffffff'])
          setTimeout(() => setFlash(false), 450)
        }
        return
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [goAt, roundIdx])

  // Per-faction average reaction (missing members = REACT_MAX) → speed 0..1
  const stats = useMemo(() => {
    const sum: Triple = [0, 0, 0], n: Triple = [0, 0, 0], early: Triple = [0, 0, 0]
    for (const r of rows) {
      if (r.faction < 0 || r.faction > 2) continue
      const v = clampReact(r.value)
      sum[r.faction] += v
      n[r.faction]++
      if (v >= REACT_MAX) early[r.faction]++
    }
    return [0, 1, 2].map((f) => {
      const c = counts[f]
      const avg = c ? (sum[f] + (c - n[f]) * REACT_MAX) / c : REACT_MAX
      const tapped = n[f] - early[f]
      const avgTapped = tapped ? (sum[f] - early[f] * REACT_MAX) / tapped : null
      return { avg, speed: 1 - avg / REACT_MAX, tapped, early: early[f], avgTapped }
    })
  }, [rows, counts])
  const leader = stats.reduce((b, s, i) => (s.speed > stats[b].speed ? i : b), 0)
  const fastest = useMemo(() => reactMvp(rows), [rows])
  const m = KIND_META.react

  return (
    <div className={`rxs ${go ? 'rxs-go' : 'rxs-wait'} ${flash ? 'rxs-flash' : ''}`}>
      <div className="rxs-top">
        <div className="rxs-title">{m.icon} {m.title} · Round {roundIdx + 1}</div>
        <div className="rxs-clock">{collecting ? "TIME'S UP" : secondsLeft}</div>
      </div>

      {!go && !collecting && <div className="rxs-ready">READY…</div>}
      {go && !collecting && <div className="rxs-tap">TAP!</div>}

      <div className="rxs-lanes">
        {FACTIONS.map((f) => {
          const s = stats[f.id]
          const x = go ? Math.round(Math.max(0, s.speed) * LANE_LEN) : 0
          const isLeader = go && f.id === leader && s.tapped > 0
          return (
            <div key={f.id} className="rxs-lane" style={{ ['--lc' as string]: f.color }}>
              <div className="rxs-lane-label">{f.name}</div>
              <div className="rxs-track">
                <div className="rxs-start" />
                <div className={`rxs-mascot ${isLeader ? 'leader' : ''} ${go ? 'lunge' : 'idle'}`} style={{ transform: `translateX(${x}px)` }}>
                  {f.emoji}
                  {go && s.tapped > 0 && <span className="rxs-ms">{Math.round(s.avgTapped ?? 0)} ms</span>}
                  {go && s.early > 0 && <span className="rxs-early">🙈 {s.early}</span>}
                </div>
              </div>
              <div className="rxs-count">{s.tapped}/{counts[f.id]}</div>
            </div>
          )
        })}
      </div>

      {collecting && (
        <div className="rxs-podium">
          <div className="rxs-podium-title">Fastest fingers</div>
          {fastest.length === 0 && <div className="rxs-podium-row">Nobody tapped on green 😴</div>}
          {fastest.map((p, i) => (
            <div key={p.player_id} className="rxs-podium-row" style={{ animationDelay: `${i * 0.15}s`, ['--lc' as string]: FACTIONS[p.faction].color }}>
              <span className="rxs-medal">{['🥇', '🥈', '🥉'][i]}</span>
              <span className="rxs-name">{FACTIONS[p.faction].emoji} {p.nick}</span>
              <span className="rxs-time">{Math.round(p.value)} ms</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
