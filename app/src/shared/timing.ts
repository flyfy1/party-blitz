// 每轮 15 秒的时间分配（DESIGN.md §3）。?fast=1 时用短节奏。
export interface Timing {
  intro: number
  play: number
  collect: number
  result: number
}
export const NORMAL: Timing = { intro: 2000, play: 10000, collect: 1200, result: 1800 }
export const FAST: Timing = { intro: 1000, play: 4000, collect: 1200, result: 1000 }

export function timingFromUrl(): Timing {
  return new URLSearchParams(location.search).get('fast') ? FAST : NORMAL
}

export type Phase = 'intro' | 'play' | 'collect' | 'result' | 'done'

/**
 * 根据服务端当前时间和本轮的 starts_at / ends_at 判断阶段。
 * 手机和大屏共用，所以阶段切换时刻一致。
 */
export function phaseAt(nowMs: number, startsAt: number, endsAt: number, t: Timing): Phase {
  if (nowMs < startsAt) return 'intro'
  if (nowMs < endsAt) return 'play'
  if (nowMs < endsAt + t.collect) return 'collect'
  if (nowMs < endsAt + t.collect + t.result) return 'result'
  return 'done'
}
