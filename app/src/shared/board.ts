// 棋盘（DESIGN.md §4）：20 格直线赛道，特殊格只在停下时触发一次，不连锁。
export const BOARD_SIZE = 20

export type CellType = 'normal' | 'star' | 'rocket' | 'trap'

export const SPECIAL_CELLS: Record<number, { type: CellType; delta: number; emoji: string; label: string }> = {
  4: { type: 'star', delta: 1, emoji: '⭐', label: '+1' },
  7: { type: 'star', delta: 1, emoji: '⭐', label: '+1' },
  12: { type: 'star', delta: 1, emoji: '⭐', label: '+1' },
  15: { type: 'star', delta: 1, emoji: '⭐', label: '+1' },
  6: { type: 'rocket', delta: 2, emoji: '🚀', label: '+2' },
  13: { type: 'rocket', delta: 2, emoji: '🚀', label: '+2' },
  9: { type: 'trap', delta: -2, emoji: '💥', label: '-2' },
  16: { type: 'trap', delta: -2, emoji: '💥', label: '-2' },
}

export const cellType = (i: number): CellType => SPECIAL_CELLS[i]?.type ?? 'normal'
