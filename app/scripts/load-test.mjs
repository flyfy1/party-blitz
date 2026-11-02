// Load test: N supabase-js clients (default 120) join one game, subscribe to game:{id},
// play one `mash` round driven by this script (no big screen needed), then report
// connection success, per-broadcast delivery rate, broadcast latency, RPC latency and error rate.
//
// Usage:  node --env-file=.env scripts/load-test.mjs [N] [--play-ms 10000] [--intro-ms 2000]
//         npm run loadtest            (N = 120)
//         npm run loadtest -- 30      (N = 30)
//
// Exit code: 0 when every assertion passed, 1 otherwise. Always calls removeAllChannels() first.
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

// ── config ───────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flag = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? Number(argv[i + 1]) : dflt;
};
const N = Number(argv.find((a) => /^\d+$/.test(a)) ?? 120);
const INTRO_MS = flag('--intro-ms', 2000);
const PLAY_MS = flag('--play-ms', 10000);
const SUBMIT_EVERY_MS = 1000;
const TAPS_PER_SEC = 8; // simulated mash rate per player
const HARD_TIMEOUT_MS = INTRO_MS + PLAY_MS + 60_000;

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (run with --env-file=.env)');
  process.exit(1);
}
const mk = () => createClient(url, key, { auth: { persistSession: false } });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── metrics ──────────────────────────────────────────────────────────────────
const rpcMs = {}; // fn -> [ms]
const rpcErr = {}; // fn -> count
const rpcCount = {}; // fn -> count
const bcast = {}; // event -> { sentAt, latencies: [] }
let failed = 0;

const rpc = async (client, fn, args) => {
  rpcCount[fn] = (rpcCount[fn] ?? 0) + 1;
  const t = performance.now();
  const { data, error } = await client.rpc(fn, args);
  const ms = performance.now() - t;
  if (error) {
    rpcErr[fn] = (rpcErr[fn] ?? 0) + 1;
    throw new Error(`${fn}: ${error.message}`);
  }
  (rpcMs[fn] ??= []).push(ms);
  return data;
};
const pct = (arr, p) => {
  if (!arr.length) return NaN;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};
const fmt = (n) => (Number.isNaN(n) ? '-' : `${Math.round(n)}ms`);
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`);
  if (!ok) failed++;
};

// ── cleanup guard: never leave sockets open ──────────────────────────────────
const allClients = [];
let exiting = false;
const finish = async (code) => {
  if (exiting) return;
  exiting = true;
  await Promise.allSettled(allClients.map((c) => c.removeAllChannels()));
  process.exit(code);
};
const hardTimer = setTimeout(() => {
  console.error(`\nHard timeout after ${HARD_TIMEOUT_MS}ms — cleaning up`);
  finish(1);
}, HARD_TIMEOUT_MS);
hardTimer.unref();
process.on('SIGINT', () => finish(1));

// ── 1. host creates the game (max_players = N so player N+1 must get {full:true}) ─
console.log(`Load test: N=${N}, intro=${INTRO_MS}ms, play=${PLAY_MS}ms → ${url}`);
const host = mk();
allClients.push(host);
const hostKey = randomUUID().replaceAll('-', '');
const { game_id: gameId } = await rpc(host, 'create_game', { p_key: hostKey, p_admin: process.env.PB_HOST_ADMIN, p_max_players: N });
console.log(`game ${gameId}`);

// ── 2. N players: join_game + subscribe ──────────────────────────────────────
const players = Array.from({ length: N }, (_, i) => ({
  i,
  id: randomUUID(),
  client: mk(),
  joined: false,
  subscribed: false,
  taps: 0,
  submits: 0,
  submitErrors: 0,
  timer: null,
}));
allClients.push(...players.map((p) => p.client));

const onBroadcast = (p, event, payload) => {
  const b = (bcast[event] ??= { latencies: [], receivers: new Set() });
  if (!b.receivers.has(p.i)) {
    b.receivers.add(p.i);
    if (payload?.sent_at) b.latencies.push(Date.now() - payload.sent_at);
  }
  if (event === 'round' && payload?.kind === 'mash') startMashing(p, payload);
  if (event === 'result') stopMashing(p);
};

const startMashing = (p, round) => {
  const startsAt = Date.parse(round.starts_at);
  const endsAt = Date.parse(round.ends_at);
  const roundId = round.round_id;
  const submit = async (force = false) => {
    if (!force && Date.now() > endsAt) return stopMashing(p);
    const elapsed = Math.min(Date.now(), endsAt) - startsAt;
    p.taps = Math.max(0, Math.round((elapsed / 1000) * TAPS_PER_SEC * (0.7 + 0.6 * Math.random())));
    p.submits++;
    try {
      await rpc(p.client, 'submit_input', { p_round: roundId, p_player: p.id, p_value: p.taps });
    } catch {
      p.submitErrors++;
    }
  };
  const firstDelay = Math.max(0, startsAt - Date.now()) + Math.random() * SUBMIT_EVERY_MS;
  p.timer = setTimeout(() => {
    submit();
    p.timer = setInterval(submit, SUBMIT_EVERY_MS);
  }, firstDelay);
  // one forced submit right at ends_at, like the phone does
  setTimeout(() => submit(true), Math.max(0, endsAt - Date.now()) + 50);
};
const stopMashing = (p) => {
  if (p.timer) {
    clearTimeout(p.timer);
    clearInterval(p.timer);
    p.timer = null;
  }
};

const subscribe = (p) =>
  new Promise((resolve) => {
    const ch = p.client.channel(`game:${gameId}`);
    ch.on('broadcast', { event: 'round' }, ({ payload }) => onBroadcast(p, 'round', payload))
      .on('broadcast', { event: 'result' }, ({ payload }) => onBroadcast(p, 'result', payload))
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          p.subscribed = true;
          resolve();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          resolve();
        }
      });
    setTimeout(resolve, 15_000); // never hang on a silent socket
  });

const t0 = performance.now();
// join in waves of 20 so we do not hammer the API from a single process all at once
for (let start = 0; start < N; start += 20) {
  await Promise.all(
    players.slice(start, start + 20).map(async (p) => {
      try {
        const r = await rpc(p.client, 'join_game', { p_game: gameId, p_player: p.id });
        p.joined = !!r?.nickname;
        p.full = r?.full === true;
      } catch {
        p.joined = false;
      }
      await subscribe(p);
    }),
  );
}
const joinedCount = players.filter((p) => p.joined).length;
const subscribedCount = players.filter((p) => p.subscribed).length;
console.log(`joined ${joinedCount}/${N}, subscribed ${subscribedCount}/${N} in ${Math.round(performance.now() - t0)}ms`);
check('all players joined', joinedCount === N);
check('all players subscribed', subscribedCount === N);

// ── 3. host channel + start_round + broadcast `round` ────────────────────────
const hostCh = host.channel(`game:${gameId}`);
await new Promise((resolve) => hostCh.subscribe((s) => s === 'SUBSCRIBED' && resolve()));
const round = await rpc(host, 'start_round', {
  p_game: gameId, p_key: hostKey, p_idx: 0, p_kind: 'mash', p_options: null, p_intro_ms: INTRO_MS, p_play_ms: PLAY_MS,
});
await hostCh.send({
  type: 'broadcast',
  event: 'round',
  payload: { type: 'round', round_idx: 0, round_id: round.round_id, kind: 'mash',
             starts_at: round.starts_at, ends_at: round.ends_at, sent_at: Date.now() },
});
console.log(`round ${round.round_id} starts ${round.starts_at}`);

// ── 4. during PLAY the host polls round_live every 250ms, like the real screen ─
const endsAt = Date.parse(round.ends_at);
let lastLive = [];
while (Date.now() < endsAt + 1200) {
  const t = Date.now();
  try {
    lastLive = await rpc(host, 'round_live', { p_round: round.round_id, p_key: hostKey });
  } catch { /* counted in rpcErr */ }
  await sleep(Math.max(0, 250 - (Date.now() - t)));
}
players.forEach(stopMashing);

// ── 5. broadcast `result` and give it a moment to land ───────────────────────
await hostCh.send({
  type: 'broadcast',
  event: 'result',
  payload: { type: 'result', round_idx: 0, round_id: round.round_id, kind: 'mash',
             inputs: lastLive.length, sent_at: Date.now() },
});
await sleep(2000);
const withInput = new Set(lastLive.map((r) => r.player_id)).size;
check('every joined player has an input row', withInput === joinedCount, `${withInput}/${joinedCount}`);

// ── 6. player N+1 must be rejected with {full:true} ──────────────────────────
const extra = mk();
allClients.push(extra);
let extraResp = null;
try {
  extraResp = await rpc(extra, 'join_game', { p_game: gameId, p_player: randomUUID() });
} catch (e) {
  extraResp = { error: e.message };
}
check(`player ${N + 1} gets {full:true}`, extraResp?.full === true, JSON.stringify(extraResp));

await rpc(host, 'set_game_state', { p_game: gameId, p_key: hostKey, p_status: 'finished', p_state: { load_test: true } });

// ── 7. report ────────────────────────────────────────────────────────────────
console.log('\n== Connections ==');
console.log(`join_game ok   ${joinedCount}/${N}`);
console.log(`subscribed     ${subscribedCount}/${N}`);

console.log('\n== Broadcast delivery (received ÷ N) ==');
for (const [event, b] of Object.entries(bcast)) {
  const rate = (100 * b.receivers.size) / N;
  console.log(`${event.padEnd(8)} ${b.receivers.size}/${N} (${rate.toFixed(1)}%)   latency p50 ${fmt(pct(b.latencies, 50))}  p95 ${fmt(pct(b.latencies, 95))}  max ${fmt(Math.max(...b.latencies, 0))}`);
}
for (const event of ['round', 'result']) {
  check(`${event} delivered to every subscribed client`, (bcast[event]?.receivers.size ?? 0) === subscribedCount);
}

console.log('\n== RPC ==');
let totalCalls = 0;
let totalErrs = 0;
for (const fn of Object.keys(rpcCount)) {
  const errs = rpcErr[fn] ?? 0;
  totalCalls += rpcCount[fn];
  totalErrs += errs;
  console.log(`${fn.padEnd(16)} n=${String(rpcCount[fn]).padStart(5)}  p50 ${fmt(pct(rpcMs[fn] ?? [], 50)).padStart(7)}  p95 ${fmt(pct(rpcMs[fn] ?? [], 95)).padStart(7)}  errors ${errs}`);
}
const errRate = totalCalls ? (100 * totalErrs) / totalCalls : 0;
console.log(`${'total'.padEnd(16)} n=${String(totalCalls).padStart(5)}  error rate ${errRate.toFixed(2)}%`);
const submitErrors = players.reduce((s, p) => s + p.submitErrors, 0);
check('submit_input error rate < 1%', (rpcErr.submit_input ?? 0) / Math.max(1, rpcCount.submit_input ?? 0) < 0.01, `${submitErrors} errors`);

console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
clearTimeout(hardTimer);
await finish(failed ? 1 : 0);
