// ⏱️ 按住五秒大屏：中间一条大大的 "5.00 s" 目标线，三根阵营条随着松手的人数填满。
// 收卷时显示每个阵营的人均偏差和全场最接近的人。
import { useEffect, useMemo, useRef } from 'react'
import { FACTIONS } from '../../shared/factions'
import { HOLD_TARGET_MS, KIND_META_P3, holdExtra } from '../../shared/scoring.p3'
import type { InputRow, Triple } from '../../shared/types'
import { Roll, burst, shake } from '../views'
import './stages.css'

export interface HoldStageProps {
  rows: InputRow[]
  counts: Triple
  secondsLeft: number
  collecting: boolean
  roundIdx: number
}

export function HoldStage({ rows, counts, secondsLeft, collecting, roundIdx }: HoldStageProps) {
  const m = KIND_META_P3.hold
  const total = counts[0] + counts[1] + counts[2]
  const released: Triple = [0, 0, 0]
  for (const r of rows) if (r.faction >= 0 && r.faction < 3) released[r.faction]++
  const ex = useMemo(() => holdExtra(rows, counts), [rows, counts])
  const bestF = collecting ? ex.avgDev.indexOf(Math.min(...ex.avgDev)) : -1

  const revealed = useRef(false)
  useEffect(() => {
    if (!collecting || revealed.current) return
    revealed.current = true
    shake(300)
    burst(0.5, 0.45, ['#FFD633', '#fff'])
  }, [collecting])

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div className="st-head">ROUND {roundIdx + 1} · {m.icon} {m.title}</div>
      <div className="st-head-r">{rows.length} / {total} released</div>
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
        <div className="hd-target pop" style={{ color: '#FFD633' }}>
          {ex.best ? (
            <>
              🎯 {FACTIONS[ex.best.faction].emoji} {ex.best.nick}
              <small>held {ex.best.dev === 0 ? 'exactly' : 'within'} {(ex.best.dev * HOLD_TARGET_MS / 1000).toFixed(2)} s of 5.00</small>
            </>
          ) : (
            <>NOBODY LET GO<small>everyone scores the maximum deviation</small></>
          )}
        </div>
      ) : (
        <div className="hd-target">
          5.00 s<small>press · hold · release at exactly five seconds</small>
        </div>
      )}
      <div className="hd-rows">
        {FACTIONS.map((f, i) => {
          const pct = counts[i] ? (released[i] / counts[i]) * 100 : 0
          return (
            <div key={f.id} className={'hd-row' + (collecting && i === bestF ? ' win' : '')} style={{ background: f.dark, borderColor: f.color }}>
              <span className="em">{f.emoji}</span>
              <span className="nm" style={{ color: f.light }}>{f.name}</span>
              <div className="bar">
                <i style={{ width: `${collecting ? Math.max(3, (1 - Math.min(1, ex.avgDev[i])) * 100) : pct}%`, background: f.color }} />
              </div>
              <span className="val">
                {collecting ? (
                  <>
                    <Roll value={ex.avgDev[i] * HOLD_TARGET_MS / 1000} digits={2} /> s off
                  </>
                ) : (
                  `${released[i]} / ${counts[i]} released`
                )}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
