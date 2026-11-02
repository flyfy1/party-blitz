// 三根透明管子 + 阵营色小球（Minority 和 Quiz 共用）。PLAY 阶段管子上只显示 ?，collecting 时显示数字。
import { FACTIONS } from '../../shared/factions'
import type { InputRow } from '../../shared/types'
import './stages.css'

const GLASS_W = 368 // 380 - 2×6 border
const GLASS_H = 528

/** 管子里第 k 颗球的位置（从底部往上一排排堆）；球多了自动缩小 */
function layout(n: number) {
  let d = 46
  let cols = Math.floor((GLASS_W - 12) / d)
  while (Math.ceil(n / cols) * d > GLASS_H - 40 && d > 18) {
    d -= 4
    cols = Math.floor((GLASS_W - 12) / d)
  }
  const pad = (GLASS_W - cols * d) / 2
  return { d, cols, pad }
}

export interface TubesProps {
  /** 按提交先后排序的输入；value 0/1/2 决定落进哪根管子 */
  rows: InputRow[]
  labels: { emoji: string; text: string }[]
  collecting: boolean
  /** collecting 时要发光的管子 */
  highlight: Set<number>
}

export function Tubes({ rows, labels, collecting, highlight }: TubesProps) {
  const sorted = [...rows].sort((a, b) => Date.parse(a.first_at) - Date.parse(b.first_at))
  const perTube: InputRow[][] = [[], [], []]
  for (const r of sorted) {
    const o = Math.round(r.value)
    if (o >= 0 && o <= 2) perTube[o].push(r)
  }
  return (
    <div className="mn-tubes">
      {perTube.map((balls, o) => {
        const { d, cols, pad } = layout(balls.length)
        const hot = highlight.has(o)
        const cls = 'mn-tube' + (collecting ? (hot ? ' rare' : ' dim') : '')
        return (
          <div key={o} className={cls}>
            <div className="mn-glass">
              {balls.map((r, k) => (
                <div
                  key={r.player_id}
                  className="mn-ball"
                  style={{ width: d - 4, height: d - 4, left: pad + (k % cols) * d + 2, bottom: 10 + Math.floor(k / cols) * d, background: FACTIONS[r.faction]?.color ?? '#fff' }}
                />
              ))}
              {collecting ? <div className="mn-count pop">{hot ? '👑 ' : ''}{balls.length}</div> : <div className="mn-count hidden-q">?</div>}
            </div>
            <div className="mn-label">
              <span className="em">{labels[o]?.emoji}</span>
              {labels[o]?.text}
            </div>
          </div>
        )
      })}
    </div>
  )
}
