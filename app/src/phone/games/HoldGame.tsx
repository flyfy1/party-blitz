// ⏱️ 按住五秒（P3）：按住大按钮，觉得过了 5.00 秒就松开。只有一次机会；本地算偏差并提交一次。
// 没松开就到时间 = 不提交，计分时按偏差 1 处理（和 Stop 一样）。
import { useEffect, useRef, useState } from 'react'
import { FACTIONS } from '../../shared/factions'
import { HOLD_TARGET_MS, KIND_META_P3, holdDeviation, type HoldExtra } from '../../shared/scoring.p3'
import { Clock, Collecting, Intro, MvpBanner, RankLine, vibrate } from './common'
import type { GameProps } from './types'

export type HoldProps = GameProps<HoldExtra>
const meta = KIND_META_P3.hold

type HoldState = { s: 'idle' } | { s: 'holding'; start: number } | { s: 'released'; heldMs: number } | { s: 'overrun' }

export default function HoldGame(p: HoldProps) {
  const [st, setSt] = useState<HoldState>({ s: 'idle' })
  const f = FACTIONS[p.faction]
  const style = { '--fc': f.color, '--fcl': f.light, '--fcd': f.dark } as React.CSSProperties

  const lastKey = useRef(`${p.startsAt}`)
  useEffect(() => {
    if (lastKey.current !== `${p.startsAt}`) {
      lastKey.current = `${p.startsAt}`
      setSt({ s: 'idle' })
    }
  }, [p.startsAt])

  // 还按着就到时间了 → overrun（不提交）；在渲染时派生，不用 effect
  const raw = st
  const setRaw = setSt
  const stView: HoldState = raw.s === 'holding' && p.phase !== 'play' ? { s: 'overrun' } : raw

  const down = () => {
    if (p.phase !== 'play' || raw.s !== 'idle') return
    vibrate(30)
    setRaw({ s: 'holding', start: performance.now() })
  }
  const up = () => {
    if (raw.s !== 'holding' || p.phase !== 'play') return
    const heldMs = performance.now() - raw.start
    setRaw({ s: 'released', heldMs })
    const dev = holdDeviation(heldMs)
    vibrate(dev < 0.05 ? [40, 30, 80] : 40)
    void p.onSubmit(dev)
  }

  const st2 = stView
  if (p.phase === 'intro') return <div className="pg" style={style}><Intro icon={meta.icon} verb={meta.verb} hint={meta.hint} /></div>
  if (p.phase === 'collect') {
    return (
      <div className="pg" style={style}>
        <Collecting line={st2.s === 'released' ? `You held ${(st2.heldMs / 1000).toFixed(2)} s. Comparing…` : st2.s === 'overrun' ? 'Never let go… ✋' : 'No attempt… 💤'} />
      </div>
    )
  }
  if (p.phase === 'result' || p.phase === 'done') return <HoldResult {...p} st2={st2} style={style} />

  const holding = st2.s === 'holding'
  return (
    <div className="pg" style={style}>
      <Clock startsAt={p.startsAt} endsAt={p.endsAt} now={p.now} active />
      <div className="pg-title">
        <h2>Hold for 5.00 s</h2>
        <p>{st2.s === 'idle' ? 'Press and hold · release when you feel five seconds' : holding ? 'Holding… no peeking at the clock' : st2.s === 'released' ? 'Released!' : ''}</p>
      </div>
      <div className="pg-hold">
        {st2.s === 'released' ? (
          <div className="pg-hold-done pop">
            <div className="big">{(st2.heldMs / 1000).toFixed(2)} s</div>
            <div className="off">{Math.abs(st2.heldMs - HOLD_TARGET_MS) < 50 ? 'Dead on! 🎯' : `${Math.abs(st2.heldMs - HOLD_TARGET_MS) / 1000 < 1 ? (Math.abs(st2.heldMs - HOLD_TARGET_MS) / 1000).toFixed(2) + ' s' : 'way'} ${st2.heldMs > HOLD_TARGET_MS ? 'too long' : 'too short'}`}</div>
          </div>
        ) : (
          <button
            className={'pg-hold-btn' + (holding ? ' holding' : '')}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId)
              down()
            }}
            onPointerUp={up}
            onPointerCancel={up}
            onContextMenu={(e) => e.preventDefault()}
          >
            <span className="ring" />
            <span className="lbl">{holding ? 'RELEASE AT 5' : 'HOLD'}</span>
          </button>
        )}
      </div>
      <div className="pg-foot">{st2.s === 'released' ? 'Watch the big screen 👀' : 'One attempt · closest to 5.00 s wins'}</div>
    </div>
  )
}

function HoldResult(p: HoldProps & { st2: HoldState; style: React.CSSProperties }) {
  const ex = p.extra ?? null
  const mine = p.st2.s === 'released' ? holdDeviation(p.st2.heldMs) : null
  useEffect(() => {
    if (p.isMvp) vibrate([60, 40, 60, 40, 120])
  }, [p.isMvp])

  let icon = '⏱️', head = 'Results are in', sub = 'Check the big screen'
  if (p.st2.s === 'released') {
    const off = Math.abs(p.st2.heldMs - HOLD_TARGET_MS) / 1000
    sub = `You held ${(p.st2.heldMs / 1000).toFixed(2)} s · ${off.toFixed(2)} s off`
    if (off <= 0.05) { icon = '🎯'; head = 'NAILED IT!' }
    else if (off <= 0.25) { icon = '👏'; head = 'SO CLOSE!' }
    else if (off <= 1) { icon = '😬'; head = 'NOT BAD' }
    else { icon = '🫠'; head = 'WAY OFF' }
  } else if (p.st2.s === 'overrun') { icon = '✋'; head = 'NEVER LET GO'; sub = 'Counted as the worst possible time' }
  else { icon = '💤'; head = 'NO ATTEMPT'; sub = 'Press the button next time!' }
  if (p.isMvp) { icon = '🏆'; head = 'TOP 3!'; sub = `${(p.st2.s === 'released' ? p.st2.heldMs / 1000 : 0).toFixed(2)} s · one of the three closest in the room` }

  return (
    <div className={'pg-result' + (p.isMvp ? ' gold' : '')} style={p.style}>
      <div className="pg-headline">
        <div className="icon">{icon}</div>
        <h1>{head}</h1>
        <p>{sub}</p>
      </div>
      {ex && (
        <div className="pg-devs">
          {FACTIONS.map((f, i) => (
            <div key={f.id} className="pg-dev">
              <span className="em">{f.emoji}</span>
              <div className="bar"><i style={{ width: `${Math.max(4, (1 - Math.min(1, ex.avgDev[i])) * 100)}%`, background: f.color }} /></div>
              <span className="n">{(ex.avgDev[i] * HOLD_TARGET_MS / 1000).toFixed(2)} s off</span>
            </div>
          ))}
          {ex.best && (
            <div className="pg-best">
              🎯 Closest: {FACTIONS[ex.best.faction].emoji} {ex.best.nick} · {(ex.best.dev * HOLD_TARGET_MS / 1000).toFixed(2)} s off{mine !== null && ex.best.player_id !== 'me' ? '' : ''}
            </div>
          )}
        </div>
      )}
      {p.isMvp && <MvpBanner />}
      {p.result && <RankLine faction={p.faction} result={p.result} />}
    </div>
  )
}
