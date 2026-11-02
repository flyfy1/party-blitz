// 手机小游戏实验台：不连 Supabase，本地时钟 + 模拟 bot，专门用来调手感。
// /lab.html?game=minority|rps&fast=1&faction=0|1|2&bots=120&scenario=random|win|lose|tie
import { useCallback, useEffect, useRef, useState } from 'react'
import { FACTIONS } from '../shared/factions'
import { scoreRound } from '../shared/scoring'
import { FAST, NORMAL, phaseAt, type Phase, type Timing } from '../shared/timing'
import type { Faction, InputRow, ResultPayload, Triple } from '../shared/types'
import { MinorityGame, RpsGame } from '../phone/games'
import { minorityExtra, rpsExtra, type MinorityExtra, type RpsExtra } from '../shared/extras'
import { pickQuestion } from '../shared/questions'
import './lab.css'

type Game = 'minority' | 'rps'
type Scenario = 'random' | 'win' | 'lose' | 'tie'
const ME = 'me-0000'

function readParams() {
  const q = new URLSearchParams(location.search)
  const game = (q.get('game') === 'rps' ? 'rps' : 'minority') as Game
  const faction = (Math.min(2, Math.max(0, Number(q.get('faction') ?? 0))) || 0) as Faction
  const fast = !!q.get('fast')
  const bots = Math.max(3, Number(q.get('bots') ?? 120))
  const scenario = (q.get('scenario') ?? 'random') as Scenario
  return { game, faction, fast, bots, scenario }
}

function writeParams(p: ReturnType<typeof readParams>) {
  const q = new URLSearchParams()
  q.set('game', p.game)
  q.set('faction', String(p.faction))
  if (p.fast) q.set('fast', '1')
  if (p.bots !== 120) q.set('bots', String(p.bots))
  if (p.scenario !== 'random') q.set('scenario', p.scenario)
  history.replaceState(null, '', `${location.pathname}?${q}`)
}

/** 模拟 bot 输入（时间戳错开，便于 MVP 排序） */
function botInputs(game: Game, n: number, faction: Faction, scenario: Scenario, startsAt: number, myValue: number | null): InputRow[] {
  const rows: InputRow[] = []
  const counts: Triple = [0, 0, 0]
  for (let i = 0; i < n; i++) {
    const f = i % 3
    counts[f]++
    let v: number
    if (game === 'minority') {
      // 让三个选项人数明显不同；win 时让我的选项最少，lose 时最多
      const weights = [0.5, 0.3, 0.2]
      if (myValue !== null && scenario === 'win') {
        weights[myValue] = 0.05
      } else if (myValue !== null && scenario === 'lose') {
        weights[myValue] = 0.7
      }
      const sum = weights.reduce((a, b) => a + b, 0)
      let r = Math.random() * sum
      v = 0
      while (r > weights[v] && v < 2) {
        r -= weights[v]
        v++
      }
    } else {
      // rps：每个阵营有一个主流出拳
      let pref: Triple = [0, 1, 2]
      if (scenario === 'tie') pref = [0, 0, 0]
      if (scenario === 'win') {
        const my = myValue ?? 0
        pref = [0, 0, 0]
        pref[faction] = my
        for (let g = 0; g < 3; g++) if (g !== faction) pref[g] = (my + 2) % 3 // 被我克的拳
      }
      if (scenario === 'lose') {
        const my = myValue ?? 0
        pref = [0, 0, 0]
        pref[faction] = my
        for (let g = 0; g < 3; g++) if (g !== faction) pref[g] = (my + 1) % 3 // 克我的拳
      }
      v = Math.random() < 0.7 ? pref[f] : Math.floor(Math.random() * 3)
    }
    // 约 8% 的人没提交
    if (Math.random() < 0.08) continue
    rows.push({
      player_id: `bot-${i}`,
      nickname: `Bot ${i}`,
      faction: f,
      value: v,
      first_at: new Date(startsAt + 300 + Math.random() * 6000).toISOString(),
    })
  }
  return rows
}

export default function Lab() {
  const [params, setParams] = useState(readParams)
  const timing: Timing = params.fast ? FAST : NORMAL
  const [round, setRound] = useState(() => mkRound(timing))
  const [phase, setPhase] = useState<Phase>('intro')
  const [result, setResult] = useState<ResultPayload | null>(null)
  const [extra, setExtra] = useState<MinorityExtra | RpsExtra | null>(null)
  const [isMvp, setIsMvp] = useState(false)
  const [log, setLog] = useState<string[]>([])
  const myValue = useRef<number | null>(null)
  const scored = useRef(false)
  const now = useCallback(() => Date.now(), [])

  function mkRound(t: Timing) {
    const startsAt = Date.now() + t.intro
    return { startsAt, endsAt: startsAt + t.play, options: pickQuestion() }
  }

  const restart = useCallback(() => {
    myValue.current = null
    scored.current = false
    setResult(null)
    setExtra(null)
    setIsMvp(false)
    setLog([])
    setRound(mkRound(params.fast ? FAST : NORMAL))
  }, [params.fast])

  useEffect(() => {
    writeParams(params)
  }, [params])

  // 本地阶段机：和真实手机一样按时间戳切阶段
  useEffect(() => {
    let raf = 0
    const tick = () => {
      const ph = phaseAt(Date.now(), round.startsAt, round.endsAt, timing)
      setPhase(ph === 'done' ? 'result' : ph)
      if ((ph === 'collect' || ph === 'result' || ph === 'done') && !scored.current) {
        scored.current = true
        // 和大屏一样：收卷后 1.2s 才有结果；这里在 collect 阶段就先算好，result 阶段显示
        const inputs = botInputs(params.game, params.bots, params.faction, params.scenario, round.startsAt, myValue.current)
        if (myValue.current !== null)
          inputs.push({ player_id: ME, nickname: 'You', faction: params.faction, value: myValue.current, first_at: new Date(round.startsAt + 100).toISOString() })
        const counts: Triple = [0, 0, 0]
        for (let i = 0; i < params.bots; i++) counts[i % 3]++
        counts[params.faction]++
        const r = scoreRound(params.game, inputs, counts, [3, 5, 4], false)
        setResult({ type: 'result', round_idx: 2, kind: params.game, ranks: r.ranks, scores: r.scores, moves: r.moves, positions: r.positions, mvp: r.mvp })
        setExtra(params.game === 'minority' ? minorityExtra(inputs) : rpsExtra(inputs))
        setIsMvp(r.mvp.some((m) => m.player_id === ME))
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [round, timing, params])

  const onSubmit = useCallback((v: number) => {
    myValue.current = v
    setLog((l) => [...l, `${((Date.now() - round.startsAt) / 1000).toFixed(2)}s submit_input(${v})`])
  }, [round.startsAt])

  const f = FACTIONS[params.faction]
  const gameEl =
    params.game === 'minority' ? (
      <MinorityGame
        phase={phase}
        faction={params.faction}
        startsAt={round.startsAt}
        endsAt={round.endsAt}
        now={now}
        options={round.options}
        onSubmit={onSubmit}
        result={phase === 'result' ? result : null}
        extra={phase === 'result' ? (extra as MinorityExtra) : null}
        isMvp={phase === 'result' && isMvp}
      />
    ) : (
      <RpsGame
        phase={phase}
        faction={params.faction}
        startsAt={round.startsAt}
        endsAt={round.endsAt}
        now={now}
        onSubmit={onSubmit}
        result={phase === 'result' ? result : null}
        extra={phase === 'result' ? (extra as RpsExtra) : null}
        isMvp={phase === 'result' && isMvp}
      />
    )

  const set = <K extends keyof typeof params>(k: K, v: (typeof params)[K]) => setParams((p) => ({ ...p, [k]: v }))

  return (
    <div className="lab">
      <div className="lab-bar">
        <select value={params.game} onChange={(e) => set('game', e.target.value as Game)}>
          <option value="minority">🤔 Minority</option>
          <option value="rps">✊ RPS</option>
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
          <option value="win">😎 I win</option>
          <option value="lose">😵 I lose</option>
          {params.game === 'rps' && <option value="tie">🤝 tie</option>}
        </select>
        <label>
          <input type="checkbox" checked={params.fast} onChange={(e) => set('fast', e.target.checked)} /> fast
        </label>
        <button onClick={restart}>▶ Replay</button>
        <span className="lab-phase">{phase}</span>
      </div>
      <div className="lab-stage">
        <div className="lab-phone">
          <div className="lab-head" style={{ background: f.dark }}>
            You are {f.emoji} {f.name} · Brave Durian #37
          </div>
          <div className="lab-game">{gameEl}</div>
        </div>
      </div>
      {log.length > 0 && <div className="lab-log">{log.join('  ·  ')}</div>}
    </div>
  )
}
