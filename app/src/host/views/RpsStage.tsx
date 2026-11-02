// ✊ 阵营猜拳大屏（DESIGN.md §5）：PLAY 前 7 秒显示三阵营的实时投票条，最后 3 秒遮住。
// 收卷（collecting）时三只巨大的拳头从三个方向砸向中间，赢家的拳头把输家砸扁。
import { useEffect, useMemo, useRef } from 'react'
import gsap from 'gsap'
import { FACTIONS, KIND_META } from '../../shared/factions'
import { HAND, beats, rpsExtra } from '../../shared/extras'
import { rpsScores } from '../../shared/scoring'
import type { InputRow, Triple } from '../../shared/types'
import { burst, shake } from '../views'
import './stages.css'

export interface RpsStageProps {
  rows: InputRow[]
  counts: Triple
  secondsLeft: number
  collecting: boolean
  roundIdx: number
}

/** 最后 3 秒遮住投票条 */
const HIDE_AT = 3

export function RpsStage({ rows, counts, secondsLeft, collecting, roundIdx }: RpsStageProps) {
  const m = KIND_META.rps
  const ex = useMemo(() => rpsExtra(rows), [rows])
  const scores = useMemo(() => rpsScores(rows, counts), [rows, counts])
  const hidden = !collecting && secondsLeft <= HIDE_AT
  const total = counts[0] + counts[1] + counts[2]
  const distinct = new Set(ex.hands).size
  const allTie = distinct === 1 || distinct === 3

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div className="st-head">ROUND {roundIdx + 1} · {m.icon} {m.title}</div>
      <div className="st-head-r">{rows.length} / {total} voted</div>
      <div className="st-counter">
        <span key={secondsLeft} className={`counter pop ${secondsLeft <= 3 ? 'pulse' : ''}`} style={{ fontSize: 150, color: secondsLeft <= 3 ? '#FFD633' : '#fff' }}>
          {collecting ? '' : secondsLeft}
        </span>
      </div>
      {!collecting && (
        <div className="rp-cols">
          {FACTIONS.map((f, fi) => {
            const v = ex.votes[fi]
            const n = v[0] + v[1] + v[2]
            const lead = ex.hands[fi]
            return (
              <div key={f.id} className="rp-col" style={{ borderColor: f.color }}>
                <h3 style={{ color: f.color }}>
                  {f.emoji} {f.name}
                  <small>{n} / {counts[fi]}</small>
                </h3>
                {HAND.map((h, hi) => (
                  <div key={hi} className={'rp-row' + (n > 0 && hi === lead ? ' lead' : '')}>
                    <span className="em">{h.emoji}</span>
                    <div className="bar">
                      <i style={{ width: `${n ? (v[hi] / n) * 100 : 0}%`, background: f.color }} />
                    </div>
                    <span className="n">{v[hi]}</span>
                  </div>
                ))}
                {hidden && (
                  <div className="rp-cover">
                    <div>
                      <div className="eye">🙈</div>
                      <div className="t">VOTES HIDDEN</div>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      {collecting && <Clash hands={ex.hands} scores={scores} allTie={allTie} />}
    </div>
  )
}

/** 三只拳头砸向中间；赢家放大，输家压扁 */
function Clash({ hands, scores, allTie }: { hands: Triple; scores: Triple; allTie: boolean }) {
  const refs = useRef<(HTMLDivElement | null)[]>([])
  const outcomeRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const els = refs.current.filter(Boolean) as HTMLDivElement[]
    if (els.length < 3) return
    // 起点：左、上、右；终点：围着中心
    const from = [
      { x: -1400, y: 60, rotation: -40 },
      { x: 0, y: -900, rotation: 0 },
      { x: 1400, y: 60, rotation: 40 },
    ]
    const to = [
      { x: -500, y: 60, rotation: -8 },
      { x: 0, y: 60, rotation: 0 },
      { x: 500, y: 60, rotation: 8 },
    ]
    const tl = gsap.timeline()
    els.forEach((el, i) => {
      gsap.set(el, { ...from[i], scale: 1.1 })
      tl.to(el, { ...to[i], duration: 0.38, ease: 'power3.in' }, 0)
    })
    tl.add(() => {
      shake(300)
      burst(0.5, 0.5, ['#fff', '#FFD633'])
    }, 0.38)
    els.forEach((el, i) => {
      if (allTie) {
        tl.to(el, { scale: 1, y: to[i].y + 10, duration: 0.3, ease: 'back.out(2)' }, 0.4)
      } else if (scores[i] > 0) {
        tl.to(el, { scale: 1.35 + 0.15 * (scores[i] - 1), duration: 0.35, ease: 'back.out(2.5)' }, 0.42)
      } else {
        tl.to(el, { scaleY: 0.35, scaleX: 1.25, y: to[i].y + 130, rotation: to[i].rotation * 3, duration: 0.3, ease: 'bounce.out' }, 0.4)
      }
    })
    if (outcomeRef.current) tl.fromTo(outcomeRef.current, { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.4, ease: 'back.out(2)' }, 0.5)
    return () => {
      tl.kill()
    }
  }, [hands, scores, allTie])

  const lines: string[] = []
  if (!allTie)
    for (let a = 0; a < 3; a++)
      for (let b = 0; b < 3; b++)
        if (a !== b && beats(hands[a], hands[b]) && scores[a] > 0) lines.push(`${FACTIONS[a].emoji} ${HAND[hands[a]].emoji} beats ${HAND[hands[b]].emoji} ${FACTIONS[b].emoji}`)
  const winners = [0, 1, 2].filter((f) => scores[f] === Math.max(...scores) && scores[f] > 0)
  const headline = allTie ? (new Set(hands).size === 1 ? 'ALL THE SAME!' : 'THREE-WAY TIE!') : winners.length === 1 ? `${FACTIONS[winners[0]].name.toUpperCase()} WINS!` : `${winners.map((f) => FACTIONS[f].name.toUpperCase()).join(' & ')} WIN!`

  return (
    <div className="rp-clash">
      <div ref={outcomeRef} className="rp-outcome" style={{ opacity: 0 }}>
        {headline}
        <small>{allTie ? 'Nobody moves ahead 🤝' : lines.join('   ·   ')}</small>
      </div>
      {FACTIONS.map((f, i) => (
        <div
          key={f.id}
          ref={(el) => {
            refs.current[i] = el
          }}
          className="rp-fist"
          style={{ background: f.color, zIndex: scores[i] > 0 ? 3 : 1 }}
        >
          {HAND[hands[i]].emoji}
          <div className="nm">
            {f.emoji} {f.name}
          </div>
        </div>
      ))}
    </div>
  )
}
