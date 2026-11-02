// 手机小游戏 + 大屏画面实验台：不连 Supabase，本地时钟 + 模拟 bot，专门用来调手感。
// /lab.html?game=minority|rps&view=phone|stage|both&fast=1&faction=0|1|2&bots=120&scenario=random|win|mvp|lose|tie
import { useCallback, useEffect, useRef, useState } from 'react'
import { FACTIONS } from '../shared/factions'
import { scoreRound } from '../shared/scoring'
import { FAST, NORMAL, phaseAt, type Phase, type Timing } from '../shared/timing'
import type { Faction, InputRow, ResultPayload, Triple } from '../shared/types'
import { MinorityGame, RpsGame } from '../phone/games'
import { minorityExtra, rpsExtra, type MinorityExtra, type RpsExtra } from '../shared/extras'
import { pickQuestion, type MinorityQuestion } from '../shared/questions'
import { MinorityStage } from '../host/views/MinorityStage'
import { RpsStage } from '../host/views/RpsStage'
import '../host/host.css'
import './lab.css'

type Game = 'minority' | 'rps'
type Scenario = 'random' | 'win' | 'mvp' | 'lose' | 'tie'
type View = 'phone' | 'stage' | 'both'
const ME = 'me-0000'

function readParams() {
  const q = new URLSearchParams(location.search)
  const game = (q.get('game') === 'rps' ? 'rps' : 'minority') as Game
  const faction = (Math.min(2, Math.max(0, Number(q.get('faction') ?? 0))) || 0) as Faction
  const fast = !!q.get('fast')
  const bots = Math.max(3, Number(q.get('bots') ?? 120))
  const scenario = (q.get('scenario') ?? 'random') as Scenario
  const v = q.get('view')
  const view: View = v === 'stage' || v === 'both' ? v : window.innerWidth > 1100 ? 'both' : 'phone'
  return { game, faction, fast, bots, scenario, view }
}

function writeParams(p: ReturnType<typeof readParams>) {
  const q = new URLSearchParams()
  q.set('game', p.game)
  q.set('view', p.view)
  q.set('faction', String(p.faction))
  if (p.fast) q.set('fast', '1')
  if (p.bots !== 120) q.set('bots', String(p.bots))
  if (p.scenario !== 'random') q.set('scenario', p.scenario)
  history.replaceState(null, '', `${location.pathname}?${q}`)
}

/**
 * 模拟 bot 输入，first_at 错开在 PLAY 窗口内，大屏按时间流式显示。
 * 场景约定（和"我"无关，便于一开局就生成）：
 *  minority  win/mvp → 最后一个选项最稀有（选它就赢）；lose → 第一个选项最热门（选它就输）
 *  rps       win/mvp → 我的阵营出 ✊，其他阵营出 ✌️（投 ✊ 就赢）；lose → 其他阵营出 ✋；tie → 全部 ✊
 */
function botInputs(game: Game, n: number, faction: Faction, scenario: Scenario, startsAt: number, playMs: number): InputRow[] {
  const rows: InputRow[] = []
  for (let i = 0; i < n; i++) {
    const f = i % 3
    let v: number
    if (game === 'minority') {
      const weights = [0.5, 0.3, 0.2]
      if (scenario === 'win' || scenario === 'mvp') weights[2] = 0.05
      if (scenario === 'lose') weights[0] = 0.75
      const sum = weights.reduce((a, b) => a + b, 0)
      let r = Math.random() * sum
      v = 0
      while (r > weights[v] && v < 2) {
        r -= weights[v]
        v++
      }
    } else {
      let pref: Triple = [0, 1, 2]
      if (scenario === 'tie') pref = [0, 0, 0]
      if (scenario === 'win' || scenario === 'mvp') {
        pref = [2, 2, 2]
        pref[faction] = 0
      }
      if (scenario === 'lose') {
        pref = [1, 1, 1]
        pref[faction] = 0
      }
      v = Math.random() < 0.75 ? pref[f] : Math.floor(Math.random() * 3)
    }
    if (Math.random() < 0.08) continue // 约 8% 的人没提交
    // 大多数人在前 60% 的时间里提交
    const t = Math.pow(Math.random(), 1.6) * playMs * 0.85 + 200
    rows.push({ player_id: `bot-${i}`, nickname: `Bot ${i}`, faction: f, value: v, first_at: new Date(startsAt + t).toISOString() })
  }
  return rows
}

interface Round {
  startsAt: number
  endsAt: number
  options: MinorityQuestion
  bots: InputRow[]
}

export default function Lab() {
  const [params, setParams] = useState(readParams)
  const timing: Timing = params.fast ? FAST : NORMAL
  const mkRound = useCallback((p: typeof params): Round => {
    const t = p.fast ? FAST : NORMAL
    const startsAt = Date.now() + t.intro
    return { startsAt, endsAt: startsAt + t.play, options: pickQuestion(), bots: botInputs(p.game, p.bots, p.faction, p.scenario, startsAt, t.play) }
  }, [])
  const [round, setRound] = useState<Round>(() => mkRound(params))
  const [phase, setPhase] = useState<Phase>('intro')
  const [live, setLive] = useState<InputRow[]>([])
  const [secondsLeft, setSecondsLeft] = useState(0)
  const [result, setResult] = useState<ResultPayload | null>(null)
  const [extra, setExtra] = useState<MinorityExtra | RpsExtra | null>(null)
  const [isMvp, setIsMvp] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const me = useRef<InputRow | null>(null)
  const scored = useRef(false)
  const now = useCallback(() => Date.now(), [])

  const counts: Triple = [0, 0, 0]
  for (let i = 0; i < params.bots; i++) counts[i % 3]++
  counts[params.faction]++

  const restart = useCallback(() => {
    me.current = null
    scored.current = false
    setResult(null)
    setExtra(null)
    setIsMvp(false)
    setLog([])
    setLive([])
    setRound(mkRound(params))
  }, [params, mkRound])

  useEffect(() => {
    writeParams(params)
  }, [params])

  // 本地阶段机：和真实手机/大屏一样按时间戳切阶段；bot 按 first_at 流式出现
  useEffect(() => {
    let raf = 0
    let lastN = -1
    const tick = () => {
      const t = Date.now()
      const ph = phaseAt(t, round.startsAt, round.endsAt, timing)
      setPhase(ph === 'done' ? 'result' : ph)
      setSecondsLeft(Math.max(0, Math.ceil((round.endsAt - t) / 1000)))
      const rows = round.bots.filter((r) => Date.parse(r.first_at) <= t)
      if (me.current) rows.push(me.current)
      if (rows.length !== lastN) {
        lastN = rows.length
        setLive(rows)
      }
      if ((ph === 'collect' || ph === 'result' || ph === 'done') && !scored.current) {
        scored.current = true
        const inputs = [...round.bots]
        if (me.current) inputs.push(me.current)
        const r = scoreRound(params.game, inputs, counts, [3, 5, 4], false)
        setResult({ type: 'result', round_idx: 2, kind: params.game, ranks: r.ranks, scores: r.scores, moves: r.moves, positions: r.positions, mvp: r.mvp })
        setExtra(params.game === 'minority' ? minorityExtra(inputs) : rpsExtra(inputs))
        setIsMvp(r.mvp.some((m) => m.player_id === ME))
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [round, timing, params]) // eslint-disable-line react-hooks/exhaustive-deps

  const onSubmit = useCallback(
    (v: number) => {
      const first = me.current?.first_at ?? new Date(params.scenario === 'mvp' ? round.startsAt + 100 : Date.now()).toISOString()
      me.current = { player_id: ME, nickname: 'You', faction: params.faction, value: v, first_at: first }
      setLog((l) => [...l, `${((Date.now() - round.startsAt) / 1000).toFixed(2)}s submit_input(${v})`])
    },
    [round.startsAt, params.faction, params.scenario],
  )

  const f = FACTIONS[params.faction]
  const common = { phase, faction: params.faction, startsAt: round.startsAt, endsAt: round.endsAt, now, onSubmit, result: phase === 'result' ? result : null, isMvp: phase === 'result' && isMvp }
  const phoneEl =
    params.game === 'minority' ? (
      <MinorityGame {...common} options={round.options} extra={phase === 'result' ? (extra as MinorityExtra) : null} />
    ) : (
      <RpsGame {...common} extra={phase === 'result' ? (extra as RpsExtra) : null} />
    )
  const stageProps = { rows: live, counts, secondsLeft, collecting: phase === 'collect', roundIdx: 2 }
  const stageEl =
    phase === 'intro' ? (
      <div className="st-word" style={{ top: 440 }}>INTRO…</div>
    ) : phase === 'result' ? (
      <div className="st-word" style={{ top: 400, fontSize: 80 }}>
        RESULT (board view, owned by host)
        <br />
        <span style={{ fontSize: 50, opacity: 0.8 }}>scores {result?.scores.join(' / ')} · ranks {result?.ranks.join(' / ')}</span>
      </div>
    ) : params.game === 'minority' ? (
      <MinorityStage {...stageProps} options={round.options} />
    ) : (
      <RpsStage {...stageProps} />
    )

  const set = <K extends keyof typeof params>(k: K, v: (typeof params)[K]) => setParams((p) => ({ ...p, [k]: v }))
  const showPhone = params.view !== 'stage'
  const showStage = params.view !== 'phone'

  return (
    <div className="lab">
      <div className="lab-bar">
        <select value={params.game} onChange={(e) => set('game', e.target.value as Game)}>
          <option value="minority">🤔 Minority</option>
          <option value="rps">✊ RPS</option>
        </select>
        <select value={params.view} onChange={(e) => set('view', e.target.value as View)}>
          <option value="phone">📱 phone</option>
          <option value="stage">🖥️ stage</option>
          <option value="both">📱+🖥️ both</option>
        </select>
        <select value={params.faction} onChange={(e) => set('faction', Number(e.target.value) as Faction)}>
          {FACTIONS.map((x) => (
            <option key={x.id} value={x.id}>
              {x.emoji} {x.name}
            </option>
          ))}
        </select>
        <select value={params.scenario} onChange={(e) => set('scenario', e.target.value as Scenario)}>
          <option value="random">🎲 random</option>
          <option value="win">😎 win (pick last / ✊)</option>
          <option value="mvp">🏆 win + MVP</option>
          <option value="lose">😵 lose (pick first / ✊)</option>
          {params.game === 'rps' && <option value="tie">🤝 tie</option>}
        </select>
        <label>
          <input type="checkbox" checked={params.fast} onChange={(e) => set('fast', e.target.checked)} /> fast
        </label>
        <button onClick={restart}>▶ Replay</button>
        <span className="lab-phase">{phase}</span>
      </div>
      <div className={'lab-stage' + (showStage ? ' with-stage' : '')}>
        {showPhone && (
          <div className="lab-phone">
            <div className="lab-head" style={{ background: f.dark }}>
              You are {f.emoji} {f.name} · Brave Durian #37
            </div>
            <div className="lab-game">{phoneEl}</div>
          </div>
        )}
        {showStage && <StageFrame>{stageEl}</StageFrame>}
      </div>
      {log.length > 0 && <div className="lab-log">{log.join('  ·  ')}</div>}
    </div>
  )
}

/** 1920×1080 舞台按容器宽度等比缩放（和 host/Stage.tsx 同样的 .stage/.stage-inner 结构） */
function StageFrame({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null)
  const [scale, setScale] = useState(0.5)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => setScale(Math.min(el.clientWidth / 1920, el.clientHeight / 1080)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return (
    <div ref={ref} className="lab-screen">
      <div className="stage" style={{ transform: `translate(-50%, -50%) scale(${scale})` }}>
        <div id="stage-inner" className="stage-inner">
          {children}
        </div>
      </div>
    </div>
  )
}
