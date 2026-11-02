// result 广播里按游戏附带的"揭晓细节"。大屏收卷后用这里的纯函数算出来，
// 放进 ResultPayload.extra；手机没拿到也能显示（只是少了揭晓动画的数据）。
import type { InputRow, Triple } from './types'
import { minorityOptions } from './scoring'

export interface MinorityExtra {
  /** 全场每个选项的人数 */
  tally: Triple
  /** 人最少的选项（并列都算；没人选的不参与） */
  minority: number[]
}

export interface RpsExtra {
  /** 三个阵营最终出的拳 0✊ 1✋ 2✌️ */
  hands: Triple
  /** 每个阵营内三种拳的票数 votes[faction][hand] */
  votes: [Triple, Triple, Triple]
}

export function minorityExtra(inputs: InputRow[]): MinorityExtra {
  const tally: Triple = [0, 0, 0]
  for (const r of inputs) {
    const o = Math.round(r.value)
    if (o >= 0 && o <= 2) tally[o]++
  }
  return { tally, minority: [...minorityOptions(inputs)].sort() }
}

/** 阵营出拳：票最多的；平票按 ✊→✋→✌️；没人投也取 ✊（和 scoring.rpsScores 一致） */
export function rpsExtra(inputs: InputRow[]): RpsExtra {
  const votes: [Triple, Triple, Triple] = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ]
  for (const r of inputs) {
    const h = Math.round(r.value)
    if (r.faction >= 0 && r.faction <= 2 && h >= 0 && h <= 2) votes[r.faction][h]++
  }
  const hands = votes.map((t) => {
    let best = 0
    for (let i = 1; i < 3; i++) if (t[i] > t[best]) best = i
    return best
  }) as Triple
  return { hands, votes }
}

/** a 是否击败 b（✊ 胜 ✌️，✋ 胜 ✊，✌️ 胜 ✋） */
export const beats = (a: number, b: number) => (a - b + 3) % 3 === 1

export const HAND = [
  { emoji: '✊', name: 'Rock' },
  { emoji: '✋', name: 'Paper' },
  { emoji: '✌️', name: 'Scissors' },
] as const
