> English translation of `DESIGN.md`; the Chinese file is the source of truth if they differ.

# PARTY BLITZ ⚡ Three-faction party: design (v2)

> The whole room scans a QR code and is split into three factions automatically. Each round is a 15-second mini-game; on the big screen three mascots race along a party board.
> Stack: Supabase (Postgres + RPC + Realtime Broadcast) + Vite/React/TS. No AI inside the game; built with Claude Code.

---

## 0. Hard constraints (everything is designed around these)

| Constraint | What we do |
|---|---|
| Only about 1 hour of development time | Build in phases P0 → P1 → P2, stop adding features at minute 40 and start rehearsing. **When P0 is done it must already be a demo with a beginning and an end** (lobby → 3 mash rounds → awards) |
| Supabase Free tier: **200 concurrent Realtime connections**; 100 messages per second, measured as a **60-second rolling average** (see §6) | The real bottleneck is connections. **Player cap 120** (`games.max_players`, adjustable), leaving 80 spare. Once full, people enter **spectator mode** (polls RPC only, no Realtime connection). Phone input goes over RPC; Realtime is only for low-frequency big screen → phone broadcasts |
| The whole room shares the venue WiFi behind one egress IP; Supabase anonymous sign-in allows only 30 per IP per hour (checked in the docs) | **No Supabase Auth**. Player identity is a uuid in `localStorage` (reads and writes wrapped in `try/catch`, falling back to an in-memory variable) |
| Names appear on the big screen | Names are **generated randomly server-side in `join_game`** (adjective + food + two-digit number); the client cannot send a name. No "reroll" button |
| Pace must be fast | Each round is a fixed 15 seconds and advances automatically. All timing uses **server timestamps**; big screen and phones share one `time.ts` |
| It is an international event | **All UI text is English** (buttons, big verb words, names, hints, host panel). The Chinese in this document is for developers only; e.g. the call-outs are implemented as "MASH!", "STOP IN THE MIDDLE!", "PICK THE MINORITY!", "THROW!"; faction names Lava / Ocean / Forest; random names use English adjective + food, e.g. "Brave Durian #37" |
| The frontend is pure static files and can be hosted anywhere (Vercel / gh-pages / Pi) | **Single entry, no router library, query parameters select the page**: `/?g=<game_id>` for phones, `/?screen=1&g=<game_id>&key=<host_key>` for the big screen. Local `npm run build` bakes `.env` into the bundle, then `dist/` is pushed; no dependence on the host's environment variables or rewrites |

---

## 1. Overall flow

```
Lobby (scan to join; allow 60–90 seconds)
  → Round 1 ⚡ Mash sprint
  → Round 2 🎯 Precise stop
  → Round 3 🤔 Minority
  → Round 4 ✊ Faction RPS
  → Round 5 ⚡ Mash sprint (final: squares advanced ×2)
  → Awards (winning faction + top 3 individual MVPs)
```
The round list lives in `src/schedule.ts`, one array, last item is the final:
- **P0**: `['mash', 'mash', 'mash']`
- **P1**: `['mash', 'stop', 'mash', 'stop', 'mash']`
- **P2**: the full version above

The game itself is 5 × 15s + 15s awards ≈ 1.5 minutes; with the lobby about 3 minutes.

---

## 2. Factions

| id | Name | Mascot | Main | Light | Dark |
|---|---|---|---|---|---|
| 0 | Lava | 🐲 | `#FF4D3D` | `#FFB199` | `#8A1A10` |
| 1 | Ocean | 🐙 | `#2F7BFF` | `#9CC3FF` | `#0F2E73` |
| 2 | Forest | 🦊 | `#22C55E` | `#A7F3C0` | `#0E5A2B` |

- Assignment: `faction = nextval('join_seq') % 3`; faction sizes differ by at most 1
- **Faction scores are always per-capita** (denominator is the faction's **total** membership, not the number of submissions), so uneven sizes are still fair and the score cannot be gamed by "submitting less"

---

## 3. Time split of each 15-second round

```
0s ── 2s ─────────────── 12s ─ 13.2s ─── 15s
│INTRO│        PLAY (10s)      │collect│ result anim │
```
- **INTRO (2s)**: big screen and phones both show one big verb word: "MASH!", "STOP IN THE MIDDLE!", "PICK THE MINORITY!", "THROW!"
- **PLAY (10s)**: play the game
- **Collect (1.2s)**: big screen shows "TIME'S UP!". The server still accepts submissions until `ends_at + 1s`; at server time `ends_at + 1.2s` the big screen reads all inputs, scores, and broadcasts `result`
- **Result animation (1.8s)**: faction ranking → pieces advance → this round's MVP. Does not overlap the next round; one round is exactly 15 seconds
- Dev mode `?fast=1`: shortened to 1s / 4s / 1.2s / 1s

**Time sync (server time is authoritative; big screen and phones share `time.ts`)**
1. `join_game`, `create_game` and `get_state` all return `server_now`. The client records `t0` before sending and `t1` on receipt, `offset = server_now - (t0 + t1) / 2`, then `now() = Date.now() + offset`
2. When the big screen calls `start_round`, the server writes `starts_at` (= now + intro) and `ends_at` (= starts_at + play) and returns them
3. The big screen broadcasts `round` carrying `starts_at` and `ends_at`. Whenever that broadcast arrives, phones switch phases and count down from those two timestamps
4. The big screen's phase machine **does not use a `setTimeout` chain**; every frame (`requestAnimationFrame`) it compares `now()` against `starts_at`/`ends_at` to switch phases, so it catches up automatically after tab throttling or a stall

---

## 4. Board

- One track of **20 squares**, starting from square 0. All three pieces may sit on the same square (shown side by side). **P0 builds a straight track first** (one row of squares, piece positions updated directly); parabolic hop animation in P1, winding track in P2
- Each round, pieces advance by faction rank: **1st 3 squares, 2nd 2 squares, 3rd 1 square**; ties take the higher amount (two tied for first both move 3, the third moves 1). **A three-way tie moves everyone 1 square**. The final round doubles the amounts
- Special squares **trigger only when a piece stops on them, and do not chain** (the square landed on after a trigger does not trigger again). Odd and even positions are mixed so that a faction moving a fixed 2 per round also hits them:
  - ⭐ Star squares: 4, 7, 12, 15, advance 1 more
  - 🚀 Boost squares: 6, 13, advance 2 more
  - 💥 Trap squares: 9, 16, go back 2
- Capped at square 20 (finish line, confetti); pieces never leave the track
- **Winner: the faction furthest along**; equal positions are joint champions. That is the entire rule, so the audience gets it at a glance

---

## 5. Mini-game specs

All input goes through `submit_input(round_id, player_id, value)` (see §7). The server validates the range of `value` according to `rounds.kind`.

### ⚡ Mash sprint `mash`
- **Phone**: a half-screen button counted on `pointerdown` (`click` on iOS registers only once when two thumbs tap at the same time); the tap count accumulates locally and is **submitted every 1000ms as a cumulative value** (first submission randomly staggered by 0–1000ms), with one forced submission when PLAY ends. The big screen aggregates every 250ms; with 120 players staggered the picture stays continuous
- **Server**: `value = greatest(old, new)`; repeated submissions are harmless (idempotent). Anti-cheat: `value` may not exceed `30 × elapsed seconds + 10`
- **Faction score**: total taps ÷ faction size
- **Individual MVP**: the 3 players with the most taps
- **Big screen**: three mascots race on a track; position = faction per-capita taps ÷ current maximum. Dust particles under their feet grow with speed. When the leader changes, **screen shake** and a flashing "OVERTAKE!"; confetti at the finish

### 🎯 Precise stop `stop`
- **Phone**: a pointer swings back and forth across a bar (speeding up over time). Each player taps once; the deviation `|pos - 0.5| * 2` is **computed locally** (0 is dead centre, 1 is the edge) and only that deviation is submitted. Failed submissions retry 3 times automatically (the RPC is idempotent)
- **Server**: `value` clamped to `[0, 1]`
- **Faction score**: `1 - per-capita deviation`; players who did not submit count as deviation 1
- **Individual MVP**: the 3 players with the smallest deviation
- **Big screen**: a big target; each submission fires a dart from off-screen onto the matching ring. Colour marks the faction; darts near the bullseye show the name. At the end the most accurate dart enlarges with its name

### 🤔 Minority `minority`
- **Question**: one three-option question drawn at random from a preset bank (6 is enough, one game uses 1), e.g. "Breakfast: kaya toast / nasi lemak / skip it"
- **Phone**: three big buttons, **one choice only**, buttons lock after choosing (one state fewer, and MVP cannot be gamed by switching)
- **Server**: `value` must be 0/1/2; an existing record is not overwritten
- **Judging**: find the option chosen by the fewest people **across the whole room** (not within each faction). Several options tied for fewest all count as correct; options nobody chose are excluded
- **Faction score**: faction members who chose correctly ÷ faction size
- **Individual MVP**: among those who chose correctly, the 3 earliest submissions
- **Big screen**: three transparent tubes; each answer becomes a faction-coloured ball dropping in and stacking. **No numbers shown during PLAY**; on reveal, the tube with the fewest bursts into confetti

### ✊ Faction RPS `rps`
- **Phone**: three buttons ✊ ✋ ✌️; vote for your faction's throw, votes can be changed
- **Server**: `value` must be 0/1/2
- **Faction throw** = the option with the most votes in the faction (ties resolved in the order ✊ → ✋ → ✌️; a faction with no votes also throws ✊)
- **Faction score** = number of factions beaten (0–2). All three throwing the same, or all three different, is a full draw
- **Individual MVP**: 3 players from the winning faction by earliest vote
- **Big screen**: for the first 7 seconds of PLAY, live vote bars for the three factions, **hidden for the last 3 seconds** (otherwise the last second is all counter-picking). In RESULT three giant fists slam in from three directions and the winner's fist flattens the losers

### 🧠 Quiz `quiz`
- **Question**: each round draws one three-choice trivia question with a correct answer from the bank in `shared/quiz.ts`; it is sent in `rounds.options`
- **Phone**: big "QUIZ!", the question and three big buttons. **One tap only**, then the buttons lock
- **Server**: `value` must be 0/1/2; an existing record is not overwritten
- **Faction score**: faction members who answered correctly ÷ faction size (no answer counts as wrong)
- **Individual MVP**: among correct answers, the 3 earliest submissions
- **Big screen**: the same three transparent tubes as Minority, with faction-coloured balls dropping in; on reveal the correct tube lights up and bursts into confetti

### ⏱️ Hold for 5 seconds `hold`
- **Phone**: big "HOLD FOR 5 SECONDS!". Press and hold the button, release to stop; **no timer is shown**. The deviation `value = min(1, |held − 5000 ms| ÷ 5000)` is computed locally and only that is submitted; never releasing counts as 1
- **Server**: `value` clamped to `[0, 1]`, overwrite
- **Faction score**: `1 − per-capita deviation`; players who did not submit count as deviation 1
- **Individual MVP**: the 3 players with the smallest deviation
- **Big screen**: score bars for the three factions, plus the name and actual hold time of the player closest to 5 seconds

### 🟢 Tap on green `react`
- **Go time**: the big screen puts `go_at = starts_at + random 3–7 s` in `options`; phones and screen line up on server time
- **Phone**: a red "WAIT" until `go_at`, then a green "TAP ON GREEN!". Reaction time `value = tap time − go_at` is computed locally and clamped to `[0, 2000]` ms; **tapping before green is a false start** and records 2000
- **Server**: `value` clamped to `[0, 2000]`; an existing record is not overwritten
- **Faction score**: `1 − per-capita reaction time ÷ 2000`; players who never tap count as 2000
- **Individual MVP**: the 3 fastest reactions
- **Big screen**: the whole screen flashes green at `go_at` and the three mascots lunge forward; the 3 fastest players and their times are shown

### Ranking rule (shared by all mini-games)
Sort by faction score descending using **competition ranking**: if the gap between the i-th and the (i-1)-th is `<= 0.01 × the former`, it shares that rank, otherwise rank = i (rank sequences are 1,1,3 or 1,2,2 or 1,1,1). RPS has integer scores, so only equality ties. A faction with no members scores 0.

### Schedule presets
The host picks one schedule; the last round is always the final (board moves ×2):
- **Classic 5**: 5 rounds, the default
- **All games (8)**: `mash` → `stop` → `quiz` → `react` → `minority` → `hold` → `rps` → `mash` (final)
- **Random 6**: 6 rounds drawn at random

---

## 6. Architecture

```
           ┌──────────── Phone (player) ──────────────┐
           │ join_game RPC (once; gets name and server_now) │
           │ submit_input RPC (low frequency)  ──HTTP──┐   │
           │ get_state RPC (poll: lobby 3s / play 2s)  │   │
           │ subscribe channel game:{id} (receive only)│   │
           └──────────────▲────────────────────────────┼───┘
                          │ Broadcast: 2 per round
┌─────────────────────────┴───────────┐     ┌──────▼──────────────┐
│ Big screen (sole referee, host, host_key) │     │ Supabase Postgres    │
│ · drives phase timer (rAF + server time)  │◀───▶│ games / players /    │
│ · start_round / set_game_state RPC        │ RPC │ rounds / inputs      │
│ · lobby: list_players every 1s            │     └─────────────────────┘
│ · play: round_live every 250ms            │
│ · after collect, one more round_live,     │
│   pure-function scoring, write games.state│
│ · ?bots=N simulated players               │
└───────────────────────────────────────────┘
```

**Realtime quota (docs and source checked, see README §4)**
- Connections: at most 120 phones + 1 big screen = 121, under the Free tier's 200. **This is the only real hard limit**
- Message counting: one broadcast = 1 sent + 1 received per subscriber. With 120 players one broadcast counts as **121**
- The 100-per-second limit is a **60-second rolling average**, i.e. a budget of 6000 per minute. This design broadcasts 2 per round, at most 4 rounds per minute → 8 × 121 ≈ **970 per minute**, 6× headroom
- Exceeding it disconnects the connection (supabase-js reconnects automatically). So **do not** add a once-per-second progress broadcast; no broadcasts in the lobby either
- Phones never subscribe to Postgres Changes and never send Broadcast
- The channel is public. Before the event, confirm **Allow public access** is on in Dashboard → Realtime settings. The big screen must wait for channel status `SUBSCRIBED` before enabling "Start game", and first send a test broadcast to confirm phones receive it

**RPC load estimate (120 players)**
- Mash: 120 players × 1 per second = 120 requests/second for 10 seconds. Each is a one-row upsert
- Fallback polling: 120 players × 1 per 2 seconds = 60 requests/second, read-only, one row
- Big screen: 4 `round_live` per second (returns up to 120 rows)
- The Free tier is a Nano instance (shared CPU); this volume should be fine but is **not measured**. The load test (§12) must watch RPC p95; above 300ms change the mash submission interval to 2000ms

**Phone robustness**
- **Poll `get_state` in every state**: every 3s in the lobby, every 2s during play. Lock screen, app switching and WiFi roaming all drop the WebSocket silently, and supabase-js takes tens of seconds of heartbeat timeout to notice
- On return to foreground (`visibilitychange`): `get_state` immediately, and `unsubscribe()` then `subscribe()` to force-rebuild the channel
- Request Screen Wake Lock (`navigator.wakeLock`), ignore failure (WeChat and Telegram in-app browsers do not support it)
- Every failed `submit_input` retries 3 times
- Spectator mode (after the cap): no Realtime connection, poll `get_state` every 3s, show the three factions' live positions and "Cheer for 🐲!"

**Big-screen robustness**
- Every host RPC retries 2 times on failure; if the collect read still fails, score with the most recent `round_live` data and continue; **the phase machine must never stall**
- On open, `history.replaceState` removes `key` from the address bar and stores it in `sessionStorage` (the address bar is visible on the projector). Press F11 for full screen during the demo
- Reopened with parameters (refresh or crash): `get_state` first; if `status = playing`, restore from `state.positions` and `round_idx` and stop at "waiting for host to start the next round"; do not reset
- Laptop: extend the desktop to the projector rather than mirroring, run `caffeinate -d` in a terminal, keep the big-screen tab in the foreground

---

## 7. Data model and RPCs

```sql
-- 迁移必须可以反复执行：create table if not exists / create or replace function / drop ... if exists
create sequence if not exists join_seq;

create table if not exists games (
  id          uuid primary key default gen_random_uuid(),
  host_key    text not null,                   -- 随机串，大屏 URL 里带 ?key=，host RPC 都要校验
  status      text not null default 'lobby',   -- lobby | playing | finished
  max_players int  not null default 120,
  round_idx   int  not null default -1,
  state       jsonb not null default '{}'::jsonb, -- 见下方 state 结构
  created_at  timestamptz default now()
);

create table if not exists players (
  game_id   uuid references games(id),
  id        uuid,                              -- 客户端生成，存在 localStorage，跨局不变
  nickname  text not null,                     -- 服务端生成
  faction   smallint not null check (faction between 0 and 2),
  joined_at timestamptz default now(),
  primary key (game_id, id)                    -- 同一台手机可以参加多局（重置游戏后还能进）
);

create table if not exists rounds (
  id        uuid primary key default gen_random_uuid(),
  game_id   uuid references games(id),
  idx       int not null,
  kind      text not null,                     -- mash | stop | minority | rps | quiz | hold | react
  options   jsonb,                             -- 少数派题目等
  starts_at timestamptz not null,              -- PLAY 开始（服务端时间）
  ends_at   timestamptz not null,              -- PLAY 结束
  unique (game_id, idx)
);

create table if not exists inputs (
  round_id   uuid references rounds(id),
  player_id  uuid not null,                    -- 不建外键，省事
  faction    smallint not null,
  value      double precision not null,
  first_at   timestamptz default now(),
  updated_at timestamptz default now(),
  primary key (round_id, player_id)
);

-- 四张表全部 enable row level security，不建任何 policy：anon 不能直接读写
-- 所有 RPC 都是 security definer，grant execute to anon
-- 改完函数如果报 "Could not find the function ... in the schema cache"，执行 notify pgrst, 'reload schema' 再重试
```

Notes on the SQL comments above (left as in the source): the migration must be re-runnable (`create table if not exists` / `create or replace function` / `drop ... if exists`); `host_key` is a random string carried as `?key=` in the big-screen URL and checked by every host RPC; `players.id` is generated by the client, stored in `localStorage`, and stable across games; `nickname` is server-generated; the `(game_id, id)` primary key lets the same phone join several games (including after a reset); `rounds.options` holds e.g. the minority question; `starts_at`/`ends_at` are PLAY start and end in server time; `inputs.player_id` deliberately has no foreign key; all four tables have row level security enabled with no policies, so anon cannot read or write directly; every RPC is `security definer` with execute granted to anon; if a changed function reports "Could not find the function ... in the schema cache", run `notify pgrst, 'reload schema'` and retry.

**Structure of `games.state`** (written by the host, read by phones on fallback polling)
```ts
{
  positions: [number, number, number],          // 三个棋子的格子
  round_idx: number,
  last_result: ResultPayload | null,             // 和 result 广播一模一样
  mvp_points: { [player_id: string]: { nick: string, faction: number, points: number, last_round: number } },
  // 每轮 MVP 前三得 3 / 2 / 1 分；颁奖的 mvp_top3 按总分，同分按 last_round 小的在前
}
```
(`positions` is the square of each of the three pieces; `last_result` is identical to the `result` broadcast; the top 3 MVPs of each round earn 3 / 2 / 1 points, and the awards' `mvp_top3` is by total points, ties broken by the smaller `last_round` first.)

**Player RPCs**
- `join_game(p_game uuid, p_player uuid) → {faction, nickname, server_now} | {full: true, server_now}`
  - If `(p_game, p_player)` already exists, return the original faction and name (refreshing or re-scanning does not change faction and does not take a new slot)
  - When the count has reached `max_players`, return `{full: true}`. Use `pg_advisory_xact_lock(hashtext(p_game::text))` so concurrent joins cannot exceed the cap
  - Otherwise `n = nextval('join_seq')`, `faction = n % 3`, name = random adjective + random food + `' #' || (n % 100)` (two arrays of about 20 each, written in the SQL)
  - Bots join through this RPC too and take slots, so **reset the game** (insert a new `games` row) before the real demo
- `submit_input(p_round uuid, p_player uuid, p_value float8) → void`
  - Rejected when `now() > ends_at + 1s` or `now() < starts_at`
  - Validated by `kind`: `mash` non-negative and `≤ 30 × extract(epoch from now() - starts_at) + 10`, keep `greatest(old, new)`; `stop` clamped to `[0,1]`, overwrite; `minority` must be 0/1/2, existing record not overwritten; `rps` must be 0/1/2, overwrite; `quiz` must be 0/1/2, existing record not overwritten; `hold` clamped to `[0,1]`, overwrite; `react` clamped to `[0,2000]`, existing record not overwritten. All keep the earliest `first_at`
- `get_state(p_game uuid) → {status, round_idx, round: {id, kind, options, starts_at, ends_at} | null, counts: [n0, n1, n2], state, server_now}`

**Big-screen RPCs (all take `p_key`; error if it does not match `games.host_key`)**
- `create_game(p_key text) → {game_id, server_now}`: creates a game (the host panel's "Reset game" is this too)
- `list_players(p_game, p_key, p_after timestamptz) → [{id, nickname, faction, joined_at}]`: called every 1s in the lobby, returns only new players with `joined_at > p_after`, used for name bubbles
- `start_round(p_game, p_key, p_idx, p_kind, p_options, p_intro_ms, p_play_ms) → {round_id, starts_at, ends_at}`: inserts a `rounds` row, sets `games.status` to playing and `round_idx` to p_idx
- `round_live(p_round, p_key) → [{player_id, nickname, faction, value, first_at}]`: called every 250ms during play (live animation), and once more after collect as the final data handed to `scoring.ts`. Aggregation happens in the frontend; the four mini-games share this one path
- `set_game_state(p_game, p_key, p_status, p_state jsonb) → void`: writes back `games.state`; at awards sets status to finished

Scoring is **done on the big screen in pure TypeScript functions** (`src/scoring.ts`, with unit tests), and the result is written back to `games.state`.

**Events on Realtime channel `game:{id}`** (only the big screen sends; every place carrying a name also carries `player_id`, and phones check by id whether it is themselves)
```ts
{ type: 'round',  round_idx, round_id, kind, options?, starts_at, ends_at }
{ type: 'result', round_idx, kind, ranks: [r0, r1, r2], scores: [s0, s1, s2], moves: [m0, m1, m2],
                  positions: [p0, p1, p2], mvp: [{player_id, nick, faction, value}],
                  extra?: MinorityTally | RpsHands }   // 由 shared/extras.ts 的纯函数算出，只有 minority / rps 有
{ type: 'final',  winner: number | number[], positions, mvp_top3: [{player_id, nick, faction, points}] }
// 大厅阶段不广播
// 颁奖时 host 同时把 final payload 写进 games.state.last_final，漏掉广播的手机轮询时能拿到
// minority 轮的 start_round p_options = shared/questions.ts 的 pickQuestion()
```
(`extra` is computed by pure functions in `shared/extras.ts` and present only for minority / rps. No broadcasts in the lobby. At awards the host also writes the final payload into `games.state.last_final`, so phones that missed the broadcast pick it up when polling. For a minority round, `start_round`'s `p_options` is `pickQuestion()` from `shared/questions.ts`.)

The channel is public; anyone with the anon key can send into it. This risk is accepted (no score can be faked; scoring only reads the database).

---

## 8. Visual design (big screen)

**Style**: bright, flat, thick outlines, rounded corners, exaggerated like a party game, every element bounces.
- Stage fixed at **1920×1080**, scaled proportionally to fit any screen. Deep purple background `#1B1033` with slowly drifting coloured light blobs
- Fonts (Google Fonts): **ZCOOL KuaiLe** for Chinese, **Baloo 2** for numbers and English
- Animation: **GSAP** (bounce, hop, screen shake; all plugins free since 3.13) + **canvas-confetti** + Canvas 2D particles (dust, darts, balls)
- Sound: **synthesised live with the Web Audio API**, only **3**: countdown tick, start horn, victory. Unlock the AudioContext on any `pointerdown`/`keydown` on the page (browsers require a user gesture before sound; it must be re-unlockable after a big-screen refresh)

**Effects every screen must have (check each screen against this list)**
- [ ] Elements appear by scaling to 1.2× then bouncing back to 1 (`back.out`)
- [ ] Every important moment has "one big word + one particle effect" (sound only at the 3 places above)
- [ ] Screen shake for 300ms when the leader changes or someone hits a trap
- [ ] **The player's own name** must appear on the big screen: on joining the lobby, on darts, as round MVP
- [ ] Mascots are always moving: bobbing up and down when idle, bigger when leading, sweating 💦 when behind
- [ ] Numbers roll to new values instead of jumping

**Screens**
1. **Lobby**: on the left a huge QR code (more than half the screen height) and a **short URL** (the host reads it out); on the right three mascots on a stage, new players' names fly into their faction like bubbles (P0 can be a plain name list); the top shows "87 / 120". Near capacity show "Last N slots!"; when full, stamp "FULL" over the QR code and hint "Didn't get in? Open the same URL to watch"
2. **INTRO**: full-screen diagonal stripes in the faction colours sweep across, the game icon and the big verb word in the middle, with a 3-2-1 scaling effect
3. **Mini-game screens**: see §5
4. **RESULT and board**: the board takes the lower 2/3 of the screen; the three mascots hop square by square along a parabola, with a squash-and-bounce on each landing (P0 updates positions directly); the top shows the ranking bars and the round MVP card
5. **Awards**: the winning faction's mascot enlarges to the centre of the screen with confetti falling continuously; below, a podium for the top 3 individual MVPs. **P0 builds the minimal version**: winner mascot enlarged + confetti + three names

**Phone**
- The whole background is the faction colour; the top shows "You are 🐲 Lava · Brave Durian #37"
- States: waiting → INTRO (big verb word) → game controls → personal feedback for the round: your own score (available locally) and your faction's rank this round (from `result`); if your `player_id` is in the top 3 MVPs, the whole screen flashes gold "TOP 3 🏆"
- When full: spectator mode, showing "Slots full 🙈 Watch the big screen and cheer for your friends!" and the three factions' live positions
- Buttons fill half the screen with a ripple on tap. Android vibrates via `navigator.vibrate`
- `body { position: fixed; overflow: hidden; overscroll-behavior: none; touch-action: manipulation; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none }`, disabling double-tap zoom, rubber-band scrolling and the long-press magnifier

---

## 9. Host panel and bot mode

Big-screen URL: `/?screen=1&g=<game_id>&key=<host_key>`. On first open without `g`, generate a random `host_key`, call `create_game` to create a game and write the parameters into the address bar; then immediately move `key` from the address bar into `sessionStorage`.

A translucent panel in the bottom-right corner, toggled with the `H` key:
- Buttons: **Start game** (greyed out until the channel is `SUBSCRIBED`), **Skip current phase**, **Reset game** (creates a new game, new QR code). No "Pause": `ends_at` is already written to the database, pause cannot be built
- Shows: players online, channel status, average RPC time, most recent error
- URL parameters:
  - `?bots=60`: spawns 60 bots inside the big-screen browser that **call the real `join_game` and `submit_input`**. Each bot has a random reaction time and skill level. Bots do not subscribe to Realtime (the big screen notifies them directly), so they use no connections
  - `?fast=1`: short dev-mode timings (a few constants, included from P0)
- **Bot mode doubles as the on-site fallback**: if the WiFi fails, switch to bot mode and continue the demo

---

## 10. Project structure

```
index.html         单入口；?screen=1 渲染大屏，否则渲染手机端
src/
  supabase.ts      客户端
  time.ts          服务端时间偏移（offset，含 RTT/2）和 now()
  schedule.ts      轮次数组
  scoring.ts       四个小游戏的计分函数 + 排名 + 棋盘移动（纯函数）
  scoring.test.ts  vitest 单元测试
  board.ts         棋盘格子定义
  questions.ts     少数派题库（6 道）
  host/            大屏：阶段机、各个画面、bot、主持人面板
  phone/           手机端：各个游戏的操作界面、观众模式
  sfx.ts           Web Audio 音效（3 个）
supabase/migrations/001_init.sql   可重复执行
scripts/load-test.ts   用 Node 模拟 N 个 Realtime 客户端加 RPC 提交，结束时 removeAllChannels() 并退出
```
(`index.html`: single entry, `?screen=1` renders the big screen, otherwise the phone. `supabase.ts`: client. `time.ts`: server time offset (including RTT/2) and `now()`. `schedule.ts`: round array. `scoring.ts`: scoring for the four mini-games + ranking + board movement, pure functions. `scoring.test.ts`: vitest unit tests. `board.ts`: board square definitions. `questions.ts`: minority question bank (6). `host/`: big screen: phase machine, screens, bots, host panel. `phone/`: phone: per-game controls, spectator mode. `sfx.ts`: Web Audio sound effects (3). `supabase/migrations/001_init.sql`: re-runnable. `scripts/load-test.ts`: Node simulation of N Realtime clients plus RPC submissions; calls `removeAllChannels()` and exits at the end.)

---

## 11. Build phases (times are minutes after the start)

| Phase | Content | Deadline |
|---|---|---|
| **P-1** | `npm create vite` scaffold, single entry switching two placeholder components on `?screen`, local `npm run build` and one deploy of `dist/`, **phone opening `/` and laptop opening `/?screen=1` both show a page**. Supabase project created, `.env` filled, Realtime public access on | **5 minutes** |
| **P0** one complete demo | Migration (re-runnable) and all RPCs; phone joins and shows faction and name; big-screen lobby (QR + name list + count); phase machine (rAF + server time) + `round`/`result` broadcasts + time sync + fallback polling; ⚡ Mash sprint (phone button + big-screen race); RESULT: ranking bars + **straight** board position update; **minimal awards**; `schedule = ['mash','mash','mash']`; `?bots=N`, `?fast=1`; tests in `scoring.ts` for mash + ranking + board | **30 minutes** |
| **P1** | 🎯 Precise stop + dart rain; `schedule` changed to 5 rounds; name bubbles flying in, rolling numbers, hop animation; 3 sound effects; spectator mode; deploy again, walk through on a real phone | **40 minutes, then stop adding features** |
| **P2** | 🤔 Minority; ✊ RPS (with tests); winding track; details such as screen shake and sweat | Only if time remains |
| Rehearsal | **First** run the load test (confirm the script exits and the Dashboard connection count returns to zero), **then** ask 3–5 people nearby to scan and play a full game; `?bots=100` to check big-screen frame rate; fix issues; final deploy, **reset the game** to replace the one with bots | **Last 15 minutes** |

Deploy at the end of every phase; do not wait until the end.

---

## 12. Test plan

1. **Unit tests** (`scoring.ts`): competition ranking (1,1,3 / 1,2,2 / all tied), a faction with no members, special squares do not chain, a faction moving a fixed 2 hits at least one special square, cap at 20, final round doubling, three-way tie moves 1 each; add once P2 exists: RPS all same or all different, minority with several options tied for fewest
2. **Multi-player flow**: open the big screen with `?bots=60&fast=1`, then 3 incognito windows plus your own phone as real players. **Reset the game** mid-way and confirm the same phone can join the new game
3. **Load test** (in a separate session after P0): `scripts/load-test.ts` opens **120** Realtime connections and calls the RPC at mash frequency. Record: connection success rate, **delivery rate of each broadcast**, broadcast arrival latency p50/p95, RPC p50/p95 and error rate. Then join a 121st player and confirm it returns `full`. The script must release all connections on exit
4. **Real environment**: walk through on your own phone over 4G and over the venue WiFi; lock the screen for 30 seconds then unlock, confirm it catches up automatically; refresh the big screen once, confirm the piece positions are not reset

---

## 13. Pre-event checklist

- [ ] Create the Supabase project, **region Singapore**. Free tier is enough (cap 120); for the whole room see the Pro option in README §6
- [ ] Dashboard → Realtime settings: **Allow public access** on
- [ ] Local `.env` has `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`
- [ ] Decide how to run the migration: `supabase link` (needs the database password) then `supabase db push`, or paste into the SQL editor. Either works, but pick in advance
- [ ] Deploy target logged in (Vercel / gh-pages / Pi); the shorter the URL the better
- [ ] Ask the AV crew: can the laptop connect to the projector, **can audio go to the house PA**
- [ ] The big-screen QR code is generated in the frontend and points at the deployed URL plus `?g=<game_id>`

## 14. Demo script (about 3.5 minutes)

1. **0:00**: one-sentence intro "The room is split into three factions, play a party game on your phone, 120 slots first come first served, you can watch even if you miss out", show the QR code and **read out the short URL**. Leave the lobby for **60–90 seconds** (scanning, page load, names flying in; the big screen is the show)
2. **1:30**: start. 15 seconds per round; you only need to hype the crowd, no rules to explain
3. **2:50**: awards, winning faction cheers
4. **3:10**: cut to an architecture slide: "120 people online at once, no game server of our own; Postgres RPC handles input and scoring, Realtime Broadcast handles sync; built with Claude Code in 1 hour"

## 15. Risks and contingencies

| Risk | Contingency |
|---|---|
| A broadcast is not delivered (phone locked, WiFi jitter) | Phones poll `get_state` throughout as a fallback, catching up within 2–3 seconds; rebuild the channel on return to foreground |
| Refreshing or re-scanning takes several slots | `join_game` keys on `(game_id, player_id)`; one phone takes one slot |
| Venue WiFi is very slow | Ask everyone to use 4G; failing that, demo in bot mode |
| RPC p95 above 300ms | Mash submission interval to 2000ms; fallback polling to 4s |
| Someone forges requests to inflate scores | Server validates range by kind; mash total is capped; names are server-generated; host RPCs require `host_key`, which is not left in the address bar |
| Big screen freezes or refreshes | Host RPC retries + continue with the latest data; restore from `games.state` after refresh |
| Big-screen browser stutters | Cap particle counts, merge darts beyond 300; check frame rate with `?bots=100` during rehearsal |
| People without a slot get bored | Spectator mode shows live scores; the host says "next game is yours" (run another game if time allows) |
