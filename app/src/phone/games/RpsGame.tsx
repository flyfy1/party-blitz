// ✊ 阵营猜拳（DESIGN.md §5）：投票给自己阵营的出拳，可以改投。最后 3 秒大屏遮住投票条，手机提示"锁定你的选择"。
import { useEffect, useMemo, useRef, useState } from 'react'
import { FACTIONS, KIND_META } from '../../shared/factions'
import type { Triple } from '../../shared/types'
import { Clock, Collecting, Intro, MvpBanner, RankLine, spawnRipple, useRemaining, vibrate } from './common'
import { HAND, beats } from '../../shared/extras'
import type { RpsProps } from './types'

const meta = KIND_META.rps
/** 大屏在最后 3 秒遮住投票条（DESIGN.md §5） */
const HIDE_MS = 3000

export default function RpsGame(p: RpsProps) {
  const [vote, setVote] = useState<number | null>(null)
  const [changes, setChanges] = useState(0)
  const f = FACTIONS[p.faction]
  const style = { '--fc': f.color, '--fcl': f.light, '--fcd': f.dark } as React.CSSProperties
  const remaining = useRemaining(p.endsAt, p.now, p.phase === 'play')
  const hidden = p.phase === 'play' && remaining <= HIDE_MS

  const lastKey = useRef(`${p.startsAt}`)
  useEffect(() => {
    if (lastKey.current !== `${p.startsAt}`) {
      lastKey.current = `${p.startsAt}`
      setVote(null)
      setChanges(0)
    }
  }, [p.startsAt])

  // 进入"遮住"阶段时震一下提醒
  const hiddenRef = useRef(false)
  useEffect(() => {
    if (hidden && !hiddenRef.current) vibrate([50, 50, 50])
    hiddenRef.current = hidden
  }, [hidden])

  const cast = (h: number) => {
    if (p.phase !== 'play') return
    if (vote === h) {
      vibrate(15)
      return
    }
    if (vote !== null) setChanges((c) => c + 1)
    setVote(h)
    vibrate(vote === null ? [20, 30, 50] : 25)
    void p.onSubmit(h)
  }

  if (p.phase === 'intro') return <div className="pg" style={style}><Intro icon={meta.icon} verb={meta.verb} hint={`Vote ${f.name}'s hand. Majority decides!`} /></div>
  if (p.phase === 'collect') {
    return (
      <div className="pg" style={style}>
        <Collecting line={vote === null ? `No vote… ${f.name} throws whatever the others picked` : `You voted ${HAND[vote].emoji} ${HAND[vote].name}. Counting ${f.name}'s votes…`} />
      </div>
    )
  }
  if (p.phase === 'result' || p.phase === 'done') return <RpsResult {...p} vote={vote} style={style} />

  return (
    <div className="pg" style={style}>
      <Clock startsAt={p.startsAt} endsAt={p.endsAt} now={p.now} active />
      <div className="pg-title">
        <h2>
          {f.emoji} {f.name} throws…
        </h2>
        <p>{vote === null ? 'Tap a hand · you can change your mind' : hidden ? 'Big screen is hidden – commit!' : `Voted ${HAND[vote].emoji} · tap another to switch`}</p>
      </div>
      <div className="pg-choices">
        {HAND.map((h, i) => {
          const cls = ['pg-choice', vote === i ? 'picked' : '', vote !== null && vote !== i ? 'dim' : ''].join(' ')
          return (
            <button
              key={i}
              className={cls}
              onPointerDown={(e) => {
                spawnRipple(e)
                cast(i)
              }}
            >
              <span className="em">{h.emoji}</span>
              <span className="lb">{h.name}</span>
              {vote === i && <span className="tag">VOTED ✓</span>}
            </button>
          )
        })}
      </div>
      <div className={'pg-foot' + (hidden ? ' hot' : '')}>
        {hidden ? (
          <span>
            🙈 Votes hidden on the big screen!
            <br />
            <span className="pg-hidden-note">Final 3 seconds – lock it in</span>
          </span>
        ) : vote === null ? (
          `Rock beats Scissors · Paper beats Rock · Scissors beats Paper`
        ) : changes > 0 ? (
          `Changed ${changes}× · last one counts`
        ) : (
          'Think what the other factions will throw…'
        )}
      </div>
    </div>
  )
}

function RpsResult(p: RpsProps & { vote: number | null; style: React.CSSProperties }) {
  const ex = p.extra ?? null
  const hands: Triple | null = ex ? ex.hands : null
  const scores = p.result?.scores ?? null
  const myScore = scores ? scores[p.faction] : null
  const distinct = hands ? new Set(hands).size : 0
  const allTie = hands ? distinct === 1 || distinct === 3 : false

  const matchups = useMemo(() => {
    if (!hands || allTie) return []
    const out: string[] = []
    for (let a = 0; a < 3; a++)
      for (let b = 0; b < 3; b++)
        if (a !== b && beats(hands[a], hands[b])) out.push(`${FACTIONS[a].emoji} ${HAND[hands[a]].emoji} beats ${HAND[hands[b]].emoji} ${FACTIONS[b].emoji}`)
    return out
  }, [hands, allTie])

  useEffect(() => {
    if (p.isMvp) vibrate([60, 40, 60, 40, 120])
    else if (myScore && myScore > 0) vibrate([40, 30, 80])
    else if (myScore === 0 && !allTie) vibrate(200)
  }, [p.isMvp, myScore, allTie])

  let icon = '✊'
  let head = 'Results are in'
  let sub = 'Check the big screen'
  if (hands) {
    const mine = hands[p.faction]
    const followed = p.vote === null ? ' · you did not vote' : p.vote === mine ? ' · you voted with the majority' : ` · you voted ${HAND[p.vote].emoji}, majority chose ${HAND[mine].emoji}`
    if (allTie) {
      icon = '🤝'
      head = distinct === 1 ? 'EVERYONE THREW THE SAME!' : 'THREE-WAY TIE!'
      sub = `Nobody moves ahead${followed}`
    } else if (myScore === 2) {
      icon = '🔥'
      head = 'DOUBLE KO!'
      sub = `${FACTIONS[p.faction].name} ${HAND[mine].emoji} smashed both factions${followed}`
    } else if (myScore === 1) {
      icon = '🎉'
      head = 'WE WIN ONE!'
      sub = `${FACTIONS[p.faction].name} threw ${HAND[mine].emoji}${followed}`
    } else {
      icon = '😵'
      head = 'SMASHED'
      sub = `${FACTIONS[p.faction].name} threw ${HAND[mine].emoji} and lost${followed}`
    }
  }
  if (p.isMvp) {
    icon = '🏆'
    head = 'TOP 3!'
    sub = 'Fastest vote in the winning faction'
  }

  return (
    <div className={'pg-result' + (p.isMvp ? ' gold' : '')} style={p.style}>
      <div className="pg-headline">
        <div className="icon">{icon}</div>
        <h1>{head}</h1>
        <p>{sub}</p>
      </div>
      {hands && (
        <div className="pg-hands">
          {hands.map((h, fi) => {
            const s = scores ? scores[fi] : 0
            const cls = allTie ? '' : s > 0 ? ' win' : ' lose'
            return (
              <div key={fi} className={'pg-hand' + cls} style={{ '--hc': FACTIONS[fi].color } as React.CSSProperties}>
                <div className="fist">
                  <i>{HAND[h].emoji}</i>
                </div>
                <div className="nm">
                  {FACTIONS[fi].emoji} {FACTIONS[fi].name}
                </div>
                <div className="sc">{allTie ? 'tie' : s === 2 ? 'beat 2' : s === 1 ? 'beat 1' : 'beat 0'}</div>
                {fi === p.faction && <div className="me">YOU</div>}
              </div>
            )
          })}
        </div>
      )}
      {matchups.length > 0 && (
        <div className="pg-matchups">
          {matchups.map((m) => (
            <div key={m}>{m}</div>
          ))}
        </div>
      )}
      {p.isMvp && <MvpBanner />}
      {p.result && <RankLine faction={p.faction} result={p.result} />}
    </div>
  )
}
