// Schedule presets chosen from the host panel in the lobby. The last round is always the
// doubled final. Kinds the host cannot render yet are filtered out via SUPPORTED_KINDS.
import type { Kind } from '../shared/types'

export const SUPPORTED_KINDS: string[] = ['mash', 'stop', 'minority', 'rps', 'react', 'quiz', 'hold']
const NON_MASH = ['stop', 'quiz', 'react', 'minority', 'hold', 'rps']

export interface Preset { id: string; label: string; build: () => string[] }

// Every preset has exactly two quiz rounds (both Supabase questions, never back to back);
// every other kind appears at most once; mash is always the last (doubled) round.
export const PRESETS: Preset[] = [
  { id: 'all', label: 'All games (8)', build: () => ['stop', 'quiz', 'react', 'minority', 'quiz', 'hold', 'rps', 'mash'] },
  { id: 'classic', label: 'Classic 6', build: () => ['stop', 'quiz', 'minority', 'rps', 'quiz', 'mash'] },
  { id: 'random', label: 'Random 7', build: () => {
    const pool = NON_MASH.filter((k) => k !== 'quiz' && SUPPORTED_KINDS.includes(k))
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]] }
    const [a, b, c, d] = pool
    return [a, 'quiz', b, c, 'quiz', d, 'mash']
  } },
]

const KEY = 'pb:schedule'

export function loadSchedule(): { presetId: string; schedule: Kind[] } {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (raw) {
      const v = JSON.parse(raw) as { presetId: string; schedule: string[] }
      if (v.presetId !== 'random') return applyPreset(v.presetId)
      const schedule = v.schedule.filter((k) => SUPPORTED_KINDS.includes(k)) as Kind[]
      if (schedule.length) return { presetId: v.presetId, schedule }
    }
  } catch { /* ignore */ }
  return applyPreset('all')
}

export function applyPreset(presetId: string): { presetId: string; schedule: Kind[] } {
  const p = PRESETS.find((x) => x.id === presetId) ?? PRESETS[0]
  const schedule = p.build().filter((k) => SUPPORTED_KINDS.includes(k)) as Kind[]
  try { sessionStorage.setItem(KEY, JSON.stringify({ presetId: p.id, schedule })) } catch { /* ignore */ }
  return { presetId: p.id, schedule }
}
