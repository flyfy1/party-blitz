// UI language is English (user requirement).
export const FACTIONS = [
  { id: 0, name: 'Lava', emoji: '🐲', color: '#FF4D3D', light: '#FFB199', dark: '#8A1A10' },
  { id: 1, name: 'Ocean', emoji: '🐙', color: '#2F7BFF', light: '#9CC3FF', dark: '#0F2E73' },
  { id: 2, name: 'Forest', emoji: '🦊', color: '#22C55E', light: '#A7F3C0', dark: '#0E5A2B' },
] as const

export const KIND_META = {
  mash: { icon: '⚡', title: 'Tap Frenzy', verb: 'TAP!', hint: 'Tap as fast as you can' },
  stop: { icon: '🎯', title: 'Perfect Stop', verb: 'STOP IN THE MIDDLE!', hint: 'One tap. Stop the bar at the center' },
  minority: { icon: '🤔', title: 'Minority Wins', verb: 'PICK THE RARE ONE!', hint: 'Choose what fewest people choose' },
  rps: { icon: '✊', title: 'Faction RPS', verb: 'THROW!', hint: 'Vote your faction’s hand' },
} as const
