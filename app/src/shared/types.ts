// 大屏 ↔ 手机 的契约（DESIGN.md §7）。两边都只 import 这里的类型，不互相 import。

export type Kind = 'mash' | 'stop' | 'minority' | 'rps'
export type Faction = 0 | 1 | 2
export type Triple = [number, number, number]

/** 大屏在 start_round 之后广播，手机据此切换阶段（时间戳是服务端 ISO 字符串） */
export interface RoundPayload {
  type: 'round'
  round_idx: number
  round_id: string
  kind: Kind
  options?: unknown
  starts_at: string
  ends_at: string
  /** 决赛轮（前进格数 ×2） */
  final?: boolean
}

export interface MvpEntry {
  player_id: string
  nick: string
  faction: number
  value: number
}

/** 收卷计分后广播 */
export interface ResultPayload {
  type: 'result'
  round_idx: number
  kind: Kind
  ranks: Triple
  scores: Triple
  moves: Triple
  positions: Triple
  mvp: MvpEntry[]
}

export interface FinalPayload {
  type: 'final'
  winner: number | number[]
  positions: Triple
  mvp_top3: { player_id: string; nick: string; faction: number; points: number }[]
}

export type Broadcast = RoundPayload | ResultPayload | FinalPayload

/** games.state（host 写，手机兜底轮询时读） */
export interface GameState {
  positions: Triple
  round_idx: number
  last_result: ResultPayload | null
  last_final?: FinalPayload | null
  mvp_points: Record<string, { nick: string; faction: number; points: number; last_round: number }>
}

export interface RoundRow {
  id: string
  kind: Kind
  options: unknown
  starts_at: string
  ends_at: string
}

export interface PlayerRow {
  id: string
  nickname: string
  faction: number
}

/** get_state 的返回 */
export interface StateResponse {
  status: 'lobby' | 'playing' | 'finished'
  round_idx: number
  state: Partial<GameState>
  max_players: number
  server_now: string
  round: RoundRow | null
  counts: Triple
  players: PlayerRow[]
}

/** join_game 的返回 */
export type JoinResponse =
  | { faction: number; nickname: string; server_now: string; full?: undefined }
  | { full: true; server_now: string }

/** round_inputs 的一行（每个玩家一行；收卷计分和飞镖都用它） */
export interface InputRow {
  player_id: string
  nickname: string
  faction: number
  value: number
  first_at: string
}

/** round_live 的一行（按阵营聚合；狂点赛跑每 250ms 用它） */
export interface LiveRow {
  faction: number
  n: number
  sum: number
}
