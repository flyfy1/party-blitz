// 少数派题库（DESIGN.md §5）。host 在 start_round 时把一道题作为 rounds.options 传入，
// 手机从 round.options 里解析；解析失败就退化成第一题，界面永远不会空。
export interface MinorityQuestion {
  /** 题库下标（可选，便于大屏和手机对齐） */
  qi?: number
  q: string
  choices: [string, string, string]
  emoji: [string, string, string]
}

export const QUESTIONS: MinorityQuestion[] = [
  { q: 'Breakfast tomorrow?', choices: ['Kaya toast', 'Nasi lemak', 'Skip it'], emoji: ['🍞', '🍛', '☕'] },
  { q: 'Pick a superpower', choices: ['Fly', 'Invisible', 'Teleport'], emoji: ['🕊️', '👻', '⚡'] },
  { q: 'Best pet', choices: ['Cat', 'Dog', 'Dragon'], emoji: ['🐱', '🐶', '🐲'] },
  { q: 'Late-night snack', choices: ['Prata', 'Bubble tea', 'Instant noodles'], emoji: ['🥞', '🧋', '🍜'] },
  { q: 'Weekend plan', choices: ['Beach', 'Mall', 'Bed'], emoji: ['🏖️', '🛍️', '🛏️'] },
  { q: 'Pick a number', choices: ['7', '42', '99'], emoji: ['7️⃣', '🔢', '💯'] },
].map((q, qi) => ({ ...q, qi })) as MinorityQuestion[]

/** host 用：随机抽一道题，作为 start_round 的 p_options */
export function pickQuestion(exclude: number[] = []): MinorityQuestion {
  const pool = QUESTIONS.filter((q) => !exclude.includes(q.qi!))
  const list = pool.length ? pool : QUESTIONS
  return list[Math.floor(Math.random() * list.length)]
}

/** 手机用：从 round.options 解析题目；不合法就退化成第一题 */
export function parseMinorityOptions(o: unknown): MinorityQuestion {
  if (o && typeof o === 'object') {
    const v = o as Partial<MinorityQuestion>
    if (typeof v.q === 'string' && Array.isArray(v.choices) && v.choices.length === 3) {
      const emoji = Array.isArray(v.emoji) && v.emoji.length === 3 ? v.emoji : (['🅰️', '🅱️', '🅲'] as const)
      return { qi: v.qi, q: v.q, choices: v.choices as [string, string, string], emoji: [...emoji] as [string, string, string] }
    }
    if (typeof v.qi === 'number' && QUESTIONS[v.qi]) return QUESTIONS[v.qi]
  }
  return QUESTIONS[0]
}
