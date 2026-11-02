> English translation of `BUILD_PROMPT.md`; the Chinese file is the source of truth if they differ.

# Prompt to paste into Claude Code right after the start (v2)

---

Read `DESIGN.md` in this directory, then implement "PARTY BLITZ three-faction party". There is only about 1 hour; work in the order below and **make sure each phase runs before moving on**; do not write everything and only run it at the end. Where the design doc is unclear, pick the simplest approach and keep going; do not stop to ask me.

**Stack**: Vite + React + TypeScript, `@supabase/supabase-js`, GSAP, canvas-confetti, qrcode, vitest. **No router library**: single entry; if `location.search` contains `screen=1` render the big screen, otherwise render the phone. Phone URL `/?g=<game_id>`, big-screen URL `/?screen=1&g=<game_id>&key=<host_key>`. The environment variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are already in `.env`; deployment is a local `npm run build` followed by pushing `dist/`.

**Constraints that must be followed** (details in DESIGN.md §0, §6, §7):
- **All UI text is English** (buttons, big words, hints, random names, host panel, error messages). Factions are Lava / Ocean / Forest; the big verb words are "MASH!" / "STOP IN THE MIDDLE!" / "PICK THE MINORITY!" / "THROW!"
- No Supabase Auth. The player id is a uuid in localStorage (reads and writes in `try/catch`)
- Names are generated randomly server-side in `join_game` (adjective + food + `#two digits`); the client sends no name
- The phone only calls RPCs and only subscribes to `game:{id}` Broadcast; **it never sends Broadcast and never subscribes to Postgres Changes**
- All countdowns use server time: `src/time.ts` computes the offset from the `server_now` returned by RPCs and half the RTT, shared by the big screen and phones; the `round` broadcast carries `starts_at`/`ends_at`
- The big screen's phase machine switches phases by comparing server time in `requestAnimationFrame`, not a `setTimeout` chain; host RPCs retry 2 times on failure, and if they still fail continue with the latest `round_live` data; **the phase machine must not stall**
- The big screen is the sole referee: it calls `create_game`/`list_players`/`start_round`/`round_live`/`set_game_state` (all with `host_key`), and scores with the pure functions in `src/scoring.ts`. On open, immediately move `key` from the address bar into `sessionStorage` via `history.replaceState`; when reopened with `g`, call `get_state` first and restore from `state.positions` if the status is playing
- The mash button counts on `pointerdown`, submits the cumulative value every 1000ms (first submission randomly staggered), and forces one submission at the end; every `submit_input` retries 3 times on failure
- The phone polls `get_state` throughout (lobby 3s, play 2s); on `visibilitychange` back to foreground, `get_state` and rebuild the channel
- Player cap 120 (`games.max_players`). Overflow players enter spectator mode and **open no Realtime connection**
- Only two broadcasts per round (`round` and `result`); none in the lobby. Every payload carrying a name also carries `player_id`
- All four tables have RLS enabled with no policies; anon can only execute `security definer` RPCs. The migration must be re-runnable (`if not exists` / `create or replace`). On `Could not find the function ... in the schema cache`, run `notify pgrst, 'reload schema'` and retry
- The big screen's "Start game" button is greyed out until the channel is `SUBSCRIBED`; send a test broadcast before starting

**P-1 (within 5 minutes)**
1. Scaffold, single entry with two placeholder components, `npm run build`, deploy once. Tell me the public URL; I will open `/` on my phone and `/?screen=1` on the laptop to confirm

**P0 (when done it is a complete demo)**
1. `supabase/migrations/001_init.sql`: tables (`players` primary key is `(game_id, id)`), sequence, RLS, all RPCs (player: `join_game`, `submit_input`, `get_state`; big screen: `create_game`, `list_players`, `start_round`, `round_live`, `set_game_state`), with `submit_input` validating range by `kind`. When written, tell me how to run it
2. `src/scoring.ts` and `scoring.test.ts`: mash scoring, competition ranking (1% tolerance, 1,1,3 style), board movement (special squares trigger only on landing and do not chain, cap at 20, three-way tie moves 1 each, final round doubles). Run `vitest` and confirm it passes
3. `src/schedule.ts = ['mash', 'mash', 'mash']`, last item is the final
4. Phone: join game → full-screen faction colour + name → waiting → on `round`, switch to the mash screen by server timestamps → on `result`, show own score and faction rank → on `final`, show the result
5. Big screen: without `g`, `create_game` and write the parameters into the address bar → lobby (QR code + new player name list + count, `list_players` every 1s) → 15-second phase machine (intro 2s / play 10s / collect 1.2s / result 1.8s) → mash sprint race screen (`round_live` every 250ms) → ranking bars + **straight** board position update → after three rounds a **minimal awards** screen (winner mascot enlarged + confetti + three MVP names), `set_game_state` with `status = finished`
6. Host panel (`H` key: start, skip phase, reset) and the `?bots=N`, `?fast=1` parameters. Bots go through the real `join_game`/`submit_input` but do not subscribe to Realtime

After P0, stop, tell me how to verify, then build + deploy.

**P1**: 🎯 Precise stop and dart rain; `schedule` changed to `['mash','stop','mash','stop','mash']`; name bubbles flying in, rolling numbers, parabolic hop for the pieces; `src/sfx.ts` with three sounds (tick, horn, victory; unlock the AudioContext on the first `pointerdown`/`keydown`); spectator mode; deploy again.

**P2**: 🤔 Minority, ✊ Faction RPS (with their scoring tests; RPS hides the vote bars for the last 3 seconds), winding track, details such as screen shake and sweat.

**Visual requirements**: follow DESIGN.md §8 strictly. Stage fixed at 1920×1080 and scaled proportionally; every important moment has "one big word + one particle effect"; elements bounce on appearing; the player's own name must appear on the big screen; the phone `body` disables zoom, rubber-band and long-press per §8.

---

## Spare: load test (run in a separate session after P0)

Write `scripts/load-test.ts`: in Node, open N (default 120) supabase-js clients. Each client first calls `join_game`, then subscribes to `game:{id}`; on receiving a `round` with `kind=mash`, starting at `starts_at`, call `submit_input` every 1000ms until `ends_at`. At the end print: number of successful connections, **delivery rate of each broadcast** (clients that received it ÷ N), broadcast arrival latency p50 and p95, RPC p50, p95 and error rate. Then join an extra 121st player and confirm it returns `{full: true}`. On exit call `removeAllChannels()` and `process.exit(0)`; leave no connections behind.
