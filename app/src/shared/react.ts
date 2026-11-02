// 🟢 Reaction (`react`): red "WAIT…" until go_at (server clock), then green "TAP!".
// value = reaction time in ms, clamped to [0, REACT_MAX]; tapping early or never = REACT_MAX.
// Score = 1 − avg(value) / REACT_MAX over the whole faction; MVP = 3 fastest real taps.
import type { InputRow, MvpEntry, Triple } from './types'

export const REACT_MAX = 2000
/** Random delay window after PLAY starts before the screen turns green */
export const REACT_GO_MIN_MS = 3000
export const REACT_GO_MAX_MS = 7000

export interface ReactOptions {
  /** ISO server time at which the screen turns green */
  go_at: string
  /** Same moment, relative to starts_at (ms); lets a client avoid any host/server clock skew */
  go_after_ms?: number
}

/** Host: build rounds.options for a react round. `startsAtMs` = PLAY start on the server clock. */
export function makeReactOptions(startsAtMs: number, rand: () => number = Math.random): ReactOptions {
  const after = Math.round(REACT_GO_MIN_MS + rand() * (REACT_GO_MAX_MS - REACT_GO_MIN_MS))
  return { go_at: new Date(startsAtMs + after).toISOString(), go_after_ms: after }
}

/** Both sides: the "go" moment in server ms. Prefers go_after_ms + startsAt, then go_at, then startsAt + 4 s. */
export function parseReactOptions(o: unknown, startsAtMs: number): { goAt: number } {
  if (o && typeof o === 'object') {
    const v = o as Partial<ReactOptions>
    if (typeof v.go_after_ms === 'number' && Number.isFinite(v.go_after_ms) && startsAtMs > 0) return { goAt: startsAtMs + v.go_after_ms }
    if (typeof v.go_at === 'string') {
      const t = Date.parse(v.go_at)
      if (!Number.isNaN(t)) return { goAt: t }
    }
  }
  return { goAt: startsAtMs + 4000 }
}

export const clampReact = (v: number) => Math.min(REACT_MAX, Math.max(0, Number.isFinite(v) ? v : REACT_MAX))

/** Faction score: 1 − mean reaction / REACT_MAX; members who never tapped count as REACT_MAX */
export function reactScores(inputs: InputRow[], counts: Triple): Triple {
  return [0, 1, 2].map((f) => {
    const n = counts[f]
    if (!n) return 0
    const rows = inputs.filter((r) => r.faction === f)
    const sum = rows.reduce((s, r) => s + clampReact(r.value), 0) + (n - rows.length) * REACT_MAX
    return Math.round((1 - sum / n / REACT_MAX) * 1e4) / 1e4
  }) as Triple
}

/** 3 fastest real taps (early taps / no taps are REACT_MAX and never MVP) */
export function reactMvp(inputs: InputRow[]): MvpEntry[] {
  return inputs
    .filter((r) => clampReact(r.value) < REACT_MAX)
    .sort((a, b) => a.value - b.value || Date.parse(a.first_at) - Date.parse(b.first_at))
    .slice(0, 3)
    .map((r) => ({ player_id: r.player_id, nick: r.nickname, faction: r.faction, value: r.value }))
}

/** Phone / stage wording for a reaction time */
export function reactVerdict(ms: number): string {
  if (ms >= REACT_MAX) return 'Too slow'
  if (ms < 250) return 'LIGHTNING ⚡'
  if (ms < 400) return 'Fast!'
  if (ms < 700) return 'Not bad'
  return 'Sleepy 😴'
}
