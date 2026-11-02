import { createClient } from '@supabase/supabase-js'
import { applyServerNow } from './time'

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string,
  { auth: { persistSession: false, autoRefreshToken: false } },
)

export const stats = { count: 0, totalMs: 0, lastError: '' as string, get avgMs() { return this.count ? Math.round(this.totalMs / this.count) : 0 } }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Call an RPC with retries. Applies server_now to the clock offset when the response has one.
 * Throws after the last attempt fails.
 */
export async function rpc<T = unknown>(fn: string, args: Record<string, unknown>, retries = 0): Promise<T> {
  let lastErr: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    const t0 = Date.now()
    try {
      const { data, error } = await supabase.rpc(fn, args)
      const t1 = Date.now()
      stats.count++
      stats.totalMs += t1 - t0
      if (error) throw new Error(`${fn}: ${error.message}`)
      if (data && typeof data === 'object' && 'server_now' in data) applyServerNow((data as { server_now?: string }).server_now, t0, t1)
      return data as T
    } catch (e) {
      lastErr = e
      stats.lastError = e instanceof Error ? e.message : String(e)
      if (attempt < retries) await sleep(150 * (attempt + 1))
    }
  }
  throw lastErr
}

/** Player id stored in localStorage (uuid). Falls back to a per-session id if storage is unavailable. */
let memId: string | null = null
export function getPlayerId(): string {
  if (memId) return memId
  try {
    const k = 'pb:player_id'
    let v = localStorage.getItem(k)
    if (!v) { v = crypto.randomUUID(); localStorage.setItem(k, v) }
    memId = v
  } catch {
    memId = crypto.randomUUID()
  }
  return memId
}
