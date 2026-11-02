import type { Kind } from './types'

/** Round order. The last round is the final (moves ×2). */
export const SCHEDULE: Kind[] = ['mash', 'mash', 'mash']

export interface Timing { intro: number; play: number; collect: number; result: number }
export const TIMING_NORMAL: Timing = { intro: 2000, play: 10000, collect: 1200, result: 1800 }
export const TIMING_FAST: Timing   = { intro: 1000, play: 4000,  collect: 1200, result: 1000 }
