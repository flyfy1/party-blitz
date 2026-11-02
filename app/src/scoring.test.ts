import { describe, expect, it } from 'vitest'
import { addMvpPoints, advance, applyMove, mashMvp, mashScores, movesFromRanks, mvpTop3, rank, winners } from './scoring'
import type { LiveRow } from './types'

const row = (faction: number, value: number, id = Math.random().toString(36).slice(2)): LiveRow =>
  ({ player_id: id, nickname: 'n' + id, faction, value, first_at: '2026-01-01T00:00:00Z' })

describe('mash', () => {
  it('scores by average over all faction members, not just submitters', () => {
    const rows = [row(0, 30), row(0, 10), row(1, 50)]
    expect(mashScores(rows, [4, 2, 3])).toEqual([10, 25, 0])
  })
  it('empty faction scores 0', () => {
    expect(mashScores([], [0, 1, 2])).toEqual([0, 0, 0])
  })
  it('mvp is top 3 by taps', () => {
    const rows = [row(0, 5, 'a'), row(1, 50, 'b'), row(2, 20, 'c'), row(0, 30, 'd')]
    expect(mashMvp(rows).map((m) => m.player_id)).toEqual(['b', 'd', 'c'])
  })
})

describe('rank (competition, 1% tolerance)', () => {
  it('distinct scores → 1,2,3', () => expect(rank([10, 30, 20])).toEqual([3, 1, 2]))
  it('two tied at the top → 1,1,3', () => expect(rank([100, 99.5, 50])).toEqual([1, 1, 3]))
  it('two tied at the bottom → 1,2,2', () => expect(rank([100, 50, 49.6])).toEqual([1, 2, 2]))
  it('all equal → 1,1,1', () => expect(rank([0, 0, 0])).toEqual([1, 1, 1]))
  it('just outside tolerance is not a tie', () => expect(rank([100, 98.9, 0])).toEqual([1, 2, 3]))
  it('integer scores tie only when equal', () => {
    expect(rank([2, 2, 0], 0)).toEqual([1, 1, 3])
    expect(rank([200, 199, 0], 0)).toEqual([1, 2, 3])
  })
})

describe('movesFromRanks', () => {
  it('3/2/1', () => expect(movesFromRanks([1, 2, 3])).toEqual([3, 2, 1]))
  it('ties take the higher move', () => {
    expect(movesFromRanks([1, 1, 3])).toEqual([3, 3, 1])
    expect(movesFromRanks([1, 2, 2])).toEqual([3, 2, 2])
  })
  it('all tied → 1 each', () => expect(movesFromRanks([1, 1, 1])).toEqual([1, 1, 1]))
  it('final round doubles', () => {
    expect(movesFromRanks([1, 2, 3], true)).toEqual([6, 4, 2])
    expect(movesFromRanks([1, 1, 1], true)).toEqual([2, 2, 2])
  })
})

describe('board', () => {
  it('star +1, no chaining into the rocket', () => {
    // 2 + 2 = 4 (star) → 5. 5 is plain.
    expect(applyMove(2, 2)).toMatchObject({ landed: 4, final: 5 })
    // 3 + 3 = 6 (rocket) → 8. 8 is plain.
    expect(applyMove(3, 3)).toMatchObject({ landed: 6, final: 8 })
    // 10 + 2 = 12 (star) → 13 is a rocket but must NOT chain.
    expect(applyMove(10, 2)).toMatchObject({ landed: 12, final: 13 })
  })
  it('trap -2 and no chain', () => {
    // 6 + 3 = 9 (trap) → 7 is a star but must NOT chain.
    expect(applyMove(6, 3)).toMatchObject({ landed: 9, final: 7 })
    expect(applyMove(13, 3)).toMatchObject({ landed: 16, final: 14 })
  })
  it('passing over a special does not trigger it', () => {
    expect(applyMove(3, 3)).toMatchObject({ landed: 6 }) // passed 4 (star)
    expect(applyMove(5, 3).special).toBeNull()           // landed on 8
  })
  it('caps at 20 and does not go below 0', () => {
    expect(applyMove(19, 3)).toMatchObject({ landed: 20, final: 20, special: null })
    expect(applyMove(20, 6).final).toBe(20)
    expect(applyMove(0, 0).final).toBe(0)
  })
  it('advance moves all three', () => {
    const r = advance([0, 2, 19], [3, 2, 6])
    expect(r.positions).toEqual([3, 5, 20])
  })
  it('winners: single or tied', () => {
    expect(winners([5, 9, 2])).toBe(1)
    expect(winners([9, 9, 2])).toEqual([0, 1])
  })
})

describe('mvp points', () => {
  it('3/2/1 per round, top3 by total then earliest round', () => {
    let pts = {}
    pts = addMvpPoints(pts, [{ player_id: 'a', nick: 'A', faction: 0, value: 9 }, { player_id: 'b', nick: 'B', faction: 1, value: 8 }], 0)
    pts = addMvpPoints(pts, [{ player_id: 'c', nick: 'C', faction: 2, value: 9 }, { player_id: 'a', nick: 'A', faction: 0, value: 8 }], 1)
    const top = mvpTop3(pts)
    expect(top.map((t) => [t.player_id, t.points])).toEqual([['a', 5], ['c', 3], ['b', 2]])
  })
})
