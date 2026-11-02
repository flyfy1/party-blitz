// 玩家身份：localStorage 里的 uuid（读写 try/catch，失败退化成内存变量）。
// 注意：云端 players 表的主键是 id（不是 (game_id, id)），所以 id 按每局存一份，
// 重置游戏后同一台手机也能进新的一局。
const mem = new Map<string, string>()

export function getPlayerId(gameId: string): string {
  const key = `pb:player:${gameId}`
  try {
    const v = localStorage.getItem(key)
    if (v) return v
  } catch {
    /* ignore */
  }
  if (mem.has(key)) return mem.get(key)!
  const id = crypto.randomUUID()
  mem.set(key, id)
  try {
    localStorage.setItem(key, id)
  } catch {
    /* ignore */
  }
  return id
}
