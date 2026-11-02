// 服务端时间同步（DESIGN.md §3）。大屏和手机共用。
let offset = 0
let synced = false

/** 用一次 RPC 的发送时刻 t0、收到时刻 t1 和返回的 server_now 校准 */
export function syncFrom(serverNow: string, t0: number, t1: number) {
  const s = Date.parse(serverNow)
  if (Number.isNaN(s)) return
  offset = s - (t0 + t1) / 2
  synced = true
}

/** 服务端当前时间（毫秒） */
export const now = () => Date.now() + offset
export const isSynced = () => synced
export const getOffset = () => offset
export const parseTs = (iso: string) => Date.parse(iso)
