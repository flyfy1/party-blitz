// P3 新小游戏（quiz、hold）的计分函数和揭晓数据。scoring.ts 的 factionScores / mvpOf / scoreRound 已接入这里的函数，
// host 照常调用 scoreRound(kind, inputs, counts, positions, final, options)。submit_input 校验见文件底部。
import type { InputRow, MvpEntry, Triple } from './types'

/** 两个新游戏的文案（和 factions.ts 的 KIND_META 一致） */
export const KIND_META_P3 = {
  quiz: { icon: '🧠', title: 'Pop Quiz', verb: 'QUIZ!', hint: 'One tap. Pick the right answer' },
  hold: { icon: '⏱️', title: 'Hold Five', verb: 'HOLD FOR 5 SECONDS!', hint: 'Press, hold, release at exactly 5.00 s' },
} as const

export const HOLD_TARGET_MS = 5000

/** hold 的本地偏差值：|held − 5000| / 5000，夹到 [0, 1]；0 = 正好 5 秒 */
export const holdDeviation = (heldMs: number) => Math.min(1, Math.abs(heldMs - HOLD_TARGET_MS) / HOLD_TARGET_MS)

const round4 = (v: number) => Math.round(v * 1e4) / 1e4
const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

/** quiz：答对的成员 ÷ 阵营人数 */
export function quizScores(inputs: InputRow[], counts: Triple, answer: number): Triple {
  const out: Triple = [0, 0, 0]
  for (let f = 0; f < 3; f++) {
    if (!counts[f]) continue
    out[f] = round4(inputs.filter((r) => r.faction === f && Math.round(r.value) === answer).length / counts[f])
  }
  return out
}

/** hold：1 − 人均偏差；没提交的人按偏差 1 计算（和 stop 一样） */
export function holdScores(inputs: InputRow[], counts: Triple): Triple {
  const out: Triple = [0, 0, 0]
  for (let f = 0; f < 3; f++) {
    const n = counts[f]
    if (!n) continue
    const rows = inputs.filter((r) => r.faction === f)
    const dev = rows.reduce((s, r) => s + clamp01(r.value), 0) + (n - rows.length)
    out[f] = round4(1 - dev / n)
  }
  return out
}

const byTime = (a: InputRow, b: InputRow) => Date.parse(a.first_at) - Date.parse(b.first_at)
const toMvp = (r: InputRow): MvpEntry => ({ player_id: r.player_id, nick: r.nickname, faction: r.faction, value: r.value })

/** 本轮 MVP 前三：quiz = 最早答对的 3 人；hold = 偏差最小的 3 人 */
export function mvpOfP3(kind: 'quiz' | 'hold', inputs: InputRow[], answer = 0): MvpEntry[] {
  let rows = [...inputs]
  if (kind === 'quiz') rows = rows.filter((r) => Math.round(r.value) === answer).sort(byTime)
  else rows.sort((a, b) => clamp01(a.value) - clamp01(b.value) || byTime(a, b))
  return rows.slice(0, 3).map(toMvp)
}

export interface QuizExtra {
  tally: Triple
  answer: number
}
export interface HoldExtra {
  /** 每个阵营的人均偏差（含没提交的人） */
  avgDev: Triple
  /** 全场最接近 5 秒的人 */
  best: { player_id: string; nick: string; faction: number; dev: number } | null
}

export function quizExtra(inputs: InputRow[], answer: number): QuizExtra {
  const tally: Triple = [0, 0, 0]
  for (const r of inputs) {
    const o = Math.round(r.value)
    if (o >= 0 && o <= 2) tally[o]++
  }
  return { tally, answer }
}

export function holdExtra(inputs: InputRow[], counts: Triple): HoldExtra {
  const s = holdScores(inputs, counts)
  const avgDev = s.map((v, f) => (counts[f] ? round4(1 - v) : 1)) as Triple
  const best = [...inputs].sort((a, b) => clamp01(a.value) - clamp01(b.value) || byTime(a, b))[0]
  return { avgDev, best: best ? { player_id: best.player_id, nick: best.nickname, faction: best.faction, dev: clamp01(best.value) } : null }
}

/*
 * submit_input 校验（迁移里按 kind 加两个分支，和 minority / stop 一样）：
 *   quiz: value 必须是 0/1/2；已有记录不覆盖（on conflict do nothing）
 *   hold: value 夹到 [0,1]；覆盖（on conflict do update），和 stop 相同
 */
