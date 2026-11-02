-- PARTY BLITZ：基础 schema 和 RPC（见 ../../../DESIGN.md §7）
-- 四张表都开启 RLS 且不加 policy，anon 角色只能通过 security definer RPC 访问数据。

create sequence if not exists join_seq;

create table if not exists games (
  id          uuid primary key default gen_random_uuid(),
  host_key    text not null,                          -- 大屏 URL 里的 ?key=，host RPC 都要校验
  status      text not null default 'lobby',          -- lobby | playing | finished
  max_players int  not null default 120,
  round_idx   int  not null default -1,
  state       jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create table if not exists players (
  id        uuid primary key,
  game_id   uuid not null references games(id) on delete cascade,
  nickname  text not null,
  faction   smallint not null check (faction between 0 and 2),
  joined_at timestamptz not null default now()
);
create index if not exists players_game_idx on players(game_id, joined_at);

create table if not exists rounds (
  id        uuid primary key default gen_random_uuid(),
  game_id   uuid not null references games(id) on delete cascade,
  idx       int  not null,
  kind      text not null,                            -- mash | stop | minority | rps
  options   jsonb,
  starts_at timestamptz not null,                     -- PLAY 开始（服务端时间）
  ends_at   timestamptz not null,                     -- PLAY 结束
  unique (game_id, idx)
);

create table if not exists inputs (
  round_id   uuid not null references rounds(id) on delete cascade,
  player_id  uuid not null references players(id) on delete cascade,
  faction    smallint not null,
  value      double precision not null,
  first_at   timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (round_id, player_id)
);

alter table games   enable row level security;
alter table players enable row level security;
alter table rounds  enable row level security;
alter table inputs  enable row level security;

-- ── 内部工具函数（不对外）──────────────────────────────────

create or replace function _random_nick() returns text
language sql volatile set search_path = public as $$
  select (array['勇敢的','暴躁的','闪电','佛系','神秘','饥饿的','无敌','害羞的','疯狂','淡定',
                '超能','迷糊','傲娇','元气','睡不醒的','快乐','隐形','狂野','优雅的','热血'])[1 + floor(random() * 20)::int]
      || (array['榴莲','叉烧包','咖椰吐司','椰浆饭','鸡饭','珍珠奶茶','煎饺','豆花','炒粿条','肉骨茶',
                '辣椒蟹','冰淇淋','沙爹','叻沙','薄饼','咖喱角','烤鸡翅','红豆冰','牛油果','芒果糯米饭'])[1 + floor(random() * 20)::int];
$$;

create or replace function _check_host(p_game uuid, p_key text) returns void
language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from games where id = p_game and host_key = p_key) then
    raise exception 'invalid host key';
  end if;
end $$;

-- ── 玩家 RPC ─────────────────────────────────────────────

-- 同一个 player id 重复调用返回原阵营；满员返回 {full: true}
create or replace function join_game(p_game uuid, p_player uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_player players;
  v_max    int;
  v_count  int;
  v_nick   text;
  v_fac    smallint;
begin
  select * into v_player from players where id = p_player and game_id = p_game;
  if found then
    return jsonb_build_object('faction', v_player.faction, 'nickname', v_player.nickname, 'server_now', now());
  end if;

  perform pg_advisory_xact_lock(hashtext(p_game::text));
  select max_players into v_max from games where id = p_game;
  if v_max is null then raise exception 'game not found'; end if;
  select count(*) into v_count from players where game_id = p_game;
  if v_count >= v_max then
    return jsonb_build_object('full', true, 'server_now', now());
  end if;

  v_nick := _random_nick();
  v_fac  := (nextval('join_seq') % 3)::smallint;
  insert into players (id, game_id, nickname, faction) values (p_player, p_game, v_nick, v_fac);
  return jsonb_build_object('faction', v_fac, 'nickname', v_nick, 'server_now', now());
end $$;

-- mash：value 只增不减，且不超过 30 次/秒 × 已玩秒数 + 10；其他小游戏覆盖旧值
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
  select faction into v_fac from players where id = p_player and game_id = v_round.game_id;
  if not found then raise exception 'not a player'; end if;

  if v_round.kind = 'mash' then
    v_cap   := 30 * extract(epoch from least(now(), v_round.ends_at) - v_round.starts_at) + 10;
    v_value := least(greatest(p_value, 0), v_cap);
  else
    v_value := p_value;
  end if;

  insert into inputs (round_id, player_id, faction, value)
  values (p_round, p_player, v_fac, v_value)
  on conflict (round_id, player_id) do update set
    value = case when v_round.kind = 'mash' then greatest(inputs.value, v_value) else v_value end,
    updated_at = now();
end $$;

-- 手机进场、重连、兜底轮询；大屏大厅也用它（players 用来画名字泡泡）
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
      (select count(*) from players where game_id = g.id and faction = 2)),
    'players', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'nickname', p.nickname, 'faction', p.faction) order by p.joined_at)
      from players p where p.game_id = g.id), '[]'::jsonb)
  )
  from games g where g.id = p_game;
$$;

-- ── 大屏 RPC（都要带 p_key）──────────────────────────────

create or replace function create_game(p_key text, p_max_players int default 120)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if p_key is null or length(p_key) < 8 then raise exception 'host key too short'; end if;
  insert into games (host_key, max_players) values (p_key, p_max_players) returning id into v_id;
  return jsonb_build_object('game_id', v_id);
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
  delete from inputs where round_id = v_round.id;   -- 重开同一轮时清空旧输入
  update games set status = 'playing', round_idx = p_idx where id = p_game;
  return jsonb_build_object('round_id', v_round.id, 'starts_at', v_round.starts_at, 'ends_at', v_round.ends_at);
end $$;

create or replace function round_inputs(p_round uuid, p_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform _check_host((select game_id from rounds where id = p_round), p_key);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'player_id', i.player_id, 'nickname', p.nickname, 'faction', i.faction,
      'value', i.value, 'first_at', i.first_at))
    from inputs i join players p on p.id = i.player_id
    where i.round_id = p_round), '[]'::jsonb);
end $$;

create or replace function round_live(p_round uuid, p_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  perform _check_host((select game_id from rounds where id = p_round), p_key);
  return coalesce((
    select jsonb_agg(jsonb_build_object('faction', faction, 'n', n, 'sum', s) order by faction)
    from (select faction, count(*) as n, sum(value) as s
          from inputs where round_id = p_round group by faction) t), '[]'::jsonb);
end $$;

create or replace function set_game_state(p_game uuid, p_key text, p_status text, p_state jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform _check_host(p_game, p_key);
  update games set status = p_status, state = p_state where id = p_game;
end $$;

-- ── 权限：只暴露 RPC ─────────────────────────────────────
revoke execute on function _random_nick() from public, anon, authenticated;
revoke execute on function _check_host(uuid, text) from public, anon, authenticated;
grant execute on function join_game(uuid, uuid), submit_input(uuid, uuid, float8), get_state(uuid),
  create_game(text, int), start_round(uuid, text, int, text, jsonb, int, int),
  round_inputs(uuid, text), round_live(uuid, text), set_game_state(uuid, text, text, jsonb)
  to anon;
