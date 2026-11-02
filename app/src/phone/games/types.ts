// 手机端小游戏组件的统一 props。Phone.tsx 负责时间同步、RPC、广播；组件只管画面和交互。
import type { Faction, ResultPayload } from '../../shared/types'
import type { Phase } from '../../shared/timing'
import type { MinorityExtra, RpsExtra } from '../../shared/extras'

export interface GameProps<Extra = unknown> {
  phase: Phase
  faction: Faction
  /** 本轮 PLAY 的开始/结束（服务端毫秒时间戳） */
  startsAt: number
  endsAt: number
  /** 服务端时间（shared/time.ts 的 now） */
  now: () => number
  /** rounds.options（少数派题目） */
  options?: unknown
  /** 提交输入；重试等由父组件处理 */
  onSubmit: (value: number) => void | Promise<void>
  /** 收到 result 广播后传入 */
  result?: ResultPayload | null
  /** result 广播的揭晓细节（见 extras.ts） */
  extra?: Extra | null
  /** 自己是否在本轮 MVP 前三 */
  isMvp?: boolean
}

export type MinorityProps = GameProps<MinorityExtra>
export type RpsProps = GameProps<RpsExtra>
