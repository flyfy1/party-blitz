// Self-running demo for the landing page: a local simulated game drives the real big-screen views
// and four real phone components (robot fingers tap them). No Supabase, no network, no audio by default.
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { FACTIONS } from '../shared/factions'
import { addMvpPoints, finalResult, scoreRound, type MoveStep } from '../shared/scoring'
import { minorityExtra, rpsExtra } from '../shared/extras'
import { holdExtra, quizExtra } from '../shared/scoring.p3'
import { pickQuestion } from '../shared/questions'
import { pickQuiz, parseQuizOptions } from '../shared/quiz'
import { REACT_MAX, parseReactOptions } from '../shared/react'
import { phaseAt, type Phase, type Timing } from '../shared/timing'
import type { Faction, FinalPayload, GameState, InputRow, Kind, PlayerRow, ResultPayload, RoundPayload, Triple } from '../shared/types'
import { Darts, FinalView, Intro, Lobby, Race, ResultView } from '../host/views'
import { MinorityStage } from '../host/views/MinorityStage'
import { RpsStage } from '../host/views/RpsStage'
import { QuizStage } from '../host/views/QuizStage'
import { ReactStage } from '../host/views/ReactStage'
import { HoldStage } from '../host/views/HoldStage'
import Mash from '../phone/Mash'
import Stop from '../phone/Stop'
import { HoldGame, MinorityGame, QuizGame, RpsGame } from '../phone/games'
import ReactGame from '../phone/games/ReactGame'
import { Intro as PhoneIntro, RankLine } from '../phone/games/common'
import '../host/host.css'
import '../phone/phone.css'
import './demo.css'

// ── schedule + timing ────────────────────────────────────────────────────
const SCHEDULE: Kind[] = ['mash', 'stop', 'quiz', 'react', 'minority', 'rps', 'hold']
const PLAY_MS: Record<Kind, number> = { mash: 4200, stop: 4200, quiz: 4200, react: 4600, minority: 4200, rps: 4600, hold: 6600 }
const T: Timing = { intro: 1300, play: 4200, collect: 1200, result: 2800 }
const LOBBY_MS = 4500
const FINAL_MS = 5500
const timingFor = (k: Kind): Timing => ({ ...T, play: PLAY_MS[k] })

// ── players ──────────────────────────────────────────────────────────────
interface Player { id: string; nick: string; faction: Faction; featured: boolean }
const FEATURED: Player[] = [
  { id: 'f0', nick: 'Brave Durian #37', faction: 0, featured: true },
  { id: 'f1', nick: 'Mystic Laksa #12', faction: 1, featured: true },
  { id: 'f2', nick: 'Sassy Popiah #14', faction: 2, featured: true },
  { id: 'f3', nick: 'Super Satay #27', faction: 0, featured: true },
]
const ADJ = ['Happy', 'Grumpy', 'Cool', 'Feral', 'Shy', 'Blazing', 'Lightning', 'Ghost', 'Chill', 'Hungry']
const FOOD = ['Chicken Rice', 'Kaya Toast', 'Ice Kacang', 'Nasi Lemak', 'Prata', 'Bubble Tea', 'Chilli Crab', 'Satay', 'Popiah', 'Laksa']
const BOTS: Player[] = Array.from({ length: 30 }, (_, i) => ({ id: `b${i}`, nick: `${ADJ[i % 10]} ${FOOD[(i * 7) % 10]} #${(i * 13) % 90 + 10}`, faction: ((i + 1) % 3) as Faction, featured: false }))
const ALL = [...FEATURED, ...BOTS]
const COUNTS: Triple = [0, 0, 0]
for (const p of ALL) COUNTS[p.faction]++

// ── simulation ───────────────────────────────────────────────────────────
type Stage = 'lobby' | 'round' | 'final'
interface Round { idx: number; kind: Kind; startsAt: number; endsAt: number; options: unknown; payload: RoundPayload; bots: BotPlan[] }
interface BotPlan { p: Player; value: number; at: number; rate?: number }
interface Snap {
  stage: Stage; phase: Phase; round: Round | null; secondsLeft: number; rows: InputRow[]
  result: ResultPayload | null; steps: MoveStep[]; fin: FinalPayload | null; lobbyPlayers: PlayerRow[]; loop: number
}

const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5
const iso = (ms: number) => new Date(ms).toISOString()

function planBots(kind: Kind, startsAt: number, playMs: number, options: unknown): BotPlan[] {
  return BOTS.filter(() => Math.random() > 0.07).map((p) => {
    const skill = 0.6 + Math.random() * 0.8
    switch (kind) {
      case 'mash': return { p, value: 0, rate: 5 + Math.random() * 6, at: startsAt + 150 + Math.random() * 400 }
      case 'stop': return { p, value: Math.min(1, Math.abs(gauss()) * 0.45), at: startsAt + 800 + Math.random() * (playMs - 1200) }
      case 'quiz': { const a = parseQuizOptions(options).answer; return { p, value: Math.random() < 0.55 ? a : (a + 1 + Math.floor(Math.random() * 2)) % 3, at: startsAt + 400 + Math.random() * (playMs - 900) } }
      case 'react': { const { goAt } = parseReactOptions(options, startsAt); const early = Math.random() < 0.08; const v = early ? REACT_MAX : 170 + Math.abs(gauss()) * 350 / skill; return { p, value: Math.min(REACT_MAX, v), at: early ? goAt - 200 : goAt + v } }
      case 'minority': { const w = [0.5, 0.3, 0.2]; let r = Math.random(); let v = 0; while (r > w[v] && v < 2) { r -= w[v]; v++ } return { p, value: v, at: startsAt + 300 + Math.random() * (playMs - 800) } }
      case 'rps': { const pref = [0, 1, 2][p.faction]; return { p, value: Math.random() < 0.7 ? pref : Math.floor(Math.random() * 3), at: startsAt + 300 + Math.random() * (playMs - 800) } }
      case 'hold': return { p, value: Math.min(1, Math.abs(gauss()) * 0.14), at: startsAt + 5000 + gauss() * 700 }
    }
  })
}

function botRows(kind: Kind, plans: BotPlan[], t: number, endsAt: number): InputRow[] {
  const out: InputRow[] = []
  for (const b of plans) {
    if (b.at > t) continue
    let v = b.value
    if (kind === 'mash') v = Math.round((Math.min(t, endsAt) - b.at) / 1000 * (b.rate ?? 6))
    out.push({ player_id: b.p.id, nickname: b.p.nick, faction: b.p.faction, value: v, first_at: iso(b.at) })
  }
  return out
}

function makeOptions(kind: Kind, startsAt: number): unknown {
  if (kind === 'minority') return pickQuestion()
  if (kind === 'quiz') return pickQuiz()
  if (kind === 'react') { const after = 1500 + Math.round(Math.random() * 1600); return { go_at: iso(startsAt + after), go_after_ms: after } }
  return null
}

export default function Demo() {
  const [snap, setSnap] = useState<Snap>({ stage: 'lobby', phase: 'intro', round: null, secondsLeft: 0, rows: [], result: null, steps: [], fin: null, lobbyPlayers: [], loop: 0 })
  const S = useRef({
    loop: 0, stage: 'lobby' as Stage, lobbyStart: Date.now(), finalStart: 0, round: null as Round | null, scored: false,
    positions: [0, 0, 0] as Triple, mvpPoints: {} as GameState['mvp_points'], result: null as ResultPayload | null, steps: [] as MoveStep[], fin: null as FinalPayload | null,
    featured: new Map<string, { value: number; first_at: string }>(), lastRowsKey: '',
  })

  const startRound = useCallback((idx: number) => {
    const st = S.current
    const kind = SCHEDULE[idx]
    const startsAt = Date.now() + T.intro
    const endsAt = startsAt + PLAY_MS[kind]
    const options = makeOptions(kind, startsAt)
    const payload: RoundPayload = { type: 'round', round_idx: idx, round_id: `demo-${st.loop}-${idx}`, kind, options: options ?? undefined, starts_at: iso(startsAt), ends_at: iso(endsAt), final: idx === SCHEDULE.length - 1 }
    st.round = { idx, kind, startsAt, endsAt, options, payload, bots: planBots(kind, startsAt, PLAY_MS[kind], options) }
    st.scored = false
    st.result = null
    st.featured = new Map()
    st.stage = 'round'
  }, [])

  const restart = useCallback(() => {
    const st = S.current
    st.loop++
    st.stage = 'lobby'
    st.lobbyStart = Date.now()
    st.round = null
    st.positions = [0, 0, 0]
    st.mvpPoints = {}
    st.result = null
    st.fin = null
  }, [])

  // featured phones submit here (same shape as submit_input)
  const submitFor = useCallback((player: Player) => (value: number) => {
    const st = S.current
    const prev = st.featured.get(player.id)
    const v = st.round?.kind === 'mash' ? Math.max(prev?.value ?? 0, value) : value
    st.featured.set(player.id, { value: v, first_at: prev?.first_at ?? iso(Date.now()) })
  }, [])

  useEffect(() => {
    let raf = 0
    const tick = () => {
      const st = S.current
      const t = Date.now()
      let next: Snap | null = null
      if (st.stage === 'lobby') {
        const n = Math.min(ALL.length, Math.floor(((t - st.lobbyStart) / LOBBY_MS) * ALL.length * 1.15))
        const lobbyPlayers = ALL.slice(0, n).map((p) => ({ id: p.id, nickname: p.nick, faction: p.faction }))
        if (t - st.lobbyStart >= LOBBY_MS) startRound(0)
        else next = { stage: 'lobby', phase: 'intro', round: null, secondsLeft: 0, rows: [], result: null, steps: [], fin: null, lobbyPlayers, loop: st.loop }
      }
      if (st.stage === 'round' && st.round) {
        const r = st.round
        const tm = timingFor(r.kind)
        const ph = phaseAt(t, r.startsAt, r.endsAt, tm)
        const rows = botRows(r.kind, r.bots, t, r.endsAt)
        for (const p of FEATURED) { const f = st.featured.get(p.id); if (f) rows.push({ player_id: p.id, nickname: p.nick, faction: p.faction, value: f.value, first_at: f.first_at }) }
        if ((ph === 'collect' || ph === 'result' || ph === 'done') && !st.scored) {
          st.scored = true
          const res = scoreRound(r.kind, rows, COUNTS, st.positions, r.payload.final ?? false, r.options)
          const extra = r.kind === 'minority' ? minorityExtra(rows) : r.kind === 'rps' ? rpsExtra(rows) : r.kind === 'quiz' ? quizExtra(rows, parseQuizOptions(r.options).answer) : r.kind === 'hold' ? holdExtra(rows, COUNTS) : undefined
          st.result = { type: 'result', round_idx: r.idx, kind: r.kind, ranks: res.ranks, scores: res.scores, moves: res.moves, positions: res.positions, mvp: res.mvp, ...(extra ? { extra } : {}) } as ResultPayload
          st.steps = res.steps
          st.positions = res.positions
          st.mvpPoints = addMvpPoints(st.mvpPoints, res.mvp, r.idx)
        }
        if (ph === 'done') {
          if (r.idx + 1 < SCHEDULE.length) startRound(r.idx + 1)
          else { st.stage = 'final'; st.finalStart = t; st.fin = { type: 'final', ...finalResult(st.positions, st.mvpPoints) } }
        } else {
          next = { stage: 'round', phase: ph, round: r, secondsLeft: Math.max(0, Math.ceil((r.endsAt - t) / 1000)), rows, result: ph === 'result' ? st.result : null, steps: st.steps, fin: null, lobbyPlayers: [], loop: st.loop }
        }
      }
      if (st.stage === 'final') {
        if (t - st.finalStart >= FINAL_MS) restart()
        else next = { stage: 'final', phase: 'done', round: null, secondsLeft: 0, rows: [], result: null, steps: [], fin: st.fin, lobbyPlayers: [], loop: st.loop }
      }
      if (next) {
        const key = `${next.stage}|${next.phase}|${next.round?.idx ?? -1}|${next.secondsLeft}|${next.rows.length}|${next.rows.reduce((s, r) => s + r.value, 0).toFixed(1)}|${next.lobbyPlayers.length}|${next.loop}`
        if (key !== st.lastRowsKey) { st.lastRowsKey = key; setSnap(next) }
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [startRound, restart])

  // scale canvas to the viewport
  const [scale, setScale] = useState(0.5)
  useEffect(() => {
    const fit = () => setScale(Math.min(innerWidth / 1920, innerHeight / 1080))
    fit(); addEventListener('resize', fit); return () => removeEventListener('resize', fit)
  }, [])

  const stageEl = (() => {
    if (snap.stage === 'lobby') return <Lobby joinUrl="https://party-blitz.vercel.app/?g=demo" players={snap.lobbyPlayers} maxPlayers={120} resumeRound={null} />
    if (snap.stage === 'final' && snap.fin) return <FinalView fin={snap.fin} />
    const r = snap.round
    if (!r) return null
    const base = { rows: snap.rows, counts: COUNTS, secondsLeft: snap.secondsLeft, collecting: snap.phase === 'collect', roundIdx: r.idx }
    if (snap.phase === 'intro') return <Intro kind={r.kind} roundIdx={r.idx} total={SCHEDULE.length} secondsLeft={Math.max(1, Math.ceil((r.startsAt - Date.now()) / 1000))} final={!!r.payload.final} />
    if (snap.phase === 'result' && snap.result) return <ResultView key={`${snap.loop}-${r.idx}`} result={snap.result} steps={snap.steps} total={SCHEDULE.length} />
    switch (r.kind) {
      case 'mash': return <Race {...base} />
      case 'stop': return <Darts {...base} />
      case 'quiz': return <QuizStage {...base} options={r.options} />
      case 'react': return <ReactStage {...base} options={r.options} startsAt={r.startsAt} />
      case 'minority': return <MinorityStage {...base} options={r.options} />
      case 'rps': return <RpsStage {...base} />
      case 'hold': return <HoldStage {...base} />
    }
  })()

  const phone = (p: Player, i: number) => (
    <PhoneFrame key={p.id} player={p} snap={snap} submit={submitFor(p)} seed={i} />
  )

  return (
    <div className="dm-root">
      <div className="dm-canvas" style={{ transform: `translate(-50%, -50%) scale(${scale})` }}>
        <div className="dm-blob b0" /><div className="dm-blob b1" /><div className="dm-blob b2" />
        <div className="dm-col left">{phone(FEATURED[0], 0)}{phone(FEATURED[1], 1)}</div>
        <div className="dm-screen">
          <div className="stage"><div id="stage-inner" className="stage-inner">{stageEl}</div></div>
        </div>
        <div className="dm-screen-label">BIG SCREEN · THE ONLY REFEREE</div>
        <div className="dm-col right">{phone(FEATURED[2], 2)}{phone(FEATURED[3], 3)}</div>
        <div className="dm-caption">
          <span><b>Simulated game</b> · real app runs on Supabase RPC + Realtime</span>
          <span className="pill">{snap.stage === 'lobby' ? 'lobby' : snap.stage === 'final' ? 'final' : `round ${(snap.round?.idx ?? 0) + 1} / ${SCHEDULE.length} · ${snap.round?.kind}`}</span>
        </div>
      </div>
    </div>
  )
}

// ── one phone frame + its robot finger ───────────────────────────────────
function PhoneFrame({ player, snap, submit, seed }: { player: Player; snap: Snap; submit: (v: number) => void; seed: number }) {
  const f = FACTIONS[player.faction]
  const style = { '--fc': f.color, '--fl': f.light, '--fd': f.dark, '--fcl': f.light, '--fcd': f.dark } as React.CSSProperties
  const bodyRef = useRef<HTMLDivElement>(null)
  const r = snap.round
  const now = useCallback(() => Date.now(), [])
  const isMvp = !!snap.result?.mvp.some((m) => m.player_id === player.id)
  const extra = (snap.result as { extra?: unknown } | null)?.extra ?? null
  const [local, setLocal] = useState<number | null>(null)
  const submitAsync = useCallback(async (_id: string, v: number) => { submit(v) }, [submit])

  // robot finger: plan taps once per round, keyed by round id
  const planned = useRef('')
  useEffect(() => {
    if (!r || snap.phase !== 'play' || planned.current === r.payload.round_id) return
    planned.current = r.payload.round_id
    setLocal(null)
    const root = bodyRef.current
    if (!root) return
    const timers: number[] = []
    const after = (ms: number, fn: () => void) => timers.push(window.setTimeout(fn, Math.max(0, ms)))
    const fire = (sel: string, type: 'pointerdown' | 'pointerup') => {
      const el = root.querySelector(sel) as HTMLElement | null
      if (!el) return
      const b = el.getBoundingClientRect()
      el.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 7 + seed, pointerType: 'touch', isPrimary: true, clientX: b.left + b.width / 2, clientY: b.top + b.height / 2, button: 0, buttons: type === 'pointerdown' ? 1 : 0 }))
    }
    const t0 = r.startsAt - Date.now()
    const rnd = (a: number, b: number) => a + Math.random() * (b - a)
    switch (r.kind) {
      case 'mash': {
        const rate = [9, 7, 11, 6][seed] + rnd(-1, 1)
        let t = t0 + rnd(100, 400)
        while (t < r.endsAt - Date.now() - 60) { after(t, () => fire('.mash-btn', 'pointerdown')); t += 1000 / rate + rnd(-30, 30) }
        break
      }
      case 'stop': after(t0 + rnd(1200, 3600), () => fire('.stop-area', 'pointerdown')); break
      case 'quiz': { const a = parseQuizOptions(r.options).answer; const pick = seed === 1 ? (a + 1) % 3 : a; after(t0 + rnd(700, 2800), () => fire(`.pg-choice:nth-child(${pick + 1})`, 'pointerdown')); break }
      case 'react': { const { goAt } = parseReactOptions(r.options, r.startsAt); const dt = seed === 3 ? -250 : rnd(190, 520); after(goAt - Date.now() + dt, () => fire('.rx', 'pointerdown')); break }
      case 'minority': after(t0 + rnd(600, 3000), () => fire(`.pg-choice:nth-child(${[2, 0, 1, 2][seed] + 1})`, 'pointerdown')); break
      case 'rps': { after(t0 + rnd(500, 1800), () => fire(`.pg-choice:nth-child(${[0, 1, 2, 0][seed] + 1})`, 'pointerdown')); if (seed === 2) after(t0 + rnd(2500, 3800), () => fire('.pg-choice:nth-child(2)', 'pointerdown')); break }
      case 'hold': { const start = t0 + rnd(300, 800); after(start, () => fire('.pg-hold-btn', 'pointerdown')); after(start + 5000 + [60, -320, 180, 900][seed] + rnd(-80, 80), () => fire('.pg-hold-btn', 'pointerup')); break }
    }
    return () => { timers.forEach(clearTimeout) }
  }, [r, snap.phase, seed])

  let body: ReactNode
  if (snap.stage === 'lobby' || !r) {
    body = (
      <div className="dm-simple" style={style}>
        <div className="big float">{f.emoji}</div>
        <h2>Team {f.name}</h2>
        <p>{snap.stage === 'final' ? 'Thanks for playing!' : 'Waiting for the host…'}</p>
      </div>
    )
    if (snap.stage === 'final' && snap.fin) {
      const w = snap.fin.winner
      const won = Array.isArray(w) ? w.includes(player.faction) : w === player.faction
      body = (
        <div className="dm-simple" style={style}>
          <div className="big">{won ? '🏆' : '👏'}</div>
          <h2>{won ? `${f.name} wins!` : `${FACTIONS[Array.isArray(w) ? w[0] : w].name} wins`}</h2>
          <p>{won ? 'Your faction took the board' : 'Next game, next chance'}</p>
        </div>
      )
    }
  } else {
    const common = { phase: snap.phase, faction: player.faction, startsAt: r.startsAt, endsAt: r.endsAt, now, onSubmit: submit, result: snap.phase === 'result' ? snap.result : null, isMvp: snap.phase === 'result' && isMvp }
    const remaining = snap.secondsLeft
    const simpleResult = (headline: string) => (
      <div className="dm-simple" style={style}>
        <div className="big">{isMvp ? '🏆' : snap.result && snap.result.ranks[player.faction] === 1 ? '🥇' : '🙌'}</div>
        <h2>{headline}</h2>
        <p>{isMvp ? 'Top 3 of the whole room!' : `${f.name} finished #${snap.result?.ranks[player.faction]}`}</p>
        {snap.result && <RankLine faction={player.faction} result={snap.result} />}
      </div>
    )
    switch (r.kind) {
      case 'mash':
        body = snap.phase === 'intro' ? <PhoneIntro icon="⚡" verb="MASH!" hint="Tap as fast as you can" /> : snap.phase === 'result' ? simpleResult(`${local ?? 0} taps`) : (
          <div className="ph" style={style}><Mash roundId={r.payload.round_id} phase={snap.phase} remaining={remaining} submit={submitAsync} onLocal={setLocal} /></div>
        )
        break
      case 'stop':
        body = snap.phase === 'intro' ? <PhoneIntro icon="🎯" verb="STOP IN THE MIDDLE!" hint="One tap. Stop the bar at the center" /> : snap.phase === 'result' ? simpleResult(local === null ? 'No tap' : `${Math.round((1 - local) * 100)}% accuracy`) : (
          <div className="ph" style={style}><Stop round={r.payload} phase={snap.phase} remaining={remaining} submit={submitAsync} onLocal={setLocal} /></div>
        )
        break
      case 'quiz': body = <QuizGame {...common} options={r.options} extra={extra as never} />; break
      case 'react': body = <ReactGame {...common} options={r.options} extra={extra} />; break
      case 'minority': body = <MinorityGame {...common} options={r.options} extra={extra as never} />; break
      case 'rps': body = <RpsGame {...common} extra={extra as never} />; break
      case 'hold': body = <HoldGame {...common} extra={extra as never} />; break
    }
  }

  return (
    <div className="dm-phone">
      <div className="dm-phone-in" style={style}>
        <div className="dm-phone-head">You are {f.emoji} <b>{f.name}</b> · {player.nick}</div>
        <div className="dm-phone-body" ref={bodyRef}>{body}</div>
      </div>
    </div>
  )
}
