// ?bots=N – simulated players running in the screen's browser. They call the real join_game /
// submit_input RPCs but never subscribe to Realtime (the host notifies them directly).
import { supabase } from '../shared/supabase'
import { now, parseTs } from '../shared/time'
import type { RoundPayload } from '../shared/types'

interface Bot { id: string; faction: number; nickname: string; cps: number; reaction: number; skill: number }

export class BotPool {
  bots: Bot[] = []
  joined = 0
  failed = 0
  submits = 0
  submitErrors = 0
  lastError = ''
  scheduled = 0
  private timers: number[] = []
  private stopped = false
  private gameId: string
  private n: number

  constructor(gameId: string, n: number) { this.gameId = gameId; this.n = n }

  async join() {
    const queue = Array.from({ length: this.n }, (_, i) => i)
    const worker = async () => {
      while (queue.length && !this.stopped) {
        queue.pop()
        const id = crypto.randomUUID()
        try {
          const { data, error } = await supabase.rpc('join_game', { p_game: this.gameId, p_player: id })
          if (error) throw error
          if (data?.full) { this.stopped = true; return }
          this.bots.push({
            id, faction: data.faction, nickname: data.nickname,
            cps: 3 + Math.random() * 9,            // taps per second
            reaction: 200 + Math.random() * 1300,  // ms after PLAY starts
            skill: Math.random(),
          })
          this.joined++
        } catch {
          this.failed++
        }
      }
    }
    await Promise.all(Array.from({ length: 8 }, worker))
  }

  /** Called by the host right after it broadcasts a round. */
  onRound(p: RoundPayload) {
    this.clear()
    const starts = parseTs(p.starts_at), ends = parseTs(p.ends_at)
    const at = (serverMs: number, fn: () => void) => {
      this.scheduled++
      this.timers.push(window.setTimeout(fn, Math.max(0, serverMs - now())))
    }
    for (const b of this.bots) {
      const submit = async (value: number) => {
        this.submits++
        try {
          const { error } = await supabase.rpc('submit_input', { p_round: p.round_id, p_player: b.id, p_value: value })
          if (error) { this.submitErrors++; this.lastError = error.message }
        } catch (e) { this.submitErrors++; this.lastError = String(e) }
      }
      if (p.kind === 'mash') {
        const tick = () => {
          const t = now()
          if (t > ends + 300) return
          const elapsed = Math.max(0, Math.min(t, ends) - starts) / 1000
          void submit(Math.floor(b.cps * elapsed * (0.9 + Math.random() * 0.2)))
          if (t < ends) this.timers.push(window.setTimeout(tick, 1000))
        }
        at(starts + b.reaction, tick)
        at(ends + 150, () => void submit(Math.floor(b.cps * (ends - starts) / 1000 * (0.9 + Math.random() * 0.2))))
      } else if (p.kind === 'stop') {
        at(starts + 800 + Math.random() * Math.max(500, ends - starts - 1500), () => void submit(Math.min(1, Math.abs(gauss()) * (0.15 + 0.6 * (1 - b.skill)))))
      } else {
        at(starts + 500 + Math.random() * Math.max(500, ends - starts - 1000), () => void submit(Math.floor(Math.random() * 3)))
      }
    }
  }

  clear() { for (const t of this.timers) clearTimeout(t); this.timers = [] }
  stop() { this.stopped = true; this.clear() }
}

const gauss = () => { let u = 0, v = 0; while (u === 0) u = Math.random(); while (v === 0) v = Math.random(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) }
