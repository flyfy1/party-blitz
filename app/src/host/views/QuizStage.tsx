// 🧠 问答大屏：三根管子接答案小球（和 Minority 共用 Tubes）。收卷时正确答案的管子发光 + 皇冠 + 彩带，并显示答案文字。
import { useEffect, useMemo, useRef } from 'react'
import { FACTIONS } from '../../shared/factions'
import { parseQuizOptions } from '../../shared/quiz'
import { KIND_META_P3, quizExtra } from '../../shared/scoring.p3'
import type { InputRow, Triple } from '../../shared/types'
import { burst, shake } from '../views'
import { Tubes } from './Tubes'
import './stages.css'

export interface QuizStageProps {
  rows: InputRow[]
  counts: Triple
  secondsLeft: number
  collecting: boolean
  roundIdx: number
  /** rounds.options（题目 + 答案） */
  options?: unknown
}

const LETTER = ['🅰️', '🅱️', '🅲']

export function QuizStage({ rows, counts, secondsLeft, collecting, roundIdx, options }: QuizStageProps) {
  const q = useMemo(() => parseQuizOptions(options), [options])
  const m = KIND_META_P3.quiz
  const ex = useMemo(() => quizExtra(rows, q.answer), [rows, q.answer])
  const total = counts[0] + counts[1] + counts[2]
  const correctPct = rows.length ? Math.round((ex.tally[q.answer] / rows.length) * 100) : 0

  const revealed = useRef(false)
  useEffect(() => {
    if (!collecting || revealed.current) return
    revealed.current = true
    shake(300)
    burst([0.25, 0.5, 0.75][q.answer], 0.55, ['#FFD633', '#fff', FACTIONS[0].color, FACTIONS[1].color, FACTIONS[2].color])
  }, [collecting, q.answer])

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div className="st-head">ROUND {roundIdx + 1} · {m.icon} {m.title}</div>
      <div className="st-head-r">{rows.length} / {total} answered</div>
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
        <div className="mn-q pop" style={{ color: '#FFD633', animationDelay: '0.35s', fontSize: 64 }}>
          ANSWER: {LETTER[q.answer]} {q.choices[q.answer].toUpperCase()} · {correctPct}% got it
        </div>
      ) : (
        <div className="mn-q" style={{ fontSize: 60 }}>{q.q}</div>
      )}
      <Tubes rows={rows} labels={q.choices.map((c, i) => ({ emoji: LETTER[i], text: c }))} collecting={collecting} highlight={new Set(collecting ? [q.answer] : [])} />
    </div>
  )
}
