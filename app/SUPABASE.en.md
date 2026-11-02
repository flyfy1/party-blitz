> English translation of `app/SUPABASE.md`; the Chinese file is the source of truth if they differ.
> Note: the "Database status" section of the Chinese file may lag the cloud. The cloud project was upgraded to the v2 migration at 19:48 on 2026-11-02 (`list_players` added, `round_inputs` removed, `get_state` no longer returns `players`, `round_live` is per-player); this translation reflects that v2 state.

# Supabase connection notes (already configured, ready to use)

## Project
- Project: `party-blitz` (organisation Albert, **Free** tier)
- Region: Southeast Asia (Singapore) `ap-southeast-1`
- Project ref: `rflnldonfclzdybthcny`
- Dashboard: https://supabase.com/dashboard/project/rflnldonfclzdybthcny
- SQL Editor: https://supabase.com/dashboard/project/rflnldonfclzdybthcny/sql/new

## Local credentials
`app/.env` is already filled in (the file is in `.gitignore`):
```
VITE_SUPABASE_URL=https://rflnldonfclzdybthcny.supabase.co
VITE_SUPABASE_ANON_KEY=<publishable key, starts with sb_publishable_>
```
- Only the **publishable key**. It is meant to be exposed to browsers; security comes from RLS and the RPCs
- The secret key and the database password are **not** stored: the frontend does not need them. The database password was generated randomly when the project was created and was not recorded; if you need the CLI's `db push`, reset it in Dashboard → Settings → Database

## Database status
`supabase/migrations/001_init.sql` has been applied to the cloud (v2); its content matches `DESIGN.md §7`:
- 4 tables: `games`, `players`, `rounds`, `inputs`, all with RLS enabled and no policies, so anon cannot read or write directly
- Player RPCs: `join_game`, `submit_input`, `get_state`
- Big-screen RPCs (require `p_key`): `create_game`, `list_players`, `start_round`, `round_live`, `set_game_state`
- `round_inputs` from the v1 migration has been dropped; `get_state` no longer returns a `players` array. The lobby uses `list_players` for name bubbles, and `round_live` returns one row per player

**How to change the schema**: paste `create or replace function ...` into the SQL Editor and run it, and update `001_init.sql` at the same time so they stay in sync. The Supabase CLI is not installed and there is no Docker on this machine.

## Verification
```bash
npm run smoke
```
This creates a test game in the cloud (cap 4 players) and runs through the whole flow: join, full, duplicate join, Broadcast, host key check, mash cap, collect, late submission, state write-back. Measured on 2026-11-02: all 20 checks pass.

## Measured latency (from this machine to the Singapore region)
| Operation | Time |
|---|---|
| `join_game` | 55–115ms |
| `submit_input` | 30–60ms |
| `get_state` / `round_live` | about 50ms |
| Broadcast (host → phone) | about 20ms |

## Client cheat sheet
```ts
import { createClient } from '@supabase/supabase-js';
export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);

// phone
const { data } = await supabase.rpc('join_game', { p_game, p_player }); // {faction, nickname, server_now} | {full, server_now}
supabase.channel(`game:${p_game}`).on('broadcast', { event: 'round' }, ({ payload }) => {}).subscribe();

// big screen
const hostKey = crypto.randomUUID().replaceAll('-', '');                  // at least 8 characters
const { data: { game_id } } = await supabase.rpc('create_game', { p_key: hostKey });
const ch = supabase.channel(`game:${game_id}`); ch.subscribe();
await ch.send({ type: 'broadcast', event: 'round', payload: { /* DESIGN.md §7 */ } });
```

## Notes
- Every smoke-test run leaves one test game in the database; it can be ignored. Use a freshly created game for the real demo
- Free tier Realtime limits: 200 connections, 100 messages per second. Whether Broadcast is billed per receiver has not been verified, see README §6
