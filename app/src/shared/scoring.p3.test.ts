import { describe, expect, it } from 'vitest'
import { parseQuizOptions, pickQuiz, QUIZ } from './quiz'
import { scoreRound } from './scoring'
import { HOLD_TARGET_MS, holdDeviation, holdExtra, holdScores, mvpOfP3, quizExtra, quizScores } from './scoring.p3'
import type { InputRow, Triple } from './types'

let seq = 0
const row = (f: number, v: number, atMs?: number): InputRow => ({ player_id: `p${f}-${++seq}`, nickname: `n${seq}`, faction: f, value: v, first_at: new Date(atMs ?? seq * 1000).toISOString() })

describe('quiz', () => {
  it('score = correct members / faction size, non-answers count as wrong', () => {
    const inputs = [row(0, 1), row(0, 1), row(1, 1), row(1, 0), row(2, 2)]
    expect(quizScores(inputs, [2, 2, 2], 1)).toEqual([1, 0.5, 0])
    expect(quizScores(inputs, [2, 2, 0], 1)).toEqual([1, 0.5, 0])
  })
  it('MVP = earliest 3 correct', () => {
    const a = row(0, 2, 300), b = row(1, 2, 100), c = row(2, 2, 200), d = row(0, 2, 400)
    expect(mvpOfP3('quiz', [row(0, 0, 50), d, a, b, c], 2).map((m) => m.player_id)).toEqual([b.player_id, c.player_id, a.player_id])
    expect(mvpOfP3('quiz', [row(0, 0)], 2)).toEqual([])
  })
  it('extra tallies all three choices', () => {
    expect(quizExtra([row(0, 0), row(1, 2), row(2, 2)], 2)).toEqual({ tally: [1, 0, 2], answer: 2 })
  })
  it('bank: 10 questions, pickQuiz excludes used, options round-trip', () => {
    expect(QUIZ).toHaveLength(10)
    for (let i = 0; i < 20; i++) expect(pickQuiz([0, 1, 2, 3, 4, 5, 6, 7, 8]).qi).toBe(9)
    const q = pickQuiz()
    expect(parseQuizOptions(JSON.parse(JSON.stringify(q)))).toEqual(q)
    expect(parseQuizOptions(null)).toEqual(QUIZ[0])
    expect(parseQuizOptions({ qi: 4 })).toEqual(QUIZ[4])
  })
  it('scoreRound reads the answer from options and uses tolerant ranking', () => {
    const r = scoreRound('quiz', [row(0, 1), row(1, 1), row(2, 0)], [1, 1, 1], [0, 0, 0], false, { q: 'x', choices: ['a', 'b', 'c'], answer: 1 })
    expect(r.scores).toEqual([1, 1, 0])
    expect(r.ranks).toEqual([1, 1, 3])
    expect(r.moves).toEqual([3, 3, 1])
    expect(r.mvp.map((m) => m.faction)).toEqual([0, 1])
  })
})

describe('hold', () => {
  it('deviation is |held − 5 s| / 5 s clamped to 1', () => {
    expect(holdDeviation(HOLD_TARGET_MS)).toBe(0)
    expect(holdDeviation(5500)).toBeCloseTo(0.1)
    expect(holdDeviation(4000)).toBeCloseTo(0.2)
    expect(holdDeviation(12000)).toBe(1)
    expect(holdDeviation(0)).toBe(1)
  })
  it('score = 1 − avg deviation; missing players count as 1; empty faction 0', () => {
    const inputs = [row(0, 0.1), row(0, 0.3), row(1, 0)]
    const counts: Triple = [2, 2, 0]
    expect(holdScores(inputs, counts)).toEqual([0.8, 0.5, 0])
  })
  it('values outside [0,1] are clamped', () => {
    expect(holdScores([row(0, 5), row(1, -1)], [1, 1, 1])).toEqual([0, 1, 0])
  })
  it('MVP = 3 smallest deviations, ties by time', () => {
    const a = row(0, 0.01, 900), b = row(1, 0.01, 100), c = row(2, 0.2), d = row(0, 0.5)
    expect(mvpOfP3('hold', [d, c, a, b]).map((m) => m.player_id)).toEqual([b.player_id, a.player_id, c.player_id])
  })
  it('extra gives per-faction avg deviation and the closest player', () => {
    const best = row(2, 0.02)
    const ex = holdExtra([row(0, 0.1), best], [1, 1, 1])
    expect(ex.avgDev).toEqual([0.1, 1, 0.02])
    expect(ex.best?.player_id).toBe(best.player_id)
    expect(holdExtra([], [1, 1, 1]).best).toBeNull()
  })
  it('scoreRound hold end to end (final round doubles moves)', () => {
    const r = scoreRound('hold', [row(0, 0), row(1, 0.5), row(2, 1)], [1, 1, 1], [0, 0, 0], true)
    expect(r.scores).toEqual([1, 0.5, 0])
    expect(r.ranks).toEqual([1, 2, 3])
    expect(r.moves).toEqual([6, 4, 2])
  })
})
