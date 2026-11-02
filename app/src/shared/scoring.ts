// 计分、排名、棋盘移动：全部是纯函数，有单元测试（DESIGN.md §4 §5）。
import { BOARD_SIZE, SPECIAL_CELLS } from './board'
import type { FinalPayload, GameState, InputRow, Kind, MvpEntry, Triple } from './types'

const EMPTY: Triple = [0, 0, 0]

/** 阵营得分（人均；分母是阵营全部成员数 counts） */
export function factionScores(kind: Kind, inputs: InputRow[], counts: Triple): Triple {
  const out: Triple = [...EMPTY]
  for (let f = 0; f < 3; f++) {
    const n = counts[f]
    if (!n) continue
    const rows = inputs.filter((r) => r.faction === f)
    if (kind === 'mash') {
      out[f] = rows.reduce((s, r) => s + r.value, 0) / n
    } else if (kind === 'stop') {
      // 没提交的人按偏差 1 计算
      const dev = rows.reduce((s, r) => s + clamp01(r.value), 0) + (n - rows.length) * 1
      out[f] = 1 - dev / n
    } else if (kind === 'minority') {
      const minority = minorityOptions(inputs)
      out[f] = rows.filter((r) => minority.has(Math.round(r.value))).length / n
    } else if (kind === 'rps') {
      out[f] = rpsScores(inputs, counts)[f]
    }
  }
  return out.map((v) => round4(v)) as Triple
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
const round4 = (v: number) => Math.round(v * 1e4) / 1e4

/** 少数派：按全场统计，选的人最少的选项（并列都算；没人选的不参与） */
export function minorityOptions(inputs: InputRow[]): Set<number> {
  const tally = [0, 0, 0]
  for (const r of inputs) {
    const o = Math.round(r.value)
    if (o >= 0 && o <= 2) tally[o]++
  }
  const present = tally.filter((t) => t > 0)
  if (!present.length) return new Set()
  const min = Math.min(...present)
  return new Set(tally.map((t, i) => (t === min ? i : -1)).filter((i) => i >= 0))
}

/** 猜拳：阵营出拳 = 票数最多（平票按 0→1→2，没人投也取 0）；得分 = 击败的阵营数 */
export function rpsScores(inputs: InputRow[], counts: Triple): Triple {
  const hands = [0, 1, 2].map((f) => {
    const tally = [0, 0, 0]
    for (const r of inputs) if (r.faction === f) tally[Math.round(r.value)]++
    let best = 0
    for (let i = 1; i < 3; i++) if (tally[i] > tally[best]) best = i
    return best
  })
  const beats = (a: number, b: number) => (a - b + 3) % 3 === 1 // 0✊ beats 2✌️, 1✋ beats 0✊, 2✌️ beats 1✋
  const distinct = new Set(hands).size
  if (distinct === 1 || distinct === 3) return [0, 0, 0]
  return hands.map((h, f) =>
    counts[f] ? hands.reduce((s, o, g) => s + (g !== f && beats(h, o) ? 1 : 0), 0) : 0,
  ) as Triple
}

/**
 * 竞争排名：按得分降序，第 i 个和第 i-1 个的差 <= 1% × 前者就同名次。
 * 结果是按阵营下标排列的名次（1,1,3 / 1,2,2 / 1,1,1）。integer=true 时只有相等才并列（猜拳）。
 */
export function rank(scores: Triple, integer = false): Triple {
  const order = [0, 1, 2].sort((a, b) => scores[b] - scores[a])
  const ranks: Triple = [0, 0, 0]
  let prevRank = 1
  for (let i = 0; i < 3; i++) {
    const f = order[i]
    if (i === 0) {
      ranks[f] = 1
      continue
    }
    const prev = scores[order[i - 1]]
    const cur = scores[f]
    const tied = integer ? prev === cur : prev - cur <= 0.01 * prev + 1e-9
    ranks[f] = tied ? prevRank : i + 1
    prevRank = ranks[f]
  }
  return ranks
}

/** 名次 → 前进格数：1→3, 2→2, 3→1；三家全平各走 1；决赛翻倍 */
export function movesFor(ranks: Triple, final = false): Triple {
  const allTied = ranks[0] === 1 && ranks[1] === 1 && ranks[2] === 1
  const base: Triple = allTied ? [1, 1, 1] : (ranks.map((r) => 4 - r) as Triple)
  return base.map((m) => m * (final ? 2 : 1)) as Triple
}

export interface MoveStep {
  from: number
  landed: number
  /** 停在特殊格时触发后的最终位置（不连锁） */
  final: number
  special?: { emoji: string; label: string; delta: number }
}

/** 一个棋子前进 move 格：先走到 landed，停在特殊格就再触发一次，20 格封顶 */
export function applyMove(pos: number, move: number): MoveStep {
  const landed = Math.min(BOARD_SIZE, Math.max(0, pos + move))
  const sp = landed < BOARD_SIZE ? SPECIAL_CELLS[landed] : undefined
  if (!sp) return { from: pos, landed, final: landed }
  const fin = Math.min(BOARD_SIZE, Math.max(0, landed + sp.delta))
  return { from: pos, landed, final: fin, special: { emoji: sp.emoji, label: sp.label, delta: sp.delta } }
}

export function advance(positions: Triple, moves: Triple): { positions: Triple; steps: MoveStep[] } {
  const steps = positions.map((p, i) => applyMove(p, moves[i]))
  return { positions: steps.map((s) => s.final) as Triple, steps }
}

/** 本轮 MVP 前三 */
export function mvpOf(kind: Kind, inputs: InputRow[]): MvpEntry[] {
  let rows = [...inputs]
  const byTime = (a: InputRow, b: InputRow) => Date.parse(a.first_at) - Date.parse(b.first_at)
  if (kind === 'mash') rows.sort((a, b) => b.value - a.value || byTime(a, b))
  else if (kind === 'stop') rows.sort((a, b) => a.value - b.value || byTime(a, b))
  else if (kind === 'minority') {
    const m = minorityOptions(inputs)
    rows = rows.filter((r) => m.has(Math.round(r.value))).sort(byTime)
  } else if (kind === 'rps') {
    const counts: Triple = [1, 1, 1]
    const s = rpsScores(inputs, counts)
    const best = Math.max(...s)
    rows = best > 0 ? rows.filter((r) => s[r.faction] === best).sort(byTime) : []
  }
  return rows.slice(0, 3).map((r) => ({ player_id: r.player_id, nick: r.nickname, faction: r.faction, value: r.value }))
}

/** 每轮 MVP 前三得 3/2/1 分，累计到 state.mvp_points */
export function addMvpPoints(points: GameState['mvp_points'], mvp: MvpEntry[], roundIdx: number): GameState['mvp_points'] {
  const out = { ...points }
  mvp.forEach((m, i) => {
    const prev = out[m.player_id]
    out[m.player_id] = {
      nick: m.nick,
      faction: m.faction,
      points: (prev?.points ?? 0) + (3 - i),
      last_round: roundIdx,
    }
  })
  return out
}

/** 颁奖：位置最远的阵营获胜（并列都算）；MVP 按总分，同分按 last_round 小的在前 */
export function finalResult(positions: Triple, points: GameState['mvp_points']): Omit<FinalPayload, 'type'> {
  const max = Math.max(...positions)
  const winners = [0, 1, 2].filter((f) => positions[f] === max)
  const mvp_top3 = Object.entries(points)
    .map(([player_id, p]) => ({ player_id, ...p }))
    .sort((a, b) => b.points - a.points || a.last_round - b.last_round)
    .slice(0, 3)
    .map(({ player_id, nick, faction, points }) => ({ player_id, nick, faction, points }))
  return { winner: winners.length === 1 ? winners[0] : winners, positions, mvp_top3 }
}

/** 一轮收卷后的完整计算 */
export function scoreRound(
  kind: Kind,
  inputs: InputRow[],
  counts: Triple,
  positions: Triple,
  final: boolean,
): { scores: Triple; ranks: Triple; moves: Triple; positions: Triple; steps: MoveStep[]; mvp: MvpEntry[] } {
  const scores = factionScores(kind, inputs, counts)
  const ranks = rank(scores, kind === 'rps')
  const moves = movesFor(ranks, final)
  const adv = advance(positions, moves)
  return { scores, ranks, moves, positions: adv.positions, steps: adv.steps, mvp: mvpOf(kind, inputs) }
}
