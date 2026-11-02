// 两个小游戏共用的小部件：倒计时条、INTRO 大字、收卷大字、名次条、波纹、震动。
import { useEffect, useRef, useState, type PointerEvent as RPE } from 'react'
import { FACTIONS } from '../../shared/factions'
import type { Faction, ResultPayload } from '../../shared/types'
import './games.css'

export function vibrate(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    /* ignore */
  }
}

/** 每帧计算剩余毫秒 */
export function useRemaining(endsAt: number, now: () => number, active: boolean) {
  const [ms, setMs] = useState(() => Math.max(0, endsAt - now()))
  useEffect(() => {
    if (!active) return
    let raf = 0
    const tick = () => {
      setMs(Math.max(0, endsAt - now()))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [endsAt, now, active])
  return ms
}

/** 顶部倒计时条，最后 3 秒变黄闪烁 */
export function Clock({ startsAt, endsAt, now, active }: { startsAt: number; endsAt: number; now: () => number; active: boolean }) {
  const ms = useRemaining(endsAt, now, active)
  const total = Math.max(1, endsAt - startsAt)
  const frac = Math.min(1, ms / total)
  const urgent = ms <= 3000
  // 最后 3 秒整秒时震一下
  const lastSec = useRef(-1)
  useEffect(() => {
    const s = Math.ceil(ms / 1000)
    if (active && urgent && s !== lastSec.current && s > 0) {
      lastSec.current = s
      vibrate(30)
    }
  }, [ms, urgent, active])
  return (
    <div className="pg-clockwrap">
      <div className="pg-clock-num">{(ms / 1000).toFixed(1)}</div>
      <div className={'pg-clock' + (urgent ? ' urgent' : '')}>
        <i style={{ transform: `scaleX(${frac})` }} />
      </div>
    </div>
  )
}

/** INTRO：动词大字 + 图标 */
export function Intro({ icon, verb, hint }: { icon: string; verb: string; hint: string }) {
  return (
    <div className="pg-big">
      <div className="stripes" />
      <div className="icon">{icon}</div>
      <h1>{verb}</h1>
      <p>{hint}</p>
    </div>
  )
}

/** 收卷：时间到 */
export function Collecting({ line }: { line: string }) {
  return (
    <div className="pg-big">
      <div className="icon">⏱️</div>
      <h1>TIME'S UP!</h1>
      <p>{line}</p>
      <div className="dots">
        <i />
        <i />
        <i />
      </div>
    </div>
  )
}

const MEDAL = ['🥇', '🥈', '🥉']

/** 阵营本轮名次 + 前进格数 */
export function RankLine({ faction, result }: { faction: Faction; result: ResultPayload }) {
  const f = FACTIONS[faction]
  const r = result.ranks[faction]
  const mv = result.moves[faction]
  const allTied = result.ranks.every((x) => x === 1)
  return (
    <div className="pg-rank">
      <div className="pos">{allTied ? '🤝' : (MEDAL[r - 1] ?? '🏁')}</div>
      <div className="txt">
        {allTied ? `All three tied · ${f.emoji} ${f.name}` : `${f.emoji} ${f.name} finished #${r}`}
        <br />
        <span style={{ opacity: 0.85, fontSize: 14 }}>now on square {result.positions[faction]}</span>
      </div>
      <div className="mv">+{mv} 🏃</div>
    </div>
  )
}

export function MvpBanner() {
  return <div className="pg-mvp">🏆 TOP 3 OF THE WHOLE ROOM 🏆</div>
}

/** 在按钮上点出一圈波纹 */
export function spawnRipple(e: RPE<HTMLElement>) {
  const el = e.currentTarget
  const rect = el.getBoundingClientRect()
  const d = Math.max(rect.width, rect.height) * 1.6
  const s = document.createElement('span')
  s.className = 'pg-ripple'
  s.style.width = s.style.height = `${d}px`
  s.style.left = `${e.clientX - rect.left}px`
  s.style.top = `${e.clientY - rect.top}px`
  el.appendChild(s)
  setTimeout(() => s.remove(), 520)
}
