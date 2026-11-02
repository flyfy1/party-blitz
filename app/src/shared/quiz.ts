// 问答题库（P3 新小游戏 quiz）。host 在 start_round 时把一道题作为 rounds.options 传入，
// 手机从 round.options 里解析。answer 也在 options 里：手机只在揭晓页用它，计分在大屏。
export interface QuizQuestion {
  qi?: number
  q: string
  choices: [string, string, string]
  answer: 0 | 1 | 2
  supabase?: boolean
}

export const QUIZ: QuizQuestion[] = [
  { q: 'Which Supabase feature syncs the phones in this game?', choices: ['Broadcast', 'Presence', 'Postgres Changes'], answer: 0, supabase: true },
  { q: 'What database is under the hood of Supabase?', choices: ['MongoDB', 'Postgres', 'SQLite'], answer: 1, supabase: true },
  { q: 'Supabase row-level security is enforced by…', choices: ['the JS client', 'an Express proxy', 'Postgres itself'], answer: 2, supabase: true },
  { q: 'Which company makes Claude?', choices: ['Anthropic', 'OpenAI', 'Mistral'], answer: 0 },
  { q: 'Claude Code runs mainly in your…', choices: ['browser tab', 'terminal', 'spreadsheet'], answer: 1 },
  { q: "Singapore's national flower is…", choices: ['the lotus', 'the hibiscus', 'an orchid'], answer: 2 },
  { q: 'Which MRT line is green on the map?', choices: ['East-West', 'North-South', 'Circle'], answer: 0 },
  { q: 'Kaya is a jam made from…', choices: ['durian', 'coconut and egg', 'pandan only'], answer: 1 },
  { q: 'How many Realtime connections does the Supabase Free tier allow?', choices: ['50', '100', '200'], answer: 2, supabase: true },
  { q: 'What year did Singapore become independent?', choices: ['1965', '1959', '1971'], answer: 0 },
].map((q, qi) => ({ ...q, qi })) as QuizQuestion[]

/** host 用：随机抽一道没出过的题，作为 start_round 的 p_options */
export function pickQuiz(exclude: number[] = []): QuizQuestion {
  const pool = QUIZ.filter((q) => !exclude.includes(q.qi!))
  const list = pool.length ? pool : QUIZ
  return list[Math.floor(Math.random() * list.length)]
}

/** Host: the nth quiz round of a game (0-based) always asks a Supabase question.
 *  The seed (gameId) picks the starting point, so different nth never repeat within a game
 *  and a reloaded big screen picks the same question again. */
export function pickSupabaseQuiz(nth: number, seed = ''): QuizQuestion {
  const pool = QUIZ.filter((q) => q.supabase)
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return pool[(h + nth) % pool.length]
}

/** 手机/大屏用：从 round.options 解析；不合法就退化成第一题 */
export function parseQuizOptions(o: unknown): QuizQuestion {
  if (o && typeof o === 'object') {
    const v = o as Partial<QuizQuestion>
    if (typeof v.q === 'string' && Array.isArray(v.choices) && v.choices.length === 3 && typeof v.answer === 'number' && v.answer >= 0 && v.answer <= 2) {
      return { qi: v.qi, q: v.q, choices: v.choices as [string, string, string], answer: v.answer as 0 | 1 | 2, ...(v.supabase ? { supabase: true } : {}) }
    }
    if (typeof v.qi === 'number' && QUIZ[v.qi]) return QUIZ[v.qi]
  }
  return QUIZ[0]
}
