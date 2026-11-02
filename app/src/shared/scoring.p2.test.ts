// P2 小游戏（少数派、猜拳）的计分边界用例，对照 DESIGN.md §5。只加测试，不改 scoring.ts。
import { describe, expect, it } from 'vitest'
import { factionScores, movesFor, mvpOf, rank, rpsScores, scoreRound } from './scoring'
import type { InputRow, Triple } from './types'

let seq = 0
const row = (f: number, v: number, atMs?: number): InputRow => ({
  player_id: `p${f}-${++seq}`,
  nickname: `n${seq}`,
  faction: f,
  value: v,
  first_at: new Date(atMs ?? seq * 1000).toISOString(),
})

describe('minority (global tally)', () => {
  it('counts the whole room, not per faction', () => {
    // 全场：选项0 ×3，选项1 ×1，选项2 ×2 → 少数派 = {1}
    const inputs = [row(0, 0), row(0, 0), row(1, 0), row(1, 1), row(2, 2), row(2, 2)]
    const counts: Triple = [2, 2, 2]
    expect(factionScores('minority', inputs, counts)).toEqual([0, 0.5, 0])
  })
  it('ignores options nobody picked', () => {
    const inputs = [row(0, 0), row(1, 0), row(2, 1)]
    expect(factionScores('minority', inputs, [1, 1, 1])).toEqual([0, 0, 1])
  })
  it('all three tied → everyone who answered is right', () => {
    const inputs = [row(0, 0), row(1, 1), row(2, 2)]
    expect(factionScores('minority', inputs, [1, 1, 1])).toEqual([1, 1, 1])
  })
  it('non-submitters count against the faction; empty faction scores 0', () => {
    const inputs = [row(0, 1), row(1, 0), row(1, 0)]
    expect(factionScores('minority', inputs, [2, 2, 0])).toEqual([0.5, 0, 0])
  })
  it('no inputs → all zero, no MVP', () => {
    expect(factionScores('minority', [], [1, 1, 1])).toEqual([0, 0, 0])
    expect(mvpOf('minority', [])).toEqual([])
  })
  it('MVP = earliest correct answers, top 3', () => {
    const late = row(0, 2, 9000), a = row(1, 2, 1000), b = row(2, 2, 2000), c = row(0, 2, 3000)
    const pop = [0, 1].flatMap((o) => [0, 1, 2, 0, 1].map((f) => row(f, o))) // 0 ×5, 1 ×5, 2 ×4 → minority {2}
    const inputs = [...pop, late, a, b, c]
    expect(mvpOf('minority', inputs).map((m) => m.player_id)).toEqual([a.player_id, b.player_id, c.player_id])
  })
})

describe('rps', () => {
  it('faction hand = majority; ties break rock → paper → scissors', () => {
    // f0: rock vs paper tie → rock; f1: paper vs scissors tie → paper; f2: scissors
    const inputs = [row(0, 0), row(0, 1), row(1, 1), row(1, 2), row(2, 2)]
    const counts: Triple = [2, 2, 1]
    // hands [0,1,2] → three distinct → all tie
    expect(rpsScores(inputs, counts)).toEqual([0, 0, 0])
  })
  it('faction with no votes throws rock', () => {
    const inputs = [row(0, 1)] // f0 paper, f1/f2 silent → rock
    expect(rpsScores(inputs, [1, 1, 1])).toEqual([2, 0, 0])
  })
  it('zero-player faction scores 0 even if its default rock would win', () => {
    const inputs = [row(0, 2), row(1, 2)] // both scissors; f2 empty throws rock
    expect(rpsScores(inputs, [1, 1, 0])).toEqual([0, 0, 0])
  })
  it('1 beats 1 case: rock, rock, paper → paper beats both', () => {
    const inputs = [row(0, 0), row(1, 0), row(2, 1)]
    expect(rpsScores(inputs, [1, 1, 1])).toEqual([0, 0, 2])
  })
  it('rock, paper, paper → papers beat rock, tie with each other', () => {
    const inputs = [row(0, 0), row(1, 1), row(2, 1)]
    expect(rpsScores(inputs, [1, 1, 1])).toEqual([0, 1, 1])
  })
  it('integer ranking: only exact ties share a rank', () => {
    expect(rank([2, 0, 0], true)).toEqual([1, 2, 2])
    expect(rank([0, 1, 1], true)).toEqual([3, 1, 1])
    expect(rank([0, 0, 0], true)).toEqual([1, 1, 1])
    expect(movesFor([1, 1, 1])).toEqual([1, 1, 1])
  })
  it('MVP = earliest voters in the winning faction; none on full tie', () => {
    const a = row(2, 1, 500), b = row(2, 1, 700), c = row(2, 1, 900), d = row(2, 1, 1100)
    const inputs = [row(0, 0, 100), row(1, 0, 200), d, c, b, a]
    expect(mvpOf('rps', inputs).map((m) => m.player_id)).toEqual([a.player_id, b.player_id, c.player_id])
    expect(mvpOf('rps', [row(0, 0), row(1, 0), row(2, 0)])).toEqual([])
    expect(mvpOf('rps', [row(0, 0), row(1, 1), row(2, 2)])).toEqual([])
  })
  it('scoreRound uses integer ranking for rps', () => {
    const r = scoreRound('rps', [row(0, 1), row(1, 0), row(2, 0)], [1, 1, 1], [0, 0, 0], false)
    expect(r.scores).toEqual([2, 0, 0])
    expect(r.ranks).toEqual([1, 2, 2])
    expect(r.moves).toEqual([3, 2, 2])
  })
})
