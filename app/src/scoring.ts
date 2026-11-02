// Pure scoring functions. Run on the host (screen). Unit-tested in scoring.test.ts.
import { BOARD_LEN, SPECIALS } from './board'
import type { LiveRow, Mvp, Triple } from './types'

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

/** ⚡ mash: faction score = total taps ÷ faction member count (0 if the faction is empty). */
export function mashScores(rows: LiveRow[], counts: Triple): Triple {
  const sums: Triple = [0, 0, 0]
  for (const r of rows) if (r.faction >= 0 && r.faction <= 2) sums[r.faction] += r.value
  return sums.map((s, i) => (counts[i] > 0 ? s / counts[i] : 0)) as Triple
}

/** ⚡ mash MVP: top-n by taps. */
export function mashMvp(rows: LiveRow[], n = 3): Mvp[] {
  return [...rows]
    .sort((a, b) => b.value - a.value || a.first_at.localeCompare(b.first_at))
    .slice(0, n)
    .map((r) => ({ player_id: r.player_id, nick: r.nickname, faction: r.faction, value: r.value }))
}

/**
 * Competition ranking (1,1,3 style). Sorted descending; an entry ties with the previous one when
 * prev - cur <= tolerance × prev. Integer scores (rps) tie only when equal (tolerance 0).
 */
export function rank(scores: number[], tolerance = 0.01): number[] {
  const order = scores.map((s, i) => i).sort((a, b) => scores[b] - scores[a] || a - b)
  const ranks = new Array<number>(scores.length).fill(0)
  for (let i = 0; i < order.length; i++) {
    if (i === 0) { ranks[order[0]] = 1; continue }
    const prev = scores[order[i - 1]]
    const cur = scores[order[i]]
    const tied = prev - cur <= tolerance * prev + 1e-12
    ranks[order[i]] = tied ? ranks[order[i - 1]] : i + 1
  }
  return ranks
}

/** Ranks → cells to move. 1st 3, 2nd 2, 3rd 1; ties take the higher value; all tied → 1 each; final ×2. */
export function movesFromRanks(ranks: number[], finalRound = false): Triple {
  const allTied = ranks.every((r) => r === ranks[0])
  const base = ranks.map((r) => (allTied ? 1 : r === 1 ? 3 : r === 2 ? 2 : 1))
  return base.map((m) => (finalRound ? m * 2 : m)) as Triple
}

export interface Step { from: number; landed: number; final: number; special: null | { icon: string; delta: number } }

/** Move one piece: clamp to the board, then trigger the special tile it lands on once (no chaining). */
export function applyMove(pos: number, move: number): Step {
  const landed = clamp(pos + move, 0, BOARD_LEN)
  const sp = SPECIALS[landed]
  if (!sp || landed === BOARD_LEN) return { from: pos, landed, final: landed, special: null }
  return { from: pos, landed, final: clamp(landed + sp.delta, 0, BOARD_LEN), special: { icon: sp.icon, delta: sp.delta } }
}

export function advance(positions: Triple, moves: Triple): { positions: Triple; steps: Step[] } {
  const steps = positions.map((p, i) => applyMove(p, moves[i]))
  return { positions: steps.map((s) => s.final) as Triple, steps }
}

/** Winner(s): the faction(s) with the furthest position. */
export function winners(positions: Triple): number | number[] {
  const max = Math.max(...positions)
  const w = positions.map((p, i) => (p === max ? i : -1)).filter((i) => i >= 0)
  return w.length === 1 ? w[0] : w
}

/** Add 3/2/1 MVP points for the round's top 3. Returns a new map. */
export function addMvpPoints(
  points: Record<string, { nick: string; faction: number; points: number; last_round: number }>,
  mvp: Mvp[],
  roundIdx: number,
) {
  const next = { ...points }
  mvp.slice(0, 3).forEach((m, i) => {
    const prev = next[m.player_id]
    next[m.player_id] = { nick: m.nick, faction: m.faction, points: (prev?.points ?? 0) + (3 - i), last_round: roundIdx }
  })
  return next
}

export function mvpTop3(points: Record<string, { nick: string; faction: number; points: number; last_round: number }>) {
  return Object.entries(points)
    .sort(([, a], [, b]) => b.points - a.points || a.last_round - b.last_round)
    .slice(0, 3)
    .map(([player_id, p]) => ({ player_id, nick: p.nick, faction: p.faction, points: p.points }))
}
