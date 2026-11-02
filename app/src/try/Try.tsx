// Practice page linked from the landing page: pick any mini-game and play one round on the real
// phone component against local bots. No Supabase, no network; scoring uses shared/scoring.ts.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FACTIONS, KIND_META } from '../shared/factions'
import { scoreRound } from '../shared/scoring'
import { minorityExtra, rpsExtra } from '../shared/extras'
import { holdExtra, quizExtra } from '../shared/scoring.p3'
import { pickQuestion } from '../shared/questions'
import { pickQuiz, parseQuizOptions } from '../shared/quiz'
import { REACT_MAX, makeReactOptions, parseReactOptions } from '../shared/react'
import { NORMAL, phaseAt, type Phase } from '../shared/timing'
import type { Faction, InputRow, Kind, ResultPayload, RoundPayload, Triple } from '../shared/types'
import Mash from '../phone/Mash'
import Stop from '../phone/Stop'
import { HoldGame, MinorityGame, QuizGame, RpsGame } from '../phone/games'
import ReactGame from '../phone/games/ReactGame'
import { Intro, MvpBanner, RankLine } from '../phone/games/common'
import '../phone/phone.css'
import './try.css'

const KINDS: Kind[] = ['mash', 'stop', 'quiz', 'react', 'minority', 'rps', 'hold']
const ME = 'me'
const BOT_N = 30
const T = NORMAL

interface Round { kind: Kind; startsAt: number; endsAt: number; options: unknown; payload: RoundPayload; bots: InputRow[] }

const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5
const iso = (ms: number) => new Date(ms).toISOString()

function botValue(kind: Kind, f: number, options: unknown, startsAt: number, playMs: number): { value: number; at: number } {
  switch (kind) {
    case 'mash': return { value: Math.round((5 + Math.random() * 6) * playMs / 1000), at: startsAt + 300 }
    case 'stop': return { value: Math.min(1, Math.abs(gauss()) * 0.45), at: startsAt + 800 + Math.random() * (playMs - 1200) }
    case 'quiz': { const a = parseQuizOptions(options).answer; return { value: Math.random() < 0.55 ? a : (a + 1 + Math.floor(Math.random() * 2)) % 3, at: startsAt + 400 + Math.random() * (playMs - 900) } }
    case 'react': { const { goAt } = parseReactOptions(options, startsAt); const early = Math.random() < 0.08; const v = early ? REACT_MAX : Math.min(REACT_MAX, 170 + Math.abs(gauss()) * 350); return { value: v, at: early ? goAt - 200 : goAt + v } }
    case 'minority': { const w = [0.5, 0.3, 0.2]; let r = Math.random(); let v = 0; while (r > w[v] && v < 2) { r -= w[v]; v++ } return { value: v, at: startsAt + 300 + Math.random() * (playMs - 800) } }
    case 'rps': return { value: Math.random() < 0.7 ? f : Math.floor(Math.random() * 3), at: startsAt + 300 + Math.random() * (playMs - 800) }
    case 'hold': return { value: Math.min(1, Math.abs(gauss()) * 0.14), at: startsAt + 5000 + gauss() * 700 }
  }
}

function makeRound(kind: Kind): Round {
  const startsAt = Date.now() + T.intro
  const endsAt = startsAt + T.play
  const options = kind === 'minority' ? pickQuestion() : kind === 'quiz' ? pickQuiz() : kind === 'react' ? makeReactOptions(startsAt) : null
  const bots: InputRow[] = []
  for (let i = 0; i < BOT_N; i++) {
    if (Math.random() < 0.07) continue
    const f = (i % 3) as Faction
    const b = botValue(kind, f, options, startsAt, T.play)
    bots.push({ player_id: `bot-${i}`, nickname: `Bot ${i}`, faction: f, value: b.value, first_at: iso(b.at) })
  }
  const payload: RoundPayload = { type: 'round', round_idx: 0, round_id: `try-${kind}-${startsAt}`, kind, options: options ?? undefined, starts_at: iso(startsAt), ends_at: iso(endsAt) }
  return { kind, startsAt, endsAt, options, payload, bots }
}

function readKind(): Kind | null {
  const g = new URLSearchParams(location.search).get('game')
  return KINDS.includes(g as Kind) ? (g as Kind) : null
}

export default function Try() {
  const [kind, setKind] = useState<Kind | null>(readKind)
  const faction = useMemo(() => Math.floor(Math.random() * 3) as Faction, [])
  const [seq, setSeq] = useState(0)

  const go = useCallback((k: Kind | null) => {
    history.replaceState(null, '', k ? `${location.pathname}?game=${k}` : location.pathname)
    setKind(k)
    setSeq((s) => s + 1)
  }, [])

  if (!kind) return <Picker onPick={go} />
  return <Play key={`${kind}-${seq}`} kind={kind} faction={faction} onAgain={() => go(kind)} onMenu={() => go(null)} />
}

function Picker({ onPick }: { onPick: (k: Kind) => void }) {
  return (
    <div className="try-menu">
      <a className="try-back" href="/vote.html">← Party Blitz</a>
      <h1>Practice mode</h1>
      <p>Pick a mini-game and play one round against 30 robot players. Nothing is sent anywhere.</p>
      <div className="try-grid">
        {KINDS.map((k) => {
          const m = KIND_META[k]
          return (
            <button key={k} className="try-card" onClick={() => onPick(k)}>
              <span className="ic">{m.icon}</span>
              <span className="tt">{m.title}</span>
              <span className="hn">{m.hint}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function Play({ kind, faction, onAgain, onMenu }: { kind: Kind; faction: Faction; onAgain: () => void; onMenu: () => void }) {
  const round = useMemo(() => makeRound(kind), [kind])
  const [phase, setPhase] = useState<Phase>('intro')
  const [remaining, setRemaining] = useState(Math.ceil(T.play / 1000))
  const [result, setResult] = useState<ResultPayload | null>(null)
  const [local, setLocal] = useState<number | null>(null)
  const me = useRef<InputRow | null>(null)
  const scored = useRef(false)
  const now = useCallback(() => Date.now(), [])
  const f = FACTIONS[faction]
  const style = { '--fc': f.color, '--fl': f.light, '--fd': f.dark, '--fcl': f.light, '--fcd': f.dark } as React.CSSProperties

  const counts: Triple = useMemo(() => {
    const c: Triple = [0, 0, 0]
    for (let i = 0; i < BOT_N; i++) c[i % 3]++
    c[faction]++
    return c
  }, [faction])

  // Local phase clock (rAF, like the real phone); score once when PLAY ends and stay on the result.
  useEffect(() => {
    let raf = 0
    const tick = () => {
      const t = Date.now()
      const ph = phaseAt(t, round.startsAt, round.endsAt, T)
      setPhase(ph === 'done' ? 'result' : ph)
      setRemaining(Math.max(0, Math.ceil((round.endsAt - t) / 1000)))
      if (ph !== 'intro' && ph !== 'play' && !scored.current) {
        scored.current = true
        const rows = me.current ? [...round.bots, me.current] : round.bots
        const r = scoreRound(kind, rows, counts, [0, 0, 0], false, round.options)
        const extra = kind === 'minority' ? minorityExtra(rows) : kind === 'rps' ? rpsExtra(rows) : kind === 'quiz' ? quizExtra(rows, parseQuizOptions(round.options).answer) : kind === 'hold' ? holdExtra(rows, counts) : undefined
        setResult({ type: 'result', round_idx: 0, kind, ranks: r.ranks, scores: r.scores, moves: r.moves, positions: r.positions, mvp: r.mvp, ...(extra ? { extra } : {}) } as ResultPayload)
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [round, kind, counts])

  const onSubmit = useCallback((v: number) => {
    const first = me.current?.first_at ?? iso(Date.now())
    me.current = { player_id: ME, nickname: 'You', faction, value: v, first_at: first }
  }, [faction])
  const submitAsync = useCallback(async (_id: string, v: number) => onSubmit(v), [onSubmit])

  const shown = phase === 'result' ? result : null
  const isMvp = !!shown?.mvp.some((m) => m.player_id === ME)
  const extra = (shown as { extra?: unknown } | null)?.extra ?? null
  const common = { phase, faction, startsAt: round.startsAt, endsAt: round.endsAt, now, onSubmit, result: shown, isMvp }
  const meta = KIND_META[kind]

  let body: React.ReactNode
  if ((kind === 'mash' || kind === 'stop') && phase === 'intro') {
    body = <div className="pg" style={style}><Intro icon={meta.icon} verb={meta.verb} hint={meta.hint} /></div>
  } else if ((kind === 'mash' || kind === 'stop') && shown) {
    const head = kind === 'mash' ? `${local ?? 0} taps` : local === null ? 'No tap' : `${Math.round((1 - local) * 100)}% accuracy`
    body = (
      <div className={'pg-result' + (isMvp ? ' gold' : '')} style={style}>
        <div className="pg-headline">
          <div className="icon">{isMvp ? '🏆' : shown.ranks[faction] === 1 ? '🥇' : '🙌'}</div>
          <h1>{head}</h1>
          <p>{isMvp ? 'Top 3 of the whole room!' : `${f.name} finished #${shown.ranks[faction]}`}</p>
        </div>
        {isMvp && <MvpBanner />}
        <RankLine faction={faction} result={shown} />
      </div>
    )
  } else if (kind === 'mash') {
    body = <div className="ph" style={style}><Mash roundId={round.payload.round_id} phase={phase} remaining={remaining} submit={submitAsync} onLocal={setLocal} /></div>
  } else if (kind === 'stop') {
    body = <div className="ph" style={style}><Stop round={round.payload} phase={phase} remaining={remaining} submit={submitAsync} onLocal={setLocal} /></div>
  } else if (kind === 'quiz') body = <QuizGame {...common} options={round.options} extra={extra as never} />
  else if (kind === 'react') body = <ReactGame {...common} options={round.options} extra={extra} />
  else if (kind === 'minority') body = <MinorityGame {...common} options={round.options} extra={extra as never} />
  else if (kind === 'rps') body = <RpsGame {...common} extra={extra as never} />
  else body = <HoldGame {...common} extra={extra as never} />

  return (
    <div className="try-wrap">
      <div className="try-phone" style={style}>
        <div className="try-head">
          <button className="try-x" onClick={onMenu} aria-label="All games">←</button>
          <span>You are {f.emoji} <b>{f.name}</b> · Practice</span>
        </div>
        <div className="try-body">{body}</div>
        {phase === 'result' && (
          <div className="try-foot">
            <button className="try-btn primary" onClick={onAgain}>▶ Play again</button>
            <button className="try-btn" onClick={onMenu}>All games</button>
          </div>
        )}
      </div>
    </div>
  )
}
