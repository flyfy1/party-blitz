// 🤔 少数派大屏（DESIGN.md §5）：三根透明管子，每个提交变成一颗阵营色小球掉进去。
// PLAY 阶段不显示数字；收卷（collecting）时揭晓：人最少的管子发光、戴皇冠、爆彩带。
// Props 和 Race / Darts 一致，Screen.tsx 里一行接入。
import { useEffect, useMemo, useRef } from 'react'
import { FACTIONS, KIND_META } from '../../shared/factions'
import { minorityExtra } from '../../shared/extras'
import { parseMinorityOptions } from '../../shared/questions'
import type { InputRow, Triple } from '../../shared/types'
import { burst, shake } from '../views'
import { Tubes } from './Tubes'
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

export function MinorityStage({ rows, counts, secondsLeft, collecting, roundIdx, options }: MinorityStageProps) {
  const q = useMemo(() => parseMinorityOptions(options), [options])
  const m = KIND_META.minority
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
      <Tubes rows={rows} labels={q.choices.map((c, i) => ({ emoji: q.emoji[i], text: c }))} collecting={collecting} highlight={rare} />
    </div>
  )
}
