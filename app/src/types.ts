// Shared contracts between phone, screen (host) and the database. See DESIGN.md §7.
export type Kind = 'mash' | 'stop' | 'minority' | 'rps'
export type Faction = 0 | 1 | 2
export type GameStatus = 'lobby' | 'playing' | 'finished'
export type Triple = [number, number, number]

export interface RoundInfo {
  id: string
  kind: Kind
  options: unknown
  starts_at: string // server timestamp (ISO) – PLAY starts
  ends_at: string   // server timestamp (ISO) – PLAY ends
}

/** One row from round_live: one input per player. */
export interface LiveRow {
  player_id: string
  nickname: string
  faction: number
  value: number
  first_at: string
}

export interface PlayerRow {
  id: string
  nickname: string
  faction: number
  joined_at: string
}

export interface Mvp {
  player_id: string
  nick: string
  faction: number
  value: number
}

export interface RoundPayload {
  type: 'round'
  round_idx: number
  round_id: string
  kind: Kind
  options?: unknown
  starts_at: string
  ends_at: string
}

export interface ResultPayload {
  type: 'result'
  round_idx: number
  ranks: Triple      // 1-based competition ranks, e.g. [1,1,3]
  scores: Triple     // faction scores (mash: avg taps per member)
  moves: Triple      // cells moved this round (before special tiles)
  positions: Triple  // positions after the move (after special tiles)
  mvp: Mvp[]         // top 3 of the round
}

export interface FinalPayload {
  type: 'final'
  winner: number | number[]
  positions: Triple
  mvp_top3: { player_id: string; nick: string; faction: number; points: number }[]
}

export type Broadcast = RoundPayload | ResultPayload | FinalPayload

/** games.state – written by the host, read by phones via get_state. */
export interface GameState {
  positions: Triple
  round_idx: number
  last_result: ResultPayload | null
  mvp_points: Record<string, { nick: string; faction: number; points: number; last_round: number }>
}

/** get_state() response. */
export interface StateResp {
  status: GameStatus
  round_idx: number
  round: RoundInfo | null
  counts: Triple
  state: Partial<GameState>
  max_players: number
  server_now: string
}

export interface JoinResp {
  faction?: number
  nickname?: string
  full?: boolean
  server_now: string
}
