import { describe, expect, it } from 'vitest'
import { REACT_MAX, makeReactOptions, parseReactOptions, reactMvp, reactScores, reactVerdict } from './react'
import { scoreRound } from './scoring'
import type { InputRow } from './types'

const row = (faction: number, value: number, i = 0, t = 0): InputRow => ({
  player_id: `p${faction}-${i}`,
  nickname: `nick${faction}-${i}`,
  faction,
  value,
  first_at: new Date(1_700_000_000_000 + t).toISOString(),
})

describe('react options', () => {
  it('go_at lands 3–7 s after starts_at and go_after_ms matches', () => {
    const start = 1_700_000_000_000
    const lo = makeReactOptions(start, () => 0)
    const hi = makeReactOptions(start, () => 0.999999)
    expect(Date.parse(lo.go_at) - start).toBe(3000)
    expect(Date.parse(hi.go_at) - start).toBeGreaterThanOrEqual(6999)
    expect(parseReactOptions(lo, start).goAt).toBe(start + lo.go_after_ms!)
  })
  it('parses go_at alone, falls back to +4 s on garbage', () => {
    expect(parseReactOptions({ go_at: '2026-11-02T12:00:05.000Z' }, 0).goAt).toBe(Date.parse('2026-11-02T12:00:05.000Z'))
    expect(parseReactOptions(null, 1000).goAt).toBe(5000)
    expect(parseReactOptions({ go_at: 'nope' }, 1000).goAt).toBe(5000)
  })
})

describe('react scoring', () => {
  it('1 − mean/2000; missing players count as 2000', () => {
    const s = reactScores([row(0, 200), row(0, 600, 1), row(1, 1000)], [2, 2, 1])
    expect(s[0]).toBeCloseTo(1 - 400 / 2000)
    expect(s[1]).toBeCloseTo(1 - 1500 / 2000)
    expect(s[2]).toBe(0)
  })
  it('clamps out-of-range values', () => {
    expect(reactScores([row(0, -50), row(1, 99999)], [1, 1, 0])).toEqual([1, 0, 0])
  })
  it('MVP = 3 fastest, excluding early/no taps (2000)', () => {
    const m = reactMvp([row(0, 2000), row(1, 310), row(2, 180), row(0, 450, 1), row(1, 900, 1)])
    expect(m.map((x) => x.value)).toEqual([180, 310, 450])
  })
  it('scoreRound routes kind react', () => {
    const r = scoreRound('react', [row(0, 200), row(1, 800), row(2, 2000)], [1, 1, 1], [0, 0, 0], false)
    expect(r.ranks).toEqual([1, 2, 3])
    expect(r.mvp[0].value).toBe(200)
  })
  it('verdict wording', () => {
    expect(reactVerdict(100)).toContain('LIGHTNING')
    expect(reactVerdict(REACT_MAX)).toBe('Too slow')
  })
})
