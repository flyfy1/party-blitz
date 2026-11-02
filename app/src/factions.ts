export const FACTIONS = [
  { id: 0, name: 'Lava',   mascot: '🐲', color: '#FF4D3D', light: '#FFB199', dark: '#8A1A10' },
  { id: 1, name: 'Ocean',  mascot: '🐙', color: '#2F7BFF', light: '#9CC3FF', dark: '#0F2E73' },
  { id: 2, name: 'Forest', mascot: '🦊', color: '#22C55E', light: '#A7F3C0', dark: '#0E5A2B' },
] as const

export const KIND_LABEL: Record<string, { verb: string; icon: string; title: string }> = {
  mash:     { verb: 'MASH!',       icon: '⚡', title: 'Tap Sprint' },
  stop:     { verb: 'STOP MID!',   icon: '🎯', title: 'Precision Stop' },
  minority: { verb: 'PICK RARE!',  icon: '🤔', title: 'Minority Rules' },
  rps:      { verb: 'THROW!',      icon: '✊', title: 'Faction RPS' },
}
