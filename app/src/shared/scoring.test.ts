import { describe, expect, it } from 'vitest'
import { addMvpPoints, advance, applyMove, factionScores, finalResult, movesFor, mvpOf, rank, scoreRound } from './scoring'
import type { InputRow, Triple } from './types'

const row = (faction: number, value: number, i = 0, t = 0): InputRow => ({
  player_id: `p${faction}-${i}`,
  nickname: `nick${faction}-${i}`,
  faction,
  value,
  first_at: new Date(1_700_000_000_000 + t).toISOString(),
})

describe('rank (competitive, 1% tolerance)', () => {
  it('1,1,3 when top two within 1%', () => {
    expect(rank([100, 99.5, 50])).toEqual([1, 1, 3])
  })
  it('1,2,2 when bottom two tie', () => {
    expect(rank([100, 50, 50])).toEqual([1, 2, 2])
  })
  it('1,1,1 when all tie (including all zero)', () => {
    expect(rank([0, 0, 0])).toEqual([1, 1, 1])
    expect(rank([10, 10, 10])).toEqual([1, 1, 1])
  })
  it('1,2,3 normal', () => {
    expect(rank([5, 30, 10])).toEqual([3, 1, 2])
  })
  it('integer mode only ties on equality', () => {
    expect(rank([2, 1.99, 0], true)).toEqual([1, 2, 3])
    expect(rank([2, 2, 0], true)).toEqual([1, 1, 3])
  })
})

describe('movesFor', () => {
  it('3/2/1 by rank', () => expect(movesFor([2, 1, 3])).toEqual([2, 3, 1]))
  it('ties take the higher move', () => expect(movesFor([1, 1, 3])).toEqual([3, 3, 1]))
  it('all tied → 1 each', () => expect(movesFor([1, 1, 1])).toEqual([1, 1, 1]))
  it('final doubles', () => expect(movesFor([1, 2, 3], true)).toEqual([6, 4, 2]))
})

describe('board', () => {
  it('star triggers once, no chaining', () => {
    // land on 12 (star +1) → 13 is a rocket but must not chain
    expect(applyMove(10, 2)).toMatchObject({ landed: 12, final: 13 })
    expect(applyMove(10, 2).special?.emoji).toBe('⭐')
  })
  it('trap moves back', () => expect(applyMove(7, 2)).toMatchObject({ landed: 9, final: 7 }))
  it('rocket +2', () => expect(applyMove(4, 2)).toMatchObject({ landed: 6, final: 8 }))
  it('caps at 20', () => {
    expect(applyMove(19, 3).final).toBe(20)
    expect(applyMove(18, 2).final).toBe(20) // 20 is finish line, not special
  })
  it('a faction that always moves 2 hits at least one special cell', () => {
    let pos = 0
    let hit = 0
    for (let i = 0; i < 10; i++) {
      const s = applyMove(pos, 2)
      if (s.special) hit++
      pos = s.final
    }
    expect(hit).toBeGreaterThan(0)
  })
  it('advance applies to all three', () => {
    expect(advance([0, 0, 0], [3, 2, 1]).positions).toEqual([3, 2, 1])
  })
})

describe('factionScores', () => {
  const counts: Triple = [2, 2, 2]
  it('mash: average over all members', () => {
    const s = factionScores('mash', [row(0, 10), row(0, 20, 1), row(1, 30)], counts)
    expect(s).toEqual([15, 15, 0])
  })
  it('stop: 1 - mean deviation; missing players count as 1', () => {
    const s = factionScores('stop', [row(0, 0.2), row(0, 0.4, 1), row(1, 0)], counts)
    expect(s[0]).toBeCloseTo(0.7)
    expect(s[1]).toBeCloseTo(0.5)
    expect(s[2]).toBe(0)
  })
  it('empty faction scores 0', () => {
    expect(factionScores('mash', [row(0, 5)], [1, 0, 0])).toEqual([5, 0, 0])
  })
  it('minority: tie for fewest counts both', () => {
    const inputs = [row(0, 0), row(0, 1, 1), row(1, 2), row(1, 2, 1), row(2, 2)]
    // tally: 0→1, 1→1, 2→3 → minority = {0,1}
    expect(factionScores('minority', inputs, [2, 2, 1])).toEqual([1, 0, 0])
  })
  it('rps: all same or all different → 0', () => {
    expect(factionScores('rps', [row(0, 0), row(1, 0), row(2, 0)], [1, 1, 1])).toEqual([0, 0, 0])
    expect(factionScores('rps', [row(0, 0), row(1, 1), row(2, 2)], [1, 1, 1])).toEqual([0, 0, 0])
  })
  it('rps: paper beats two rocks', () => {
    expect(factionScores('rps', [row(0, 1), row(1, 0), row(2, 0)], [1, 1, 1])).toEqual([2, 0, 0])
  })
})

describe('mvp', () => {
  it('mash: top 3 by value', () => {
    const m = mvpOf('mash', [row(0, 5), row(1, 50), row(2, 20), row(0, 30, 1)])
    expect(m.map((x) => x.value)).toEqual([50, 30, 20])
  })
  it('stop: smallest deviation first', () => {
    const m = mvpOf('stop', [row(0, 0.5), row(1, 0.01), row(2, 0.2)])
    expect(m[0].player_id).toBe('p1-0')
  })
  it('points accumulate 3/2/1 and final picks winner + top3', () => {
    let pts = addMvpPoints({}, mvpOf('mash', [row(0, 5), row(1, 50), row(2, 20)]), 0)
    pts = addMvpPoints(pts, mvpOf('mash', [row(0, 5), row(1, 50), row(2, 20)]), 1)
    expect(pts['p1-0'].points).toBe(6)
    const f = finalResult([20, 20, 3], pts)
    expect(f.winner).toEqual([0, 1])
    expect(f.mvp_top3[0].player_id).toBe('p1-0')
  })
})

describe('scoreRound end to end', () => {
  it('mash round moves pieces', () => {
    const r = scoreRound('mash', [row(0, 40), row(1, 10), row(2, 20)], [1, 1, 1], [0, 0, 0], false)
    expect(r.ranks).toEqual([1, 3, 2])
    expect(r.moves).toEqual([3, 1, 2])
    expect(r.positions).toEqual([3, 1, 2])
  })
})
