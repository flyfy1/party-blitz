// 🤔 少数派大屏（DESIGN.md §5）：三根透明管子，每个提交变成一颗阵营色小球掉进去。
// PLAY 阶段不显示数字；收卷（collecting）时揭晓：人最少的管子发光、戴皇冠、爆彩带。
// Props 和 Race / Darts 一致，Screen.tsx 里一行接入。
import { useEffect, useMemo, useRef } from 'react'
import { FACTIONS, KIND_META } from '../../shared/factions'
import { minorityExtra } from '../../shared/extras'
import { parseMinorityOptions } from '../../shared/questions'
import type { InputRow, Triple } from '../../shared/types'
import { burst, shake } from '../views'
import './stages.css'

export interface MinorityStageProps {
  rows: InputRow[]
  counts: Triple
  secondsLeft: number
  collecting: boolean
  roundIdx: number
  /** rounds.options（题目） */
  options?: unknown
}

const GLASS_W = 368 // 380 - 2×6 border
const GLASS_H = 528

/** 管子里第 k 颗球的位置（从底部往上一排排堆） */
function layout(n: number) {
  let d = 46
  let cols = Math.floor((GLASS_W - 12) / d)
  while (Math.ceil(n / cols) * d > GLASS_H - 40 && d > 18) {
    d -= 4
    cols = Math.floor((GLASS_W - 12) / d)
  }
  const pad = (GLASS_W - cols * d) / 2
  return { d, cols, pad }
}

export function MinorityStage({ rows, counts, secondsLeft, collecting, roundIdx, options }: MinorityStageProps) {
  const q = useMemo(() => parseMinorityOptions(options), [options])
  const m = KIND_META.minority
  // 按提交先后排序，这样新球永远落在最上面
  const sorted = useMemo(() => [...rows].sort((a, b) => Date.parse(a.first_at) - Date.parse(b.first_at)), [rows])
  const perTube: InputRow[][] = [[], [], []]
  for (const r of sorted) {
    const o = Math.round(r.value)
    if (o >= 0 && o <= 2) perTube[o].push(r)
  }
  const ex = useMemo(() => minorityExtra(rows), [rows])
  const rare = new Set(collecting ? ex.minority : [])
  const total = counts[0] + counts[1] + counts[2]

  // 揭晓：发光 + 震屏 + 彩带（每根少数派管子都爆一次）
  const revealed = useRef(false)
  useEffect(() => {
    if (!collecting || revealed.current) return
    revealed.current = true
    shake(300)
    const xs = [0.25, 0.5, 0.75]
    ex.minority.forEach((o, i) => setTimeout(() => burst(xs[o], 0.55, ['#FFD633', '#fff', FACTIONS[0].color, FACTIONS[1].color, FACTIONS[2].color]), i * 120))
  }, [collecting, ex.minority])

  const rareLabel = ex.minority.length === 3 ? 'ALL TIED!' : ex.minority.length === 0 ? 'NO PICKS!' : ex.minority.map((o) => `${q.emoji[o]} ${q.choices[o].toUpperCase()}`).join(' & ')

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div className="st-head">ROUND {roundIdx + 1} · {m.icon} {m.title}</div>
      <div className="st-head-r">{rows.length} / {total} picked</div>
      <div className="st-counter">
        {collecting ? (
          <span className="st-word pop" style={{ position: 'static', fontSize: 120 }}>TIME'S UP!</span>
        ) : (
          <span key={secondsLeft} className={`counter pop ${secondsLeft <= 3 ? 'pulse' : ''}`} style={{ fontSize: 150, color: secondsLeft <= 3 ? '#FFD633' : '#fff' }}>
            {secondsLeft}
          </span>
        )}
      </div>
      {collecting ? (
        <div className="mn-q pop" style={{ color: '#FFD633', animationDelay: '0.35s', fontSize: 64 }}>RAREST: {rareLabel}</div>
      ) : (
        <div className="mn-q">{q.q}</div>
      )}
      <div className="mn-tubes">
        {perTube.map((balls, o) => {
          const { d, cols, pad } = layout(balls.length)
          const isRare = rare.has(o)
          const cls = 'mn-tube' + (collecting ? (isRare ? ' rare' : ' dim') : '')
          return (
            <div key={o} className={cls}>
              <div className="mn-glass">
                {balls.map((r, k) => {
                  const col = k % cols
                  const row = Math.floor(k / cols)
                  return (
                    <div
                      key={r.player_id}
                      className="mn-ball"
                      style={{
                        width: d - 4,
                        height: d - 4,
                        left: pad + col * d + 2,
                        bottom: 10 + row * d,
                        background: FACTIONS[r.faction]?.color ?? '#fff',
                      }}
                    />
                  )
                })}
                {collecting ? <div className="mn-count pop">{isRare ? '👑 ' : ''}{balls.length}</div> : <div className="mn-count hidden-q">?</div>}
              </div>
              <div className="mn-label">
                <span className="em">{q.emoji[o]}</span>
                {q.choices[o]}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
