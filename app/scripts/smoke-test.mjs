// 端到端冒烟测试：RPC（建局/加入/满员/提交/汇总/host key）+ Realtime Broadcast。
// 用法：node --env-file=.env scripts/smoke-test.mjs
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;
const mk = () => createClient(url, key, { auth: { persistSession: false } });
const host = mk();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failed = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? '✅' : '❌'} ${name}${extra ? ' — ' + extra : ''}`);
  if (!ok) failed++;
};
const rpc = async (client, fn, args) => {
  const t = performance.now();
  const { data, error } = await client.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return { data, ms: Math.round(performance.now() - t) };
};

// 1. 建局（max_players = 4，方便测满员）
const hostKey = randomUUID().replaceAll('-', '');
const { data: created, ms: createMs } = await rpc(host, 'create_game', { p_key: hostKey, p_max_players: 4 });
const gameId = created.game_id;
check('create_game', !!gameId, `${createMs}ms`);

// 2. 直接读表应该被 RLS 挡住
const { data: leaked } = await host.from('games').select('*');
check('RLS 挡住直接读表', !leaked || leaked.length === 0);

// 3. 加入 4 人 → 阵营轮流分配；第 5 人满员；重复加入返回原阵营
const players = [];
for (let i = 0; i < 4; i++) {
  const id = randomUUID();
  const { data, ms } = await rpc(host, 'join_game', { p_game: gameId, p_player: id });
  players.push({ id, ...data });
  console.log(`   join → ${data.nickname} 阵营 ${data.faction}（${ms}ms）`);
}
const factions = players.map((p) => p.faction);
check('阵营轮流分配', new Set(factions.slice(0, 3)).size === 3, factions.join(','));
check('join_game 返回 server_now', !!players[0].server_now, players[0].server_now);
const { data: fifth } = await rpc(host, 'join_game', { p_game: gameId, p_player: randomUUID() });
check('第 5 人返回 full', fifth?.full === true);
const { data: again } = await rpc(host, 'join_game', { p_game: gameId, p_player: players[0].id });
check('重复加入返回原阵营', again.faction === players[0].faction && again.nickname === players[0].nickname);

// 4. get_state（大厅）
const { data: state, ms: stateMs } = await rpc(host, 'get_state', { p_game: gameId });
check('get_state', state.players.length === 4 && state.round === null, `counts=${JSON.stringify(state.counts)} ${stateMs}ms`);

// 5. Realtime：两个"手机"订阅 game:{id}，host 广播 round
const phones = [mk(), mk()];
const received = [];
let sentAt = 0;
await Promise.all(
  phones.map(
    (c, i) =>
      new Promise((resolve, reject) => {
        c.channel(`game:${gameId}`)
          .on('broadcast', { event: 'round' }, () => received.push({ phone: i, latency: Date.now() - sentAt }))
          .subscribe((status) => {
            if (status === 'SUBSCRIBED') resolve();
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') reject(new Error(status));
          });
      }),
  ),
);
const hostCh = host.channel(`game:${gameId}`);
await new Promise((resolve) => hostCh.subscribe((s) => s === 'SUBSCRIBED' && resolve()));

// 6. 错误 host key 被拒绝；正确 key 开一轮 mash（intro 0.5s，play 3s）
const { error: badKey } = await host.rpc('start_round', {
  p_game: gameId, p_key: 'wrong-key-123', p_idx: 0, p_kind: 'mash', p_options: null, p_intro_ms: 0, p_play_ms: 3000,
});
check('错误 host key 被拒绝', !!badKey);
const { data: round, ms: startMs } = await rpc(host, 'start_round', {
  p_game: gameId, p_key: hostKey, p_idx: 0, p_kind: 'mash', p_options: null, p_intro_ms: 500, p_play_ms: 3000,
});
check('start_round', !!round.round_id && !!round.starts_at, `${startMs}ms`);
sentAt = Date.now();
await hostCh.send({ type: 'broadcast', event: 'round', payload: { type: 'round', round_idx: 0, round_id: round.round_id, kind: 'mash', starts_at: round.starts_at, ends_at: round.ends_at } });

// 7. intro 期间提交应被忽略
await rpc(host, 'submit_input', { p_round: round.round_id, p_player: players[0].id, p_value: 5 });
await sleep(1500);
check('两台手机都收到广播', received.length === 2, received.map((r) => `${r.latency}ms`).join(', '));
const { data: st2 } = await rpc(host, 'get_state', { p_game: gameId });
check('get_state 带当前 round', st2.round?.id === round.round_id && st2.status === 'playing');

// 8. PLAY 中提交：正常值 + 刷分（999 被时间上限截断）
const submitMs = [];
for (const p of players) {
  submitMs.push((await rpc(host, 'submit_input', { p_round: round.round_id, p_player: p.id, p_value: 10 })).ms);
}
await rpc(host, 'submit_input', { p_round: round.round_id, p_player: players[0].id, p_value: 999 });
const { data: live, ms: liveMs } = await rpc(host, 'round_live', { p_round: round.round_id, p_key: hostKey });
console.log(`   round_live → ${JSON.stringify(live)}（${liveMs}ms）`);
const total = live.reduce((s, r) => s + r.sum, 0);
// 已玩约 1 秒 → 上限约 30×1+10 = 40；四人合计应远小于 999
check('mash 刷分被截断', total < 100, `总和=${total}`);
check('submit_input 延迟', true, submitMs.map((m) => m + 'ms').join(', '));
const { error: liveBadKey } = await host.rpc('round_live', { p_round: round.round_id, p_key: 'wrong-key-123' });
check('round_live 需要 host key', !!liveBadKey);

// 9. 收卷
const { data: inputs } = await rpc(host, 'round_inputs', { p_round: round.round_id, p_key: hostKey });
check('round_inputs', inputs.length === 4 && inputs.every((i) => i.nickname));

// 10. 结束 1 秒后的提交被忽略
await sleep(3500);
await rpc(host, 'submit_input', { p_round: round.round_id, p_player: players[1].id, p_value: 50 });
const { data: live2 } = await rpc(host, 'round_live', { p_round: round.round_id, p_key: hostKey });
check('结束后的提交被忽略', JSON.stringify(live2) === JSON.stringify(live));

// 11. set_game_state
await rpc(host, 'set_game_state', { p_game: gameId, p_key: hostKey, p_status: 'finished', p_state: { positions: [3, 2, 1] } });
const { data: st3 } = await rpc(host, 'get_state', { p_game: gameId });
check('set_game_state', st3.status === 'finished' && st3.state.positions?.[0] === 3);

for (const c of [host, ...phones]) await c.removeAllChannels();
console.log(failed ? `\n${failed} 项失败` : '\n全部通过 🎉');
process.exit(failed ? 1 : 0);
