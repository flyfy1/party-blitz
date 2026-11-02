export const BOARD_LEN = 20 // cells 0..20, 20 = finish

export type Special = { kind: 'star' | 'rocket' | 'trap'; delta: number; icon: string }

export const SPECIALS: Record<number, Special> = {
  4:  { kind: 'star',   delta: +1, icon: '⭐' },
  7:  { kind: 'star',   delta: +1, icon: '⭐' },
  12: { kind: 'star',   delta: +1, icon: '⭐' },
  15: { kind: 'star',   delta: +1, icon: '⭐' },
  6:  { kind: 'rocket', delta: +2, icon: '🚀' },
  13: { kind: 'rocket', delta: +2, icon: '🚀' },
  9:  { kind: 'trap',   delta: -2, icon: '💥' },
  16: { kind: 'trap',   delta: -2, icon: '💥' },
}
