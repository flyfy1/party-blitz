import { useEffect, useMemo, useState } from 'react'
import './phone.css'
import { FACTIONS, KIND_META } from '../shared/factions'
import { BOARD_SIZE } from '../shared/board'
import { timingFromUrl } from '../shared/timing'
import { now, parseTs } from '../shared/time'
import type { Faction, FinalPayload, ResultPayload, RoundPayload, Triple } from '../shared/types'
import { usePhoneGame, type PhoneGame } from './usePhoneGame'
import { usePhase } from './usePhase'
import Mash from './Mash'
import Stop from './Stop'
import { MinorityGame, RpsGame, QuizGame, HoldGame } from './games'
import ReactGame from './games/ReactGame'
import type { MinorityExtra, RpsExtra } from '../shared/extras'
import type { QuizExtra, HoldExtra } from '../shared/scoring.p3'

export default function Phone() {
  const { game, submit, retry } = usePhoneGame()
  const timing = useMemo(() => timingFromUrl(), [])
  const fac = FACTIONS[game.faction] ?? FACTIONS[0]
  const style = { ['--fc' as string]: fac.color, ['--fl' as string]: fac.light, ['--fd' as string]: fac.dark }

  if (game.status === 'no-game')
    return (
      <Shell style={{ ['--fc' as string]: '#1B1033' }}>
        <div className="ph-center">
          <div className="ph-logo">⚡</div>
          <h1 className="ph-title cn">PARTY BLITZ</h1>
          <p className="ph-sub">Scan the QR code on the big screen to join</p>
        </div>
      </Shell>
    )
  if (game.status === 'joining')
    return (
      <Shell style={{ ['--fc' as string]: '#1B1033' }}>
        <div className="ph-center">
          <div className="ph-logo spin">⚡</div>
          <p className="ph-sub">Joining…</p>
        </div>
      </Shell>
    )
  if (game.status === 'error')
    return (
      <Shell style={{ ['--fc' as string]: '#1B1033' }}>
        <div className="ph-center">
          <div className="ph-logo">😵</div>
          <p className="ph-sub">Couldn't join: {game.error}</p>
          <button className="ph-btn" onClick={retry}>
            Try again
          </button>
        </div>
      </Shell>
    )
  if (game.status === 'spectator') return <Spectator game={game} />

  return (
    <Shell style={style}>
      <header className="ph-head">
        You are {fac.emoji} <b>{fac.name}</b> · {game.nickname}
      </header>
      {game.final ? (
        <Final final={game.final} game={game} />
      ) : game.round && game.missedRound ? (
        <LateWait key={game.round.round_id} game={game} round={game.round} timing={timing} />
      ) : game.round ? (
        <Round key={game.round.round_id} game={game} round={game.round} submit={submit} timing={timing} />
      ) : (
        <Waiting game={game} />
      )}
    </Shell>
  )
}

function Shell({ style, children }: { style: React.CSSProperties; children: React.ReactNode }) {
  return (
    <div className="ph" style={style}>
      {children}
    </div>
  )
}

function Waiting({ game }: { game: PhoneGame }) {
  const fac = FACTIONS[game.faction]
  const total = game.counts[0] + game.counts[1] + game.counts[2]
  const live = game.gameStatus === 'playing'
  return (
    <div className="ph-center">
      <div className="ph-mascot float">{fac.emoji}</div>
      <div className="ph-big cn">{live ? "You're in!" : `Team ${fac.name}`}</div>
      <p className="ph-sub">{live ? 'Get ready for the next round…' : 'Waiting for the host…'}</p>
      <div className="ph-pill">
        {game.counts[game.faction]} on your team · {total} / {game.maxPlayers} in the room
      </div>
    </div>
  )
}

/** Late joiner: the current round already started before we joined. Count down to the next one. */
function LateWait({ game, round, timing }: { game: PhoneGame; round: RoundPayload; timing: ReturnType<typeof timingFromUrl> }) {
  const fac = FACTIONS[game.faction]
  const nextAt = parseTs(round.ends_at) + timing.collect + timing.result
  const [secs, setSecs] = useState(() => Math.max(0, Math.ceil((nextAt - now()) / 1000)))
  useEffect(() => {
    const id = setInterval(() => setSecs(Math.max(0, Math.ceil((nextAt - now()) / 1000))), 250)
    return () => clearInterval(id)
  }, [nextAt])
  return (
    <div className="ph-center">
      <div className="ph-mascot float">{fac.emoji}</div>
      <div className="ph-big cn pop">You're in!</div>
      <p className="ph-sub">Team {fac.name} · round {round.round_idx + 1} is already running</p>
      <div className="ph-countdown pop" key={secs}>
        {secs > 0 ? secs : '…'}
      </div>
      <p className="ph-sub">{secs > 0 ? 'Next round starts in' : 'Get ready for the next round…'}</p>
      <Positions positions={game.positions} me={game.faction} />
    </div>
  )
}

function Round({
  game,
  round,
  submit,
  timing,
}: {
  game: PhoneGame
  round: RoundPayload
  submit: (roundId: string, value: number) => Promise<void>
  timing: ReturnType<typeof timingFromUrl>
}) {
  const { phase, remaining } = usePhase(round, timing)
  const [local, setLocal] = useState<number | null>(null) // reset per round via key={round_id}
  const meta = KIND_META[round.kind]
  const result = game.result && game.result.round_idx === round.round_idx ? game.result : null

  // Minority / RPS / Reaction / Quiz / Hold render their own intro, collect and result screens (src/phone/games).
  if (round.kind === 'minority' || round.kind === 'rps' || round.kind === 'react' || round.kind === 'quiz' || round.kind === 'hold') {
    const common = {
      phase,
      faction: game.faction as Faction,
      startsAt: parseTs(round.starts_at),
      endsAt: parseTs(round.ends_at),
      now,
      options: round.options,
      onSubmit: (v: number) => submit(round.round_id, v),
      result,
      isMvp: !!result?.mvp.some((m) => m.player_id === game.playerId),
    }
    const extra = (result as { extra?: unknown } | null)?.extra ?? null
    if (round.kind === 'react') return <ReactGame {...common} />
    if (round.kind === 'quiz') return <QuizGame {...common} extra={extra as QuizExtra | null} />
    if (round.kind === 'hold') return <HoldGame {...common} extra={extra as HoldExtra | null} />
    return round.kind === 'minority' ? (
      <MinorityGame {...common} extra={extra as MinorityExtra | null} />
    ) : (
      <RpsGame {...common} extra={extra as RpsExtra | null} />
    )
  }

  if (result) return <Result result={result} game={game} local={local} />
  if (phase === 'intro')
    return (
      <div className="ph-center">
        <div className="ph-roundno">
          Round {round.round_idx + 1}
          {round.final ? ' · FINAL ×2' : ''}
        </div>
        <div className="ph-icon pop" key={round.round_id}>
          {meta.icon}
        </div>
        <div className="ph-verb cn pop">{meta.verb}</div>
        <div className="ph-countdown pop" key={`c${remaining}`}>
          {remaining || 'GO'}
        </div>
        <div className="ph-sub">{meta.hint}</div>
      </div>
    )
  if (round.kind === 'mash')
    return <Mash key={round.round_id} roundId={round.round_id} phase={phase} remaining={remaining} submit={submit} onLocal={setLocal} />
  if (round.kind === 'stop')
    return <Stop key={round.round_id} round={round} phase={phase} remaining={remaining} submit={submit} onLocal={setLocal} />
  return (
    <div className="ph-center">
      <div className="ph-icon">{meta.icon}</div>
      <div className="ph-verb cn">{meta.verb}</div>
    </div>
  )
}

function Positions({ positions, me }: { positions: Triple; me?: number }) {
  return (
    <div className="ph-board">
      {FACTIONS.map((f) => (
        <div key={f.id} className={`ph-lane ${me === f.id ? 'me' : ''}`}>
          <span className="ph-lane-emoji">{f.emoji}</span>
          <div className="ph-lane-track">
            <div className="ph-lane-fill" style={{ width: `${(positions[f.id] / BOARD_SIZE) * 100}%`, background: f.color }} />
          </div>
          <span className="ph-lane-pos">{positions[f.id]}</span>
        </div>
      ))}
    </div>
  )
}

function Result({ result, game, local }: { result: ResultPayload; game: PhoneGame; local: number | null }) {
  const f = game.faction
  const mvpIdx = result.mvp.findIndex((m) => m.player_id === game.playerId)
  const rankWord = ['', '1st', '2nd', '3rd'][result.ranks[f]]
  const own =
    result.kind === 'mash'
      ? local === null
        ? 'No taps'
        : `${local} taps`
      : result.kind === 'stop'
        ? local === null
          ? "You didn't tap"
          : `${Math.round((1 - local) * 100)}% accuracy`
        : ''
  return (
    <div className={`ph-center ph-result ${mvpIdx >= 0 ? 'gold' : ''}`}>
      {mvpIdx >= 0 && (
        <div className="ph-mvp cn pop">
          🏆 TOP 3 IN THE ROOM
          <b>#{mvpIdx + 1}</b>
        </div>
      )}
      <div className="ph-own pop">{own}</div>
      <div className="ph-big cn pop">Your faction finished {rankWord}</div>
      <div className="ph-pill">
        {FACTIONS[f].emoji} moves +{result.moves[f]} → cell {result.positions[f]}
      </div>
      <Positions positions={result.positions} me={f} />
      {result.mvp.length > 0 && (
        <div className="ph-mvplist">
          {result.mvp.map((m, i) => (
            <span key={m.player_id} className={m.player_id === game.playerId ? 'me' : ''}>
              {['🥇', '🥈', '🥉'][i]} {FACTIONS[m.faction].emoji} {m.nick}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function Final({ final, game }: { final: FinalPayload; game: PhoneGame }) {
  const winners = Array.isArray(final.winner) ? final.winner : [final.winner]
  const won = winners.includes(game.faction)
  const title =
    winners.length === 1 ? `${FACTIONS[winners[0]].emoji} ${FACTIONS[winners[0]].name} wins!` : winners.length === 3 ? "It's a three-way tie!" : "It's a tie!"
  return (
    <div className={`ph-center ph-result ${won ? 'gold' : ''}`}>
      <div className="ph-mascot pop">{winners.map((w) => FACTIONS[w].emoji).join(' ')}</div>
      <div className="ph-big cn pop">{title}</div>
      <div className="ph-pill">{won ? '🎉 Your team won!' : 'Better luck next time 💪'}</div>
      <Positions positions={final.positions} me={game.faction} />
      {final.mvp_top3.length > 0 && (
        <div className="ph-mvplist">
          <div className="ph-sub">MVP podium</div>
          {final.mvp_top3.map((m, i) => (
            <span key={m.player_id} className={m.player_id === game.playerId ? 'me' : ''}>
              {['🥇', '🥈', '🥉'][i]} {FACTIONS[m.faction].emoji} {m.nick} · {m.points} pts
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function Spectator({ game }: { game: PhoneGame }) {
  return (
    <Shell style={{ ['--fc' as string]: '#1B1033' }}>
      <div className="ph-center">
        <div className="ph-logo">🙈</div>
        <div className="ph-big cn">Room is full</div>
        <p className="ph-sub">Cheer for your friends on the big screen!</p>
        <div className="ph-pill">
          {game.gameStatus === 'lobby' ? 'Waiting to start' : game.gameStatus === 'finished' ? 'Game over' : `Round ${game.round ? game.round.round_idx + 1 : game.result ? game.result.round_idx + 1 : '…'}`}
        </div>
        <Positions positions={game.positions} />
      </div>
    </Shell>
  )
}
