// 🧠 问答（P3）：三选一，只能选一次，选完锁定。揭晓时显示正确答案、全场分布和自己答没答对。
import { useEffect, useMemo, useRef, useState } from 'react'
import { FACTIONS } from '../../shared/factions'
import { parseQuizOptions } from '../../shared/quiz'
import { KIND_META_P3, type QuizExtra } from '../../shared/scoring.p3'
import { Clock, Collecting, Intro, MvpBanner, RankLine, spawnRipple, vibrate } from './common'
import type { GameProps } from './types'

export type QuizProps = GameProps<QuizExtra>
const meta = KIND_META_P3.quiz
const LETTER = ['🅰️', '🅱️', '🅲']

export default function QuizGame(p: QuizProps) {
  const q = useMemo(() => parseQuizOptions(p.options), [p.options])
  const [picked, setPicked] = useState<number | null>(null)
  const f = FACTIONS[p.faction]
  const style = { '--fc': f.color, '--fcl': f.light, '--fcd': f.dark } as React.CSSProperties

  const lastKey = useRef(`${p.startsAt}`)
  useEffect(() => {
    if (lastKey.current !== `${p.startsAt}`) {
      lastKey.current = `${p.startsAt}`
      setPicked(null)
    }
  }, [p.startsAt])

  const choose = (i: number) => {
    if (picked !== null || p.phase !== 'play') return
    setPicked(i)
    vibrate([20, 40, 60])
    void p.onSubmit(i)
  }

  if (p.phase === 'intro') return <div className="pg" style={style}><Intro icon={meta.icon} verb={meta.verb} hint={meta.hint} /></div>
  if (p.phase === 'collect') {
    return (
      <div className="pg" style={style}>
        <Collecting line={picked === null ? 'No answer… 💤' : `You said ${LETTER[picked]} ${q.choices[picked]}. Checking…`} />
      </div>
    )
  }
  if (p.phase === 'result' || p.phase === 'done') return <QuizResult {...p} picked={picked} style={style} />

  return (
    <div className="pg" style={style}>
      <Clock startsAt={p.startsAt} endsAt={p.endsAt} now={p.now} active />
      <div className="pg-title">
        <h2 style={{ fontSize: 'clamp(20px, 5.6vw, 28px)' }}>{q.q}</h2>
        <p>{picked === null ? 'One tap · first correct answers are MVPs' : 'Locked in 🔒'}</p>
      </div>
      <div className="pg-choices">
        {q.choices.map((c, i) => {
          const cls = ['pg-choice', picked === i ? 'picked' : '', picked !== null && picked !== i ? 'dim' : '', picked !== null ? 'locked' : ''].join(' ')
          return (
            <button
              key={i}
              className={cls}
              onPointerDown={(e) => {
                if (picked !== null) return
                spawnRipple(e)
                choose(i)
              }}
            >
              <span className="em" style={{ fontSize: 'clamp(32px, 9vw, 44px)' }}>{LETTER[i]}</span>
              <span className="lb" style={{ fontSize: 'clamp(19px, 5.4vw, 26px)' }}>{c}</span>
              {picked === i && <span className="tag">LOCKED ✓</span>}
            </button>
          )
        })}
      </div>
      <div className="pg-foot">{picked === null ? 'Faster correct answers = more MVP points' : 'Watch the big screen 👀'}</div>
    </div>
  )
}

function QuizResult(p: QuizProps & { picked: number | null; style: React.CSSProperties }) {
  const q = useMemo(() => parseQuizOptions(p.options), [p.options])
  const ex = p.extra ?? null
  const answer = ex?.answer ?? q.answer
  const correct = p.picked !== null && p.picked === answer
  const total = ex ? ex.tally[0] + ex.tally[1] + ex.tally[2] : 0
  const max = ex ? Math.max(1, ...ex.tally) : 1

  useEffect(() => {
    if (p.isMvp) vibrate([60, 40, 60, 40, 120])
    else if (correct) vibrate([40, 30, 80])
  }, [p.isMvp, correct])

  let icon = '🤔', head = 'Results are in', sub = 'Check the big screen'
  if (p.picked === null) {
    icon = '💤'; head = 'NO ANSWER'; sub = `It was ${LETTER[answer]} ${q.choices[answer]}`
  } else if (correct) {
    icon = '✅'; head = 'CORRECT!'; sub = ex ? `${ex.tally[answer]} of ${total} got it right` : `${LETTER[answer]} ${q.choices[answer]}`
  } else {
    icon = '❌'; head = 'NOPE'; sub = `It was ${LETTER[answer]} ${q.choices[answer]}`
  }
  if (p.isMvp) { icon = '🏆'; head = 'TOP 3!'; sub = 'One of the first three correct answers' }

  return (
    <div className={'pg-result' + (p.isMvp ? ' gold' : '')} style={p.style}>
      <div className="pg-headline">
        <div className="icon">{icon}</div>
        <h1>{head}</h1>
        <p>{sub}</p>
      </div>
      {ex && (
        <div className="pg-bars">
          {q.choices.map((c, i) => {
            const h = 20 + (ex.tally[i] / max) * 80
            const isAns = i === answer
            return (
              <div key={i} className={'pg-bar' + (isAns ? ' rare' : '')}>
                <div className="col" style={{ height: `${h}%`, animationDelay: `${i * 0.12}s` }}>
                  {isAns && <div className="crown">✅</div>}
                  <div className="n">{ex.tally[i]}</div>
                  {p.picked === i && <div className="me">YOU</div>}
                </div>
                <div className="em">{LETTER[i]}</div>
                <div className="lb">{c}</div>
              </div>
            )
          })}
        </div>
      )}
      {p.isMvp && <MvpBanner />}
      {p.result && <RankLine faction={p.faction} result={p.result} />}
    </div>
  )
}
