// Synthesized party music for the big screen (Web Audio only, no asset files).
// A tiny step sequencer with look-ahead scheduling. Each mode is a different track:
//   lobby  – bouncy house groove while people join
//   play   – fast, driving track during intro/play/collect
//   result – mid-tempo groove for results and the board
//   final  – major-key anthem with big chords for the awards
export type MusicMode = 'off' | 'lobby' | 'play' | 'result' | 'final'

let ctx: AudioContext | null = null
let master: GainNode | null = null
let comp: DynamicsCompressorNode | null = null
let noiseBuf: AudioBuffer | null = null
let mode: MusicMode = 'off'
let wanted: MusicMode = 'off'
let timer: number | null = null
let step = 0
let nextTime = 0
let muted = (() => { try { return localStorage.getItem('pb:music') === 'off' } catch { return false } })()

const VOLUME = 0.22

interface Track {
  bpm: number
  root: number            // MIDI note of the key
  chords: number[][]      // per bar, semitone offsets from root
  kick: string            // 16 steps, 'x' = hit
  snare: string
  hat: string
  bass: string            // 16 steps: digit = chord tone index, '.' = rest
  lead: string            // 16 steps: digit = chord tone index (+octave), '.' = rest
  leadWave: OscillatorType
  pad: boolean
}

const TRACKS: Record<Exclude<MusicMode, 'off'>, Track> = {
  lobby: {
    bpm: 118, root: 45, chords: [[0, 3, 7, 10], [5, 8, 12, 15], [3, 7, 10, 14], [7, 10, 14, 17]],
    kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...xx',
    bass: '0..0..1.0..0.2..', lead: '..2.1...3..2.1..', leadWave: 'triangle', pad: true,
  },
  play: {
    bpm: 142, root: 47, chords: [[0, 3, 7], [8, 12, 15], [5, 8, 12], [7, 11, 14]],
    kick: 'x...x...x...x..x', snare: '....x.......x.x.', hat: 'xxxxxxxxxxxxxxxx',
    bass: '0.00.00.0.00.010', lead: '0120120120121232', leadWave: 'square', pad: false,
  },
  result: {
    bpm: 124, root: 48, chords: [[0, 4, 7, 11], [9, 12, 16, 19], [5, 9, 12, 16], [7, 11, 14, 17]],
    kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...x.',
    bass: '0...0.1.0...2.1.', lead: '....2...1...3...', leadWave: 'triangle', pad: true,
  },
  final: {
    bpm: 128, root: 48, chords: [[0, 4, 7, 12], [7, 11, 14, 19], [9, 12, 16, 21], [5, 9, 12, 17]],
    kick: 'x...x...x...x...', snare: '....x.......x...', hat: 'x.x.x.x.x.x.x.xx',
    bass: '0.0.0.0.0.0.1.2.', lead: '2.3.2.1.2...3.4.', leadWave: 'sawtooth', pad: true,
  },
}

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12)

function ensure(): AudioContext | null {
  try {
    if (!ctx) {
      ctx = new AudioContext()
      comp = ctx.createDynamicsCompressor()
      comp.threshold.value = -18; comp.ratio.value = 4
      master = ctx.createGain()
      master.gain.value = muted ? 0 : VOLUME
      master.connect(comp).connect(ctx.destination)
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate)
      const d = noiseBuf.getChannelData(0)
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
    }
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch { return null }
}

function env(g: GainNode, t: number, peak: number, attack: number, decay: number) {
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(peak, t + attack)
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay)
}

function kick(t: number) {
  const c = ctx!, o = c.createOscillator(), g = c.createGain()
  o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12)
  env(g, t, 1.0, 0.003, 0.28)
  o.connect(g).connect(master!); o.start(t); o.stop(t + 0.32)
}

function noise(t: number, dur: number, peak: number, hp: number) {
  const c = ctx!, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain()
  s.buffer = noiseBuf; f.type = 'highpass'; f.frequency.value = hp
  env(g, t, peak, 0.002, dur)
  s.connect(f).connect(g).connect(master!); s.start(t); s.stop(t + dur + 0.02)
}

function tone(t: number, freq: number, dur: number, wave: OscillatorType, peak: number, cutoff = 4000) {
  const c = ctx!, o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain()
  o.type = wave; o.frequency.setValueAtTime(freq, t)
  f.type = 'lowpass'; f.frequency.setValueAtTime(cutoff, t); f.Q.value = 4
  env(g, t, peak, 0.01, dur)
  o.connect(f).connect(g).connect(master!); o.start(t); o.stop(t + dur + 0.05)
}

function scheduleStep(tr: Track, s: number, t: number, stepDur: number) {
  const i = s % 16
  const bar = Math.floor(s / 16) % tr.chords.length
  const chord = tr.chords[bar]
  if (tr.kick[i] === 'x') kick(t)
  if (tr.snare[i] === 'x') { noise(t, 0.16, 0.5, 1200); tone(t, 190, 0.08, 'triangle', 0.25) }
  if (tr.hat[i] === 'x') noise(t, i % 2 ? 0.03 : 0.05, i % 4 === 2 ? 0.22 : 0.12, 7000)
  const b = tr.bass[i]
  if (b !== '.') tone(t, hz(tr.root - 12 + chord[Number(b) % chord.length]), stepDur * 1.6, 'sawtooth', 0.35, 600)
  const l = tr.lead[i]
  if (l !== '.') {
    const n = Number(l)
    tone(t, hz(tr.root + 12 + chord[n % chord.length] + (n >= chord.length ? 12 : 0)), stepDur * 0.9, tr.leadWave, 0.12, 3200)
  }
  if (tr.pad && i === 0) for (const off of chord) tone(t, hz(tr.root + off), stepDur * 15, 'triangle', 0.05, 1800)
}

function tick() {
  if (!ctx || mode === 'off') return
  const tr = TRACKS[mode]
  const stepDur = 60 / tr.bpm / 4
  while (nextTime < ctx.currentTime + 0.12) {
    scheduleStep(tr, step, nextTime, stepDur)
    nextTime += stepDur
    step++
  }
}

function start(m: MusicMode) {
  if (timer !== null) { clearInterval(timer); timer = null }
  mode = m
  if (m === 'off' || !ctx || ctx.state !== 'running') return
  step = 0
  nextTime = ctx.currentTime + 0.05
  timer = window.setInterval(tick, 25)
}

/** Call from any user gesture. Starts the wanted track once audio is allowed. */
export function unlockMusic() {
  const c = ensure()
  if (!c) return
  const go = () => { if (mode !== wanted || timer === null) start(wanted) }
  if (c.state === 'running') go(); else void c.resume().then(go)
}

/** Switch track (no-op if it is already playing). Safe to call every render. */
export function setMusic(m: MusicMode) {
  if (m === wanted && (m === 'off' || timer !== null)) return
  wanted = m
  if (ctx && ctx.state === 'running') start(m)
}

export function isMusicMuted() { return muted }

export function toggleMusicMute(): boolean {
  muted = !muted
  try { localStorage.setItem('pb:music', muted ? 'off' : 'on') } catch { /* ignore */ }
  if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : VOLUME, ctx.currentTime, 0.05)
  if (!muted) unlockMusic()
  return muted
}
