# Party Blitz

A party game for a lecture hall: up to **120 phones**, **one big screen**, **zero game servers**. Everyone scans a QR code and is split into **three factions** (Lava / Ocean / Forest). Each round is a **15-second mini-game**; the result moves three mascots along a board on the big screen. Phones send input through **Supabase Postgres RPC**; the big screen is the only referee and pushes two **Realtime Broadcast** messages per round. Built live with **Claude Code** at the Claude SG × Supabase hackathon, Singapore, 2 Nov 2026.

## Docs

| File | Content |
|---|---|
| [`README.zh.md`](README.zh.md) | Chinese original of this file: background, alternatives considered, key decisions, unverified assumptions, change log |
| [`DESIGN.md`](DESIGN.md) / [`DESIGN.en.md`](DESIGN.en.md) | Full design spec (v2): gameplay, scoring, data model, RPCs, Realtime events, visuals, tests, build phases |
| [`BUILD_PROMPT.md`](BUILD_PROMPT.md) / [`BUILD_PROMPT.en.md`](BUILD_PROMPT.en.md) | The prompt pasted into Claude Code at the start of the build |
| [`app/SUPABASE.md`](app/SUPABASE.md) / [`app/SUPABASE.en.md`](app/SUPABASE.en.md) | Live Supabase project: credentials layout, RPC list, how to apply schema changes, measured latency |
| [`CLAUDE.md`](CLAUDE.md) | Working conventions for the AI agents editing this repo in parallel |

The Chinese files are the source of truth where they differ from the English translations.

## Quick start

All commands run from `app/`:

```bash
npm run dev        # local dev server
npm run build      # tsc -b && vite build — must pass before every commit
npm test           # vitest (scoring tests etc.)
npm run lint       # oxlint
npm run smoke      # end-to-end check against the live Supabase project
npm run loadtest   # N simulated Realtime clients + RPC submissions, latency report
npm run deploy     # build + vercel deploy dist --prod
```

Two URLs, one entry point, no router library:

- Phone: `/?g=<game_id>`
- Big screen: `/?screen=1&g=<game_id>&key=<host_key>`

Environment (`app/.env`, git-ignored):

```
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable key>
```

Database: paste `app/supabase/migrations/001_init.sql` into the Supabase SQL Editor and run it. The migration is re-runnable (`create table if not exists` / `create or replace function`). If a call then fails with "Could not find the function ... in the schema cache", run `notify pgrst, 'reload schema'` and retry.

---

The rest of this file is an English translation of `README.zh.md`, which records **the discussion behind the design and the reasons for each decision**, so a reviewer can see why it was built this way.

## 1. Event background

- **Event**: Claude SG × Supabase "Build with Claude and Supabase" (https://luma.com/ClaudesgXsupabase)
- **When and where**: 2026-11-02 (Monday) 18:30 – about 20:30, Lifelong Learning Institute, Singapore, 2nd-floor lecture theatre
- **Format**: a Supabase introduction first, then **about 1 hour of live development**, with a light competition element
- **Scale**: 337 registered, the venue is a **large lecture theatre** with a big screen
- **Requirement**: build an app with Claude (Claude Code Pro or above) and Supabase
- **Prizes**: MacBook, iPad, AirPods Pro, Supabase swag
- **Not stated on the event page**: judging criteria, demo length, team rules. All to be confirmed on site

## 2. Goals

The user's own words: the demo needs a **wow effect**; ideally a **realtime game everyone plays together**; **competitive**; **easy to pick up**; **nobody gets bored**.

Requirements added in later discussion:
- Split into **three factions**; people are **assigned automatically** on joining
- Party-game feel: **everyone plays on their own phone, the big screen shows scores and effects live**
- Each round is only **15 seconds**; the pace has to be very fast
- **Game content is designed in advance, no AI in the game**; but **the visuals must be fun and attractive enough**
- Player cap set to **120**

---

## 3. Alternatives discussed and trade-offs

| # | Option | Verdict | Reason |
|---|---|---|---|
| 1 | **Whole-room tug of war + Claude commentary** (two teams mashing) | ❌ Dropped | In a team contest one person's influence is too small; after a few dozen seconds everyone feels their taps don't matter; also not "competitive" enough |
| 2 | **Whole-room mind games** (minority vote, guess 2/3 of the average, reaction speed, with Claude as host) | 🔄 Partly kept | Simple rules, low message rate. "Minority" survived as one mini-game |
| 3 | **Three-faction mind games** (adding faction rock-paper-scissors and a captain role) | 🔄 Partly kept | The three-faction design and faction RPS stayed; the captain role was dropped for lack of time |
| 4 | **Adapt the existing snake-arena** (`~/Documents/integ-life/snake-arena`, Go + WebSocket realtime snake) into three factions, with Supabase only aggregating across rooms | ❌ Dropped | See below |
| 5 | **Three-faction party board**: phones as controllers, big screen as the stage, a 15-second mini-game each round whose result decides how many squares the pieces advance | ✅ **Final choice** | Best balance of competitiveness, low barrier to entry, visual effect and feasibility within 1 hour |

**Why snake-arena was dropped**
- That project has been in development for months (four modes, AI snakes, prediction and reconciliation). **Bringing it to a "1 hour live build" contest invites suspicion**; this is the fatal problem
- The red-vs-blue mode hard-codes two teams (`pickTeam`, `teamScores() (blue, red)`, colours, frontend scoreboard); going to three teams touches a lot of places
- Each room holds at most 20 players (`maxPlayers = 20`); covering the room means multiple rooms plus a separate Supabase aggregation layer
- Production runs on a Raspberry Pi at home; the whole room playing at once would be limited by upstream bandwidth and CPU (not measured), so the demo would need a separate cloud host
- Supabase would only be a supporting actor, and judges would struggle to see its role
- 15 Hz game-state sync **cannot be done over Supabase Realtime**, see section 4

**Why the AI (Claude as host) was removed**
- The user decided the content is designed in advance and the game does not call an AI
- Benefit: one fewer external dependency and latency source (Claude plus an Edge Function cold start is roughly 1–3 seconds, which would break the 15-second rhythm); no Edge Function to deploy and no API key to manage
- The event's "build with Claude" requirement is already satisfied by Claude Code

---

## 4. Supabase capabilities and limits (the facts that shaped the architecture)

**Latency** (source: supabase.com/docs/guides/realtime/benchmarks, measured inside the AWS network, excluding phone and venue WiFi overhead)

| Method | Median | p95 |
|---|---|---|
| Broadcast | 6ms | 28ms |
| Broadcast, 1KB payload | 13ms | 36ms |
| Broadcast triggered from the database | 46ms | 132ms |
| Postgres Changes (small instance) | not published | about 240ms, exceeds 1 second with many clients |

My estimate for on-site end-to-end latency is roughly 30–100ms; **this number has not been measured**.

**Quotas** (source: supabase.com/docs/guides/realtime/limits)

| | Free | Pro | Team |
|---|---|---|---|
| Concurrent connections | 200 | 500 | 10,000 |
| Messages per second | 100 | 500 | 2,500 |
| Presence messages per second | 20 | 50 | 1,000 |

**How messages are counted (verified 2026-11-02)**
- The docs (docs/guides/platform/manage-your-usage/realtime-messages) say verbatim: *"Each broadcast message counts as one message sent plus one message per subscribed client that receives it."* Example: one broadcast to 4 subscribers counts as 5. With 120 players one broadcast counts as **121 messages**
- The per-second limit's implementation (github.com/supabase/realtime, `events_per_second_rate` in `lib/realtime/tenants.ex`): the counter uses **5-second buckets, keeps 12 buckets, and averages over them**, i.e. it looks at a **60-second rolling average**, not an instantaneous value. So sending 121 messages in one instant is fine as long as the total stays under 6000 per minute
- Consequence of exceeding it (limits docs, verbatim): *"Connections will be disconnected if your project is generating too many messages per second."* supabase-js reconnects automatically, but that broadcast is lost
- This design's usage: 2 broadcasts per round, at most 4 rounds per minute → 8 × 121 ≈ 970 messages/minute ≈ 16 messages/second. 6× headroom

**Anonymous sign-in rate limit (verified 2026-11-02)**
- docs/guides/auth/rate-limits: anonymous sign-in *"Defaults to 30 requests per hour"*, counted per IP. With the whole room behind one egress IP the 31st person is blocked. So the decision not to use Auth is correct

**Conclusions**
- **The bottleneck is the 200 concurrent connections**, not message count, not latency
- High-frequency game sync is infeasible: 15 Hz × 120 receivers = 1800 messages/second, far above any tier
- **No Presence**: the Free tier allows only 20 per second; it would be throttled when many players join at once
- **No Postgres Changes**: too slow, and throughput is limited
- **No Edge Functions**: they have a runtime cap, each request may land on a different instance, so they cannot act as a game server; with the AI gone there is no other use for them
- Not self-hosting Supabase: too much operational cost, and the venue WiFi may have client isolation on

---

## 5. Key design decisions

| Decision | Reason |
|---|---|
| **Phone input goes through RPC (HTTP), not Realtime** | Does not consume the Realtime message quota; Postgres handles 120 players × 1 write per second without strain |
| **The big screen is the sole referee** (host) | No game server of our own; all timing, scoring and state transitions happen in one place, easy to understand and debug |
| **Big-screen RPCs carry a `host_key`** | There is no Auth, so otherwise anyone with the anon key could start the next round or change the score. A random string in the big-screen URL is enough |
| **Scoring in pure TypeScript functions** (`scoring.ts`) | Unit-testable directly; one person can hardly gather enough devices to test, so most logic must be testable without real players |
| **Realtime only for big screen → phone broadcasts, 2 per round** | Keeps message volume at 1/6 of the quota; no broadcast in the lobby, the big screen polls the player count |
| **All countdowns use the server timestamp** | A broadcast reaches each phone tens to hundreds of milliseconds apart; starting the timer "on receipt" makes the end times disagree. `join_game` returns `server_now` to compute the offset; the `round` broadcast carries `starts_at`/`ends_at` |
| **Phones poll `get_state` every 2s as a fallback** | Lock screen, backgrounding and WiFi jitter all drop broadcasts. 60 read-only RPCs per second is cheap and buys "at most 2 seconds behind" |
| **Big screen reads aggregates via RPC every 250ms** | Smooth enough for live animation, without touching the Realtime quota |
| **Player cap 120; overflow goes to spectator mode** | Below the Free tier's 200 connections; spectator mode opens no Realtime connection and only polls RPC, so people who missed a slot can still watch the score |
| **No Supabase Auth, including anonymous sign-in** | Anonymous sign-in is 30 per IP per hour (checked in the docs); the whole room shares one egress IP and would be blocked. Player identity is a uuid in localStorage instead |
| **Faction assignment via `nextval(seq) % 3`** | Atomic; the three factions differ by at most 1 |
| **Faction score is per-capita, denominator is all members** | Fair with uneven sizes or people joining and leaving mid-game, and the average cannot be gamed by "submitting less" |
| **Names are generated server-side, not typed, and no "reroll"** | Names appear on the big screen; a client-generated name could be forged to show profanity. Server generation is simplest and saves a button |
| **Mash submits every 1000ms, first submission randomly staggered** | The big screen aggregates and draws every 250ms; with 120 players staggered the picture stays continuous; half the RPC load of 500ms |
| **15 seconds per round (2 + 10 + 1.2 + 1.8), auto-advancing** | Fast pace, no dead air; the 1.2-second "collect" lets late submissions in (server grace of 1 second, big screen waits 0.2 seconds more for in-flight requests), then scores |
| **Board compares position only; special squares trigger only on landing, no chaining** | The audience sees at a glance "whoever is ahead wins"; fewest edge cases (v0's "star count tiebreak" removed) |
| **P0 builds a straight track first** | A winding track is pure visuals, moved to P2; a straight track is one flex row |
| **Mini-games use only low-frequency input** | Controls message volume; precise stop is judged locally on the phone, unaffected by network latency, so it is fairer |
| **No shake gesture** | iOS requires user permission for motion sensors; on-site success rate is hard to guarantee |
| **Bot mode goes through the real RPC path but does not subscribe to Realtime** | One person can test the whole flow, and it doubles as the fallback demo if WiFi fails; it uses no connections, so bots and real people can be tested together |
| **Deploy once by minute 5** | Phones can only reach a public address; the deploy pipeline must work early; deploy after every phase afterwards |
| **Single entry + query parameters to distinguish phone and big screen, build locally then push `dist/`** | No dependence on the host's SPA rewrite or environment variables; works on Vercel, gh-pages or a Pi; no router library |
| **`players` primary key is `(game_id, id)`** | The player uuid is stable across games; with `id` alone as the key, every phone that was ever tested would be locked out after a game reset |
| **`round_live` returns one row per player; the lobby uses `list_players`** | Lobby name bubbles, darts, minority balls and RPS vote bars all need per-player data; 120 rows 4 times per second is no strain, and the four mini-games share one path |
| **Phones poll `get_state` throughout, not only during play** | The lobby lasts 60–90 seconds; after lock screen the WebSocket drops silently and supabase-js takes tens of seconds to notice |
| **P0 must include the award ceremony** | Even P0 alone should have a beginning and an end; three mash rounds plus a minimal ceremony is a complete demo |
| **Build in phases, stop adding features at minute 40** | Two mini-games that run end to end beat five that get stuck |

---

## 6. Unverified assumptions and open items (reviewers, please focus here)

1. **Can the Free-tier Nano instance take about 180 RPCs per second** (mash 120/s + fallback polling 60/s)? Should be fine, but untested. Load test and watch p95; above 300ms change the mash interval to 2s
2. **On-site end-to-end latency** and **venue WiFi quality**
3. **Contest rules**: is writing the design doc in advance allowed (no code was written in advance)? Judging criteria, demo length, team or solo
4. **Venue hardware**: can a laptop drive the big screen, **can audio reach the house PA**
5. **Upgrade to Pro ($25/month)?** Pro has 500 connections, the cap could go to **300**, covering roughly everyone present; Pro's bundled Micro instance is also steadier than Nano. Cost: $25 and changing `max_players` to 300 then re-running the load test. **Currently designed for Free and 120 players**, by the user's decision
6. **Anti-cheat cap**: mash total capped at `30 × seconds + 10`; 30 per second is a guess at the two-thumb limit, not verified
7. **Rate-limit source is the main branch**: the deployed version may differ slightly, but the docs' description (disconnect on exceeding) matches the source
8. **Realtime public channel toggle**: the Dashboard has "Allow public access"; the default for new projects is unconfirmed. Check before the event, and send a test broadcast during P-1 to verify

Verified and removed from this list: Broadcast counts per receiver (yes), rate limit is a rolling average (yes), anonymous sign-in is rate-limited per IP (yes).

## 7. What reviewers should focus on

- Whether the "big screen as referee, phone input over RPC" architecture has an overlooked bottleneck at 120 players
- Whether the scoring rules in DESIGN.md §5 and the board rules in §4 have holes
- Whether finishing P0 within 1 hour is realistic; whether the P-1 / P0 / P1 / P2 split makes sense
- Any improvement that would noticeably lift the demo for very little time

---

## 8. Change log

**Round 1 (fact checking + architecture gaps)**
- Verified the Broadcast counting method and the rate-limit algorithm (§4); conclusion: the only bottleneck is connections, so the "drop to 90 players" contingency was removed
- Added the host-side RPCs the original design lacked (`create_game`, `start_round`, `round_inputs`, `set_game_state`) and `host_key` auth. In the original design the big screen had no write path, and anon cannot write tables directly
- Countdowns switched to server timestamps; grace period 500ms → 1s; RESULT split into "collect 1s + animation 2s"
- Added phone-side fallback polling, Wake Lock, re-sync on return to foreground; added spectator mode
- Names moved to server generation; mash submission 500ms → 1000ms with random stagger; anti-cheat changed to a time-based cap (the old "increment ≤ 15 per 500ms" would truncate a normal submission after one lost packet)
- Board: star counting removed, position only; special squares trigger only on landing; capped at 20 squares; P0 straight track
- Minority defined as counted across the whole room; RPS covers "faction with no votes"; the 1% tie tolerance in ranking given a precise definition
- Build phases gained P-1 (deploy once within 5 minutes); P0 shrunk to a vertical slice; lobby time 30s → 60–90s

**Round 2 (18 comments from an independent reviewer, all adopted)**
- Deployment: routing by query parameter, single entry, local build pushing `dist/`, no dependence on Vercel rewrites or environment variables
- Data: `players` primary key changed to `(game_id, id)`, `inputs` lost its foreign key to players; added `list_players`, `round_live` changed to per-player rows, `round_inputs` removed; defined the structure of `games.state` and the MVP points rule (3/2/1 per round)
- Names get a two-digit number; every payload carrying a name also carries `player_id`, and the phone checks by id whether it is itself
- P0 changed to "beginning and end": 3 mash rounds + straight board + minimal ceremony, animations moved to P1; `schedule.ts` spells out the rounds; host panel dropped the "pause" that cannot be built
- Ranking changed to competition ranking (1,1,3); a three-way tie moves everyone 1 square; special squares mixed odd and even so a faction moving 2 per round can land on them too
- Migration must be re-runnable; documented how to handle the schema cache error
- `host_key` moved from the address bar to `sessionStorage`; the big screen recovers from `games.state` after a refresh
- `submit_input` validates range by kind; minority became single-choice
- Phone: `pointerdown` counting, no rubber-band or long-press, 3 submission retries, polling throughout, channel rebuild on return to foreground, `localStorage` fallback
- Time offset includes half the RTT; the big screen also uses `time.ts`; phase machine on rAF; host RPC retries
- Sound effects cut to 3; RPS hides the vote bars for the last 3 seconds; the load-test script must release connections and runs before the real-device rehearsal

**Round 3 (consistency check)**
- Checked the three files for leftovers from old versions (`/screen` route, `round_inputs`, 500ms, star tiebreak, pause, name reroll); only historical mentions in the change log remain
- Unified the per-round time split (2 + 10 + 1.2 + 1.8) between README and DESIGN
- RPC signatures and the P0 list were left untouched, so a running Claude Code session can continue straight from the v2 docs
