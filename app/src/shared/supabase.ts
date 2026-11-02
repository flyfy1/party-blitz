import { createClient } from '@supabase/supabase-js'
import { syncFrom } from './time'

export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

export interface RpcOptions {
  /** 失败后重试次数（默认 0） */
  retries?: number
  /** 重试间隔 ms */
  delay?: number
}

/**
 * 调用 RPC；返回里有 server_now 就顺便校准时钟。失败会按 retries 重试。
 * 记录最近一次耗时，主持人面板显示用。
 */
export async function rpc<T = unknown>(fn: string, args: Record<string, unknown>, opts: RpcOptions = {}): Promise<T> {
  const { retries = 0, delay = 150 } = opts
  let lastErr: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    const t0 = Date.now()
    const { data, error } = await supabase.rpc(fn, args)
    const t1 = Date.now()
    recordLatency(t1 - t0)
    if (!error) {
      const sn = (data as { server_now?: string } | null)?.server_now
      if (typeof sn === 'string') syncFrom(sn, t0, t1)
      return data as T
    }
    lastErr = error
    if (attempt < retries) await new Promise((r) => setTimeout(r, delay * (attempt + 1)))
  }
  throw lastErr instanceof Error ? lastErr : new Error(String((lastErr as { message?: string })?.message ?? lastErr))
}

// ── 延迟统计（主持人面板用）──
const samples: number[] = []
function recordLatency(ms: number) {
  samples.push(ms)
  if (samples.length > 50) samples.shift()
}
export function avgLatency() {
  return samples.length ? Math.round(samples.reduce((a, b) => a + b, 0) / samples.length) : 0
}

export const channelName = (gameId: string) => `game:${gameId}`
