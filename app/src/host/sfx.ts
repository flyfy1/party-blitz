// Web Audio synthesized sounds: tick (countdown), horn (PLAY start), win (awards).
let ctx: AudioContext | null = null

function ensure(): AudioContext | null {
  try {
    if (!ctx) ctx = new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

/** Call on first pointerdown / keydown (browsers require a gesture). */
export function unlockSfx() {
  ensure()
}

function tone(freq: number, dur: number, type: OscillatorType = 'square', gain = 0.12, delay = 0) {
  const c = ensure()
  if (!c || c.state !== 'running') return
  const t0 = c.currentTime + delay
  const osc = c.createOscillator()
  const g = c.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(g).connect(c.destination)
  osc.start(t0)
  osc.stop(t0 + dur + 0.05)
}

export const sfx = {
  tick() {
    tone(880, 0.09, 'square', 0.1)
  },
  horn() {
    tone(392, 0.18, 'sawtooth', 0.14)
    tone(523, 0.18, 'sawtooth', 0.14, 0.16)
    tone(659, 0.45, 'sawtooth', 0.16, 0.32)
  },
  win() {
    const notes = [523, 659, 784, 1047, 784, 1047, 1319]
    notes.forEach((n, i) => tone(n, 0.25, 'triangle', 0.16, i * 0.13))
    tone(1568, 0.8, 'triangle', 0.18, notes.length * 0.13)
  },
}
