// 🤔 少数派（DESIGN.md §5）：三选一，只能选一次，选完锁定。揭晓时显示三根柱子，人最少的发光。
import { useEffect, useMemo, useRef, useState } from 'react'
import { FACTIONS } from '../../shared/factions'
import { KIND_META } from '../../shared/factions'
import { Clock, Collecting, Intro, MvpBanner, RankLine, spawnRipple, vibrate } from './common'
import { parseMinorityOptions } from '../../shared/questions'
import type { MinorityProps } from './types'

const meta = KIND_META.minority

export default function MinorityGame(p: MinorityProps) {
  const q = useMemo(() => parseMinorityOptions(p.options), [p.options])
  const [picked, setPicked] = useState<number | null>(null)
  const f = FACTIONS[p.faction]
  const style = { '--fc': f.color, '--fcl': f.light, '--fcd': f.dark } as React.CSSProperties

  // 换题（新一轮）时重置
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

  if (p.phase === 'intro') return <div className="pg" style={style}><Intro icon={meta.icon} verb={meta.verb} hint="Pick what the FEWEST people pick" /></div>
  if (p.phase === 'collect') {
    return (
      <div className="pg" style={style}>
        <Collecting line={picked === null ? 'No pick… 💤' : `You picked ${q.emoji[picked]} ${q.choices[picked]}. Counting the room…`} />
      </div>
    )
  }
  if (p.phase === 'result' || p.phase === 'done') return <MinorityResult {...p} picked={picked} style={style} />

  // PLAY
  return (
    <div className="pg" style={style}>
      <Clock startsAt={p.startsAt} endsAt={p.endsAt} now={p.now} active />
      <div className="pg-title">
        <h2>{q.q}</h2>
        <p>{picked === null ? 'The RAREST answer wins · one tap only' : 'Locked in. Fingers crossed 🤞'}</p>
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
              <span className="em">{q.emoji[i]}</span>
              <span className="lb">{c}</span>
              {picked === i && <span className="tag">LOCKED ✓</span>}
            </button>
          )
        })}
      </div>
      <div className={'pg-foot' + (picked === null ? '' : '')}>
        {picked === null ? 'Think: what will nobody else choose?' : 'Watch the big screen 👀'}
      </div>
    </div>
  )
}

function MinorityResult(p: MinorityProps & { picked: number | null; style: React.CSSProperties }) {
  const q = useMemo(() => parseMinorityOptions(p.options), [p.options])
  const ex = p.extra ?? null
  const rare = ex ? new Set(ex.minority) : null
  const iWon = p.picked !== null && rare ? rare.has(p.picked) : null
  const max = ex ? Math.max(1, ...ex.tally) : 1
  const total = ex ? ex.tally[0] + ex.tally[1] + ex.tally[2] : 0

  useEffect(() => {
    if (p.isMvp) vibrate([60, 40, 60, 40, 120])
    else if (iWon) vibrate([40, 30, 80])
  }, [p.isMvp, iWon])

  let icon = '🤔'
  let head = 'Results are in'
  let sub = 'Check the big screen'
  if (p.picked === null) {
    icon = '💤'
    head = 'NO PICK'
    sub = 'Tap faster next round!'
  } else if (iWon === true) {
    icon = '🎉'
    head = 'YOU PICKED THE RARE ONE!'
    sub = `Only ${ex!.tally[p.picked]} of ${total} chose ${q.emoji[p.picked]} ${q.choices[p.picked]}`
  } else if (iWon === false) {
    icon = '😅'
    head = 'TOO POPULAR'
    sub = `${ex!.tally[p.picked]} of ${total} picked ${q.emoji[p.picked]} too`
  }
  if (p.isMvp) {
    icon = '🏆'
    head = 'TOP 3!'
    sub = 'You were one of the first with the rare answer'
  }

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
            const isRare = rare!.has(i)
            return (
              <div key={i} className={'pg-bar' + (isRare ? ' rare' : '')}>
                <div className="col" style={{ height: `${h}%`, animationDelay: `${i * 0.12}s` }}>
                  {isRare && <div className="crown">👑</div>}
                  <div className="n">{ex.tally[i]}</div>
                  {p.picked === i && <div className="me" style={{ left: '50%', transform: 'translateX(-50%)' }}>YOU</div>}
                </div>
                <div className="em">{q.emoji[i]}</div>
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
