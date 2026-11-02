-- PARTY BLITZ：schema 和 RPC（见 ../../../DESIGN.md §7，v2）
-- 可以反复执行：create ... if not exists / create or replace / drop ... if exists。
-- 四张表都开启 RLS 且不加 policy，anon 角色只能通过 security definer RPC 访问数据。

create sequence if not exists join_seq;

create table if not exists games (
  id          uuid primary key default gen_random_uuid(),
  host_key    text not null,
  status      text not null default 'lobby',          -- lobby | playing | finished
  max_players int  not null default 120,
  round_idx   int  not null default -1,
  state       jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create table if not exists players (
  game_id   uuid not null references games(id) on delete cascade,
  id        uuid not null,                             -- 客户端生成，localStorage，跨局不变
  nickname  text not null,
  faction   smallint not null check (faction between 0 and 2),
  joined_at timestamptz not null default now(),
  primary key (game_id, id)
);

create table if not exists rounds (
  id        uuid primary key default gen_random_uuid(),
  game_id   uuid not null references games(id) on delete cascade,
  idx       int  not null,
  kind      text not null,                            -- mash | stop | minority | rps | quiz | hold | react
  options   jsonb,
  starts_at timestamptz not null,
  ends_at   timestamptz not null,
  unique (game_id, idx)
);

create table if not exists inputs (
  round_id   uuid not null references rounds(id) on delete cascade,
  player_id  uuid not null,                           -- 不建外键
  faction    smallint not null,
  value      double precision not null,
  first_at   timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (round_id, player_id)
);

-- v1 → v2：players 主键从 (id) 改成 (game_id, id)，inputs 去掉对 players 的外键
do $$
declare v_def text;
begin
  select pg_get_constraintdef(oid) into v_def
    from pg_constraint where conrelid = 'public.players'::regclass and contype = 'p';
  if v_def = 'PRIMARY KEY (id)' then
    alter table public.inputs  drop constraint if exists inputs_player_id_fkey;
    alter table public.players drop constraint players_pkey;
    alter table public.players add primary key (game_id, id);
  end if;
end $$;
alter table inputs drop constraint if exists inputs_player_id_fkey;
create index if not exists players_game_idx on players(game_id, joined_at);

-- Hosts only: create_game requires a passphrase stored in this table. The value is NEVER
-- committed. Run once by hand in the Supabase SQL editor (and keep it out of git):
--   insert into host_admin (secret) values ('<your passphrase>') on conflict do nothing;
create table if not exists host_admin (secret text primary key);
alter table host_admin enable row level security;

alter table games   enable row level security;
alter table players enable row level security;
alter table rounds  enable row level security;
alter table inputs  enable row level security;

drop function if exists round_inputs(uuid, text);
drop function if exists _random_nick();

-- ── 内部工具函数（不对外）──────────────────────────────────

create or replace function _random_nick(n bigint) returns text
language sql volatile set search_path = public as $$
  select (array['Brave','Grumpy','Lightning','Chill','Mystic','Hungry','Mighty','Shy','Wild','Cool',
                'Super','Dizzy','Sassy','Peppy','Sleepy','Happy','Ghost','Feral','Fancy','Blazing'])[1 + floor(random() * 20)::int]
      || ' ' ||
         (array['Durian','Char Siu Bao','Kaya Toast','Nasi Lemak','Chicken Rice','Bubble Tea','Dumpling','Tau Huay','Char Kway Teow','Bak Kut Teh',
                'Chilli Crab','Ice Cream','Satay','Laksa','Popiah','Curry Puff','Chicken Wing','Ice Kacang','Avocado','Mango Sticky Rice'])[1 + floor(random() * 20)::int]
      || ' #' || (n % 100);
$$;

create or replace function _check_host(p_game uuid, p_key text) returns void
language plpgsql set search_path = public as $$
begin
  if p_game is null or not exists (select 1 from games where id = p_game and host_key = p_key) then
    raise exception 'invalid host key';
  end if;
end $$;

-- ── 玩家 RPC ─────────────────────────────────────────────

create or replace function join_game(p_game uuid, p_player uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_player players;
  v_max    int;
  v_count  int;
  v_seq    bigint;
  v_nick   text;
  v_fac    smallint;
begin
  -- Serialize per game first, then check membership: two concurrent calls for the same
  -- player must not both reach the insert (that raised 23505 duplicate key before).
  perform pg_advisory_xact_lock(hashtext(p_game::text));
  select * into v_player from players where game_id = p_game and id = p_player;
  if found then
    return jsonb_build_object('faction', v_player.faction, 'nickname', v_player.nickname, 'server_now', now());
  end if;

  select max_players into v_max from games where id = p_game;
  if v_max is null then raise exception 'game not found'; end if;
  select count(*) into v_count from players where game_id = p_game;
  if v_count >= v_max then
    return jsonb_build_object('full', true, 'server_now', now());
  end if;

  v_seq  := nextval('join_seq');
  v_fac  := (v_seq % 3)::smallint;
  v_nick := _random_nick(v_seq);
  insert into players (game_id, id, nickname, faction) values (p_game, p_player, v_nick, v_fac)
  on conflict (game_id, id) do nothing;
  return jsonb_build_object('faction', v_fac, 'nickname', v_nick, 'server_now', now());
end $$;

-- 按 rounds.kind 校验 value；都保留最早的 first_at
create or replace function submit_input(p_round uuid, p_player uuid, p_value float8)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_round rounds;
  v_fac   smallint;
  v_cap   float8;
  v_value float8;
begin
  select * into v_round from rounds where id = p_round;
  if not found then raise exception 'round not found'; end if;
  if now() < v_round.starts_at or now() > v_round.ends_at + interval '1 second' then
    return;
  end if;
  select faction into v_fac from players where game_id = v_round.game_id and id = p_player;
  if not found then raise exception 'not a player'; end if;

  if v_round.kind = 'mash' then
    v_cap   := 30 * extract(epoch from least(now(), v_round.ends_at) - v_round.starts_at) + 10;
    v_value := least(greatest(coalesce(p_value, 0), 0), v_cap);
    insert into inputs (round_id, player_id, faction, value) values (p_round, p_player, v_fac, v_value)
    on conflict (round_id, player_id) do update
      set value = greatest(inputs.value, excluded.value), updated_at = now();
  elsif v_round.kind = 'stop' then
    v_value := least(greatest(coalesce(p_value, 1), 0), 1);
    insert into inputs (round_id, player_id, faction, value) values (p_round, p_player, v_fac, v_value)
    on conflict (round_id, player_id) do update set value = excluded.value, updated_at = now();
  elsif v_round.kind = 'minority' then
    if p_value is null or p_value not in (0, 1, 2) then raise exception 'bad value'; end if;
    insert into inputs (round_id, player_id, faction, value) values (p_round, p_player, v_fac, p_value)
    on conflict (round_id, player_id) do nothing;
  elsif v_round.kind = 'rps' then
    if p_value is null or p_value not in (0, 1, 2) then raise exception 'bad value'; end if;
    insert into inputs (round_id, player_id, faction, value) values (p_round, p_player, v_fac, p_value)
    on conflict (round_id, player_id) do update set value = excluded.value, updated_at = now();
  elsif v_round.kind = 'quiz' then
    -- answer 0/1/2, first answer counts
    if p_value is null or p_value not in (0, 1, 2) then raise exception 'bad value'; end if;
    insert into inputs (round_id, player_id, faction, value) values (p_round, p_player, v_fac, p_value)
    on conflict (round_id, player_id) do nothing;
  elsif v_round.kind = 'hold' then
    -- accuracy in [0,1], latest wins
    v_value := least(greatest(coalesce(p_value, 1), 0), 1);
    insert into inputs (round_id, player_id, faction, value) values (p_round, p_player, v_fac, v_value)
    on conflict (round_id, player_id) do update set value = excluded.value, updated_at = now();
  elsif v_round.kind = 'react' then
    -- reaction time in ms, [0,2000], first tap counts
    v_value := least(greatest(coalesce(p_value, 2000), 0), 2000);
    insert into inputs (round_id, player_id, faction, value) values (p_round, p_player, v_fac, v_value)
    on conflict (round_id, player_id) do nothing;
  else
    raise exception 'unknown kind %', v_round.kind;
  end if;
end $$;

-- 手机进场、重连、兜底轮询（大厅 3s / 比赛 2s）
create or replace function get_state(p_game uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'status',      g.status,
    'round_idx',   g.round_idx,
    'state',       g.state,
    'max_players', g.max_players,
    'server_now',  now(),
    'round', (
      select jsonb_build_object('id', r.id, 'kind', r.kind, 'options', r.options,
                                'starts_at', r.starts_at, 'ends_at', r.ends_at)
      from rounds r where r.game_id = g.id and r.idx = g.round_idx),
    'counts', jsonb_build_array(
      (select count(*) from players where game_id = g.id and faction = 0),
      (select count(*) from players where game_id = g.id and faction = 1),
      (select count(*) from players where game_id = g.id and faction = 2))
  )
  from games g where g.id = p_game;
$$;

-- ── 大屏 RPC（都要带 p_key）──────────────────────────────

drop function if exists create_game(text, int);
drop function if exists create_game(text);
create or replace function create_game(p_key text, p_admin text, p_max_players int default 120)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if p_admin is null or not exists (select 1 from host_admin where secret = p_admin) then
    raise exception 'hosts only';
  end if;
  if p_key is null or length(p_key) < 8 then raise exception 'host key too short'; end if;
  insert into games (host_key, max_players) values (p_key, p_max_players) returning id into v_id;
  return jsonb_build_object('game_id', v_id, 'server_now', now());
end $$;

-- 大厅每 1s 调用，只返回 joined_at > p_after 的新玩家
create or replace function list_players(p_game uuid, p_key text, p_after timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform _check_host(p_game, p_key);
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', id, 'nickname', nickname, 'faction', faction, 'joined_at', joined_at)
                     order by joined_at, id)
    from players where game_id = p_game and joined_at > coalesce(p_after, '-infinity'::timestamptz)
  ), '[]'::jsonb);
end $$;

create or replace function start_round(
  p_game uuid, p_key text, p_idx int, p_kind text, p_options jsonb, p_intro_ms int, p_play_ms int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_round rounds;
begin
  perform _check_host(p_game, p_key);
  insert into rounds (game_id, idx, kind, options, starts_at, ends_at)
  values (p_game, p_idx, p_kind, p_options,
          now() + make_interval(secs => p_intro_ms / 1000.0),
          now() + make_interval(secs => (p_intro_ms + p_play_ms) / 1000.0))
  on conflict (game_id, idx) do update set
    kind = excluded.kind, options = excluded.options,
    starts_at = excluded.starts_at, ends_at = excluded.ends_at
  returning * into v_round;
  delete from inputs where round_id = v_round.id;
  update games set status = 'playing', round_idx = p_idx where id = p_game;
  return jsonb_build_object('round_id', v_round.id, 'starts_at', v_round.starts_at, 'ends_at', v_round.ends_at,
                            'server_now', now());
end $$;

-- 比赛中每 250ms 调用；收卷后再调一次作为最终数据。每个玩家一行，聚合在前端算
create or replace function round_live(p_round uuid, p_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform _check_host((select game_id from rounds where id = p_round), p_key);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'player_id', i.player_id, 'nickname', coalesce(p.nickname, '?'), 'faction', i.faction,
      'value', i.value, 'first_at', i.first_at))
    from inputs i
    join rounds r on r.id = i.round_id
    left join players p on p.game_id = r.game_id and p.id = i.player_id
    where i.round_id = p_round), '[]'::jsonb);
end $$;

create or replace function set_game_state(p_game uuid, p_key text, p_status text, p_state jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform _check_host(p_game, p_key);
  update games set status = p_status, state = p_state where id = p_game;
end $$;

-- ── 权限：只暴露 RPC ─────────────────────────────────────
revoke execute on function _random_nick(bigint) from public, anon, authenticated;
revoke execute on function _check_host(uuid, text) from public, anon, authenticated;
grant execute on function
  join_game(uuid, uuid), submit_input(uuid, uuid, float8), get_state(uuid),
  create_game(text, text, int), list_players(uuid, text, timestamptz),
  start_round(uuid, text, int, text, jsonb, int, int),
  round_live(uuid, text), set_game_state(uuid, text, text, jsonb)
  to anon;

notify pgrst, 'reload schema';
