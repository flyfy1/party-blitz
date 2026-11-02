// Phone-side networking + state: join, broadcast channel (receive only), get_state polling fallback.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { channelName, rpc, supabase } from '../shared/supabase'
import { getPlayerId } from '../shared/player-id'
import { isFinalRound } from '../shared/schedule'
import type { FinalPayload, JoinResponse, ResultPayload, RoundPayload, StateResponse, Triple } from '../shared/types'

export type PhoneStatus = 'no-game' | 'joining' | 'error' | 'spectator' | 'joined'

export interface PhoneGame {
  status: PhoneStatus
  gameId: string | null
  playerId: string
  faction: number
  nickname: string
  counts: Triple
  maxPlayers: number
  positions: Triple
  gameStatus: 'lobby' | 'playing' | 'finished'
  round: RoundPayload | null
  result: ResultPayload | null
  final: FinalPayload | null
  error: string | null
}

const initial = (gameId: string | null): PhoneGame => ({
  status: gameId ? 'joining' : 'no-game',
  gameId,
  playerId: gameId ? getPlayerId(gameId) : '',
  faction: 0,
  nickname: '',
  counts: [0, 0, 0],
  maxPlayers: 120,
  positions: [0, 0, 0],
  gameStatus: 'lobby',
  round: null,
  result: null,
  final: null,
  error: null,
})

function applyRound(g: PhoneGame, p: RoundPayload): PhoneGame {
  if (g.round?.round_id === p.round_id) return g
  if (g.round && p.round_idx < g.round.round_idx) return g
  return { ...g, round: p, gameStatus: 'playing' }
}
function applyResult(g: PhoneGame, p: ResultPayload): PhoneGame {
  if (g.result && g.result.round_idx >= p.round_idx) return g
  return { ...g, result: p, positions: p.positions }
}
function applyFinal(g: PhoneGame, p: FinalPayload): PhoneGame {
  if (g.final) return g
  return { ...g, final: p, positions: p.positions, gameStatus: 'finished' }
}
function applyState(g: PhoneGame, s: StateResponse): PhoneGame {
  let n: PhoneGame = {
    ...g,
    counts: s.counts ?? g.counts,
    maxPlayers: s.max_players ?? g.maxPlayers,
    gameStatus: s.status ?? g.gameStatus,
  }
  if (s.round && s.status !== 'lobby') {
    n = applyRound(n, {
      type: 'round',
      round_idx: s.round_idx,
      round_id: s.round.id,
      kind: s.round.kind,
      options: s.round.options,
      starts_at: s.round.starts_at,
      ends_at: s.round.ends_at,
      final: isFinalRound(s.round_idx),
    })
  }
  if (s.state?.last_result) n = applyResult(n, s.state.last_result)
  else if (s.state?.positions) n = { ...n, positions: s.state.positions }
  if (s.status === 'finished' && s.state?.last_final) n = applyFinal(n, s.state.last_final)
  return n
}

export function usePhoneGame() {
  const gameId = new URLSearchParams(location.search).get('g')
  const [game, setGame] = useState<PhoneGame>(() => initial(gameId))
  const chanRef = useRef<RealtimeChannel | null>(null)
  const statusRef = useRef(game.status)
  useEffect(() => {
    statusRef.current = game.status
  }, [game.status])

  const poll = useCallback(async () => {
    if (!gameId) return
    try {
      const s = await rpc<StateResponse>('get_state', { p_game: gameId })
      if (s) setGame((g) => applyState(g, s))
    } catch {
      /* next poll will retry */
    }
  }, [gameId])

  // ── join ──
  useEffect(() => {
    if (!gameId) return
    let cancelled = false
    ;(async () => {
      try {
        const r = await rpc<JoinResponse>('join_game', { p_game: gameId, p_player: getPlayerId(gameId) }, { retries: 3, delay: 300 })
        if (cancelled) return
        if (r.full) setGame((g) => ({ ...g, status: 'spectator' }))
        else setGame((g) => ({ ...g, status: 'joined', faction: r.faction, nickname: r.nickname }))
        poll()
      } catch (e) {
        if (!cancelled) setGame((g) => ({ ...g, status: 'error', error: (e as Error).message }))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [gameId, poll])

  // ── broadcast channel (joined players only; spectators never open a connection) ──
  const connect = useCallback(() => {
    if (!gameId || statusRef.current !== 'joined') return
    if (chanRef.current) {
      supabase.removeChannel(chanRef.current)
      chanRef.current = null
    }
    const ch = supabase
      .channel(channelName(gameId))
      .on('broadcast', { event: 'round' }, ({ payload }) => setGame((g) => applyRound(g, payload as RoundPayload)))
      .on('broadcast', { event: 'result' }, ({ payload }) => setGame((g) => applyResult(g, payload as ResultPayload)))
      .on('broadcast', { event: 'final' }, ({ payload }) => setGame((g) => applyFinal(g, payload as FinalPayload)))
    ch.subscribe()
    chanRef.current = ch
  }, [gameId])

  useEffect(() => {
    if (game.status !== 'joined') return
    connect()
    return () => {
      if (chanRef.current) supabase.removeChannel(chanRef.current)
      chanRef.current = null
    }
  }, [game.status, connect])

  // ── polling fallback: 3s in lobby / finished, 2s during a round ──
  const inRound = game.gameStatus === 'playing' && !game.final
  useEffect(() => {
    if (game.status !== 'joined' && game.status !== 'spectator') return
    const ms = inRound ? 2000 : 3000
    const id = setInterval(poll, ms)
    return () => clearInterval(id)
  }, [game.status, inRound, poll])

  // ── back to foreground: poll now + rebuild channel; keep screen awake ──
  useEffect(() => {
    if (!gameId) return
    let lock: { release(): Promise<void> } | null = null
    const wake = async () => {
      try {
        lock = await (navigator as Navigator & { wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> } }).wakeLock?.request('screen') ?? null
      } catch {
        lock = null
      }
    }
    const onVis = () => {
      if (document.visibilityState !== 'visible') return
      poll()
      connect()
      wake()
    }
    document.addEventListener('visibilitychange', onVis)
    wake()
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      lock?.release().catch(() => {})
    }
  }, [gameId, poll, connect])

  const submit = useCallback(
    (roundId: string, value: number) =>
      rpc('submit_input', { p_round: roundId, p_player: game.playerId, p_value: value }, { retries: 3, delay: 200 })
        .then(() => undefined)
        .catch(() => undefined),
    [game.playerId],
  )

  return { game, submit, retry: () => location.reload() }
}
