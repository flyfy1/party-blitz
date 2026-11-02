# Party Blitz — hackathon submission

Copy the sections below into the submission form.

## Title

Party Blitz

## Pitch

Party Blitz turns the whole room into a three-faction party game: scan a QR code, get dropped into Lava, Ocean or Forest, and battle the other factions in 15-second mini-games on your phone while the big screen shows the race. There is no game server: up to 120 phones play live through Supabase RPCs and Realtime Broadcast, and the browser on stage is the referee.

## What it does

- Anyone in the room scans one QR code and is playing within seconds: no app, no login, no name to type. A random name and a faction are assigned server-side.
- Players are balanced across three factions, Lava, Ocean and Forest, and their pieces race along a 20-square party board.
- Each round is exactly 15 seconds: a 2 s intro, 10 s of play, then results. Seven mini-games: Tap Frenzy (mash), Perfect Stop (stop the bar at the centre), Minority Wins (pick what the fewest people pick), Faction RPS (vote your faction's throw), Quiz (three-choice trivia), Hold for 5 Seconds (count it in your head) and Tap on Green (pure reaction time). The host picks a schedule preset: Classic 5, All games (8) or Random 6, and the final round always counts double.
- Faction scores are per member, so a small faction can beat a big one. The big screen shows live races, results, board moves and an MVP podium.
- Up to 120 players; anyone beyond that becomes a spectator who can still watch and cheer. A host panel and a `?bots=N` mode keep the show running even if the Wi-Fi does not.

## How Supabase is used

- **Every input is a Postgres RPC.** Phones call `join_game`, `submit_input` and `get_state`; the big screen calls `create_game`, `list_players`, `start_round`, `round_live` and `set_game_state`. Inputs are validated per game type, and mash taps are capped by elapsed time.
- **RLS on, no policies, `security definer` functions only.** The anon key cannot read or write any table directly. Host functions also require a host key that never stays in the address bar.
- **An advisory lock enforces the 120-player cap.** `join_game` takes `pg_advisory_xact_lock` per game, so concurrent joins can never overfill a game, and a sequence balances the factions.
- **Realtime Broadcast sends just 2 messages per round.** The big screen broadcasts `round` at the start and `result` at the end. Phones only listen and never publish, and nothing uses Presence or Postgres Changes, which keeps a 120-player game well inside the Free-tier limits.
- **All clocks follow server time.** Every RPC returns `server_now`, and each client computes its offset to the server, correcting for half the round trip. Countdowns and phase changes run from `starts_at` and `ends_at` in the database, so a slow Wi-Fi hop never moves the finish line.

## Built with Claude Code

- **Design doc first.** A full design (`DESIGN.md`) and decision log (`README.md`) were written before the event; all code was written live with Claude Code.
- **Four parallel Claude Code sessions** worked in one checkout, coordinated by an ownership map in `CLAUDE.md` covering phone, big screen, shared layer and database/scripts, with small commits and no worktrees.
- **Pure-function scoring with vitest.** Ranking, faction scores, board moves and the final double-points rule are pure TypeScript functions with unit tests. The big screen is the only referee and calls them directly.

## Load test (120 simulated phones against the live project)

| Metric | Result |
|---|---|
| Joined and subscribed | 120 / 120; player 121 correctly told the game is full |
| Broadcast delivery | 100% for both `round` and `result` |
| Broadcast latency, `round` | p50 19 ms, p95 21 ms |
| Broadcast latency, `result` | p50 30 ms, p95 31 ms |
| `submit_input` | p50 39 ms, p95 252 ms |
| `join_game` | p50 117 ms, p95 196 ms |
| `round_live` | p50 46 ms, p95 75 ms |
| RPC errors | 0 of 1495 calls |

## Links

- Play (phone): https://party-blitz.vercel.app
- Big screen: https://party-blitz.vercel.app/?screen=1
- Vote page: https://party-blitz.vercel.app/vote.html
- Architecture: https://party-blitz.vercel.app/arch.html
- Source and design docs: https://github.com/flyfy1/party-blitz
