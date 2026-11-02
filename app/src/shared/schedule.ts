import type { Kind } from './types'

// 轮次表；最后一项是决赛（前进格数 ×2）。
// P0: ['mash','mash','mash']  P1: 下面这个  P2: ['mash','stop','minority','rps','mash']
export const SCHEDULE: Kind[] = ['mash', 'stop', 'mash', 'stop', 'mash']

export const isFinalRound = (idx: number) => idx === SCHEDULE.length - 1
