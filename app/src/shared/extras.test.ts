import { describe, expect, it } from 'vitest'
import { beats, minorityExtra, rpsExtra } from './extras'
import { parseMinorityOptions, pickQuestion, QUESTIONS } from './questions'
import type { InputRow } from './types'

const row = (f: number, v: number, i = 0): InputRow => ({ player_id: `p${f}-${i}`, nickname: 'x', faction: f, value: v, first_at: new Date(i).toISOString() })

describe('minorityExtra', () => {
  it('tallies all factions together and finds the rare option', () => {
    const inputs = [row(0, 0, 1), row(1, 0, 2), row(2, 1, 3), row(0, 1, 4), row(1, 2, 5)]
    expect(minorityExtra(inputs)).toEqual({ tally: [2, 2, 1], minority: [2] })
  })
  it('ties and unpicked options', () => {
    expect(minorityExtra([row(0, 0), row(1, 1, 1)])).toEqual({ tally: [1, 1, 0], minority: [0, 1] })
    expect(minorityExtra([])).toEqual({ tally: [0, 0, 0], minority: [] })
  })
})

describe('rpsExtra', () => {
  it('majority per faction, ties go to rock→paper→scissors, empty faction throws rock', () => {
    const inputs = [row(0, 2, 1), row(0, 2, 2), row(0, 0, 3), row(1, 1, 4), row(1, 2, 5)]
    const ex = rpsExtra(inputs)
    expect(ex.hands).toEqual([2, 1, 0])
    expect(ex.votes).toEqual([
      [1, 0, 2],
      [0, 1, 1],
      [0, 0, 0],
    ])
  })
  it('beats', () => {
    expect(beats(0, 2)).toBe(true)
    expect(beats(1, 0)).toBe(true)
    expect(beats(2, 1)).toBe(true)
    expect(beats(0, 1)).toBe(false)
    expect(beats(0, 0)).toBe(false)
  })
})

describe('questions', () => {
  it('round-trips through options jsonb and falls back safely', () => {
    const q = pickQuestion()
    expect(parseMinorityOptions(JSON.parse(JSON.stringify(q)))).toEqual(q)
    expect(parseMinorityOptions(null)).toEqual(QUESTIONS[0])
    expect(parseMinorityOptions({ qi: 3 })).toEqual(QUESTIONS[3])
    expect(parseMinorityOptions({ q: 'A?', choices: ['a', 'b', 'c'] }).emoji).toHaveLength(3)
  })
  it('pickQuestion excludes used ones', () => {
    for (let i = 0; i < 20; i++) expect(pickQuestion([0, 1, 2, 3, 4]).qi).toBe(5)
  })
})
