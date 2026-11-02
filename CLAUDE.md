# CLAUDE.md — working conventions for PARTY BLITZ

Hackathon project (Claude SG × Supabase, 2026-11-02). Several AI agents work on this repo
**at the same time, independently**. These rules exist to keep them from stepping on each other.

Design context lives in `DESIGN.md` (spec), `README.md` (decisions), `BUILD_PROMPT.md` (build order),
`app/SUPABASE.md` (live project, RPC list, how to apply schema changes). Read the relevant section
before touching a feature; do not restate those docs here.

## 1. Multiple agents, no conflicts

- **Prefer work that is independent of what others are doing.** Pick a task that lives in its own
  file or folder. If a task would require editing a file another agent is likely mid-way through,
  choose a different task or do the independent part first.
- **Ownership map** (edit freely inside your area, be careful outside it):

  | Area | Path | Notes |
  |---|---|---|
  | Phone client | `app/src/phone/` | One file per mini-game (`Mash.tsx`, `Stop.tsx`, …) and `games/*` |
  | Big screen / host | `app/src/host/` | Phase machine, stage views, bots, host panel |
  | Shared layer | `app/src/shared/` | `types.ts`, `scoring.ts`, `time.ts`, `board.ts`, `schedule.ts`, `supabase.ts` |
  | Database / RPC | `app/supabase/migrations/001_init.sql` | Also applied by hand in the SQL Editor, see `app/SUPABASE.md` |
  | Scripts | `app/scripts/` | smoke test, load test |

- **Shared files are additive-only.** When you must change `app/src/shared/*` or the migration:
  add new exports / new functions / new columns; do not rename, reorder, or reformat existing
  code. Keep the diff to the lines you actually need.
- **New feature → new file.** Add a new component or module and wire it in with a one-line import
  rather than growing an existing file that someone else may be editing.
- **Never reformat, rename, or move files you are not working on.** No repo-wide lint fixes,
  no "tidy up" commits, no changing `index.css` globals unless the task is about them.
- **Before you start:** `git pull --rebase` and `git status`. If the working tree already has
  uncommitted changes you did not make, leave them alone and work around them.
- **Before you commit:** `git pull --rebase` again, resolve conflicts locally, make sure
  `npm run build` and `npm test` (in `app/`) still pass, then commit and push.
- If a conflict is more than trivial, stop and tell the user rather than guessing at the
  other agent's intent.

## 2. Page language: English only

- All user-visible text is English: buttons, big-stage words, hints, random player names,
  host panel, error messages, toasts, `<title>`, and anything rendered on the big screen.
- Factions are **Lava / Ocean / Forest**. Mini-game call-outs are
  `MASH!`, `STOP IN THE MIDDLE!`, `PICK THE MINORITY!`, `THROW!`.
- Code identifiers, comments and commit messages are English too.
- Chinese is fine in the design docs (`DESIGN.md`, `README.md`) and in chat with the user,
  but it must not leak into the app.

## 3. One checkout, small commits, no worktrees

- Work directly in this checkout on branch `main`. **Do not create git worktrees** and do not
  use the Claude Code worktree tools (`EnterWorktree`); everyone shares the same folder.
- Do not create long-lived feature branches. If you need a branch at all, merge it back within
  the same session.
- **Commit after every small working step** (a component renders, a test passes, an RPC works),
  not at the end of a big chunk. Each commit should leave `npm run build` green.
- Commit messages: short imperative subject naming the area, e.g.
  `phone: Stop mini-game UI`, `host: lobby QR + player bubbles`, `shared: rps scoring + tests`,
  `db: minority_vote RPC`. End with the attribution line the session provides.
- Push after each commit so other agents can rebase onto it.
- Deploy only when asked (`npm run deploy` in `app/` builds and pushes `dist/` to Vercel prod).

## Commands (run from `app/`)

```bash
npm run dev        # local dev server
npm run build      # tsc -b && vite build — must pass before every commit
npm test           # vitest (scoring tests etc.)
npm run lint       # oxlint
npm run smoke      # end-to-end check against the live Supabase project
npm run deploy     # build + vercel deploy dist --prod
```

## Hard constraints from DESIGN.md (do not undo these)

- Single entry: `?screen=1` renders the big screen, otherwise the phone. No router library.
- No Supabase Auth; player id is a uuid in `localStorage` (read/write wrapped in `try/catch`).
- Phone only calls RPCs and subscribes to `game:{id}` Broadcast. It never sends Broadcast and
  never subscribes to Postgres Changes.
- All countdowns use server time via `shared/time.ts`; the big screen's phase machine uses
  `requestAnimationFrame`, never a `setTimeout` chain, and must never stall on a failed RPC.
- The big screen is the only referee; scoring goes through the pure functions in
  `shared/scoring.ts` and every scoring change comes with a vitest case.
- Migration must stay re-runnable (`if not exists` / `create or replace`). RLS on, no policies;
  anon only reaches `security definer` RPCs.
- Player cap is 120; overflow players get spectator mode with no Realtime connection.
- Secrets never go into git. `app/.env` is ignored; only the publishable anon key is used.
