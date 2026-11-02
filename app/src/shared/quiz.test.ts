import { describe, expect, it } from 'vitest'
import { QUIZ, pickSupabaseQuiz } from './quiz'
import { PRESETS } from '../host/presets'

describe('pickSupabaseQuiz', () => {
  it('always returns a Supabase question', () => {
    for (const seed of ['', 'abc', 'f3a1-9c']) for (let n = 0; n < 4; n++) expect(pickSupabaseQuiz(n, seed).supabase).toBe(true)
  })
  it('gives two different questions to the two quiz rounds of one game', () => {
    for (const seed of ['', 'a', 'game-1', '7b2e4c90-0000-4000-8000-000000000000']) {
      expect(pickSupabaseQuiz(0, seed).qi).not.toBe(pickSupabaseQuiz(1, seed).qi)
    }
  })
  it('has at least two Supabase questions in the bank', () => {
    expect(QUIZ.filter((q) => q.supabase).length).toBeGreaterThanOrEqual(2)
  })
})

describe('presets', () => {
  it('every preset has exactly two non-adjacent quiz rounds and ends on mash', () => {
    for (const p of PRESETS) for (let t = 0; t < 20; t++) {
      const s = p.build()
      const at = s.flatMap((k, i) => (k === 'quiz' ? [i] : []))
      expect(at.length).toBe(2)
      expect(at[1] - at[0]).toBeGreaterThan(1)
      expect(s[s.length - 1]).toBe('mash')
    }
  })
})
