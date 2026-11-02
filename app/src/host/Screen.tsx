// Big screen = the only referee. Drives the phase machine with requestAnimationFrame against server
// time, calls host RPCs (with host_key), scores with pure functions and broadcasts round/result/final.
import { useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import './host.css'
import { Stage } from './Stage'
import { HostPanel } from './HostPanel'
import { BotPool } from './bots'
import { CornerQr, Darts, FinalView, Intro, LiveBars, Lobby, Race, ResultView, useFullscreen } from './views'
import { MinorityStage } from './views/MinorityStage'
import { RpsStage } from './views/RpsStage'
import { ReactStage } from './views/ReactStage'
import { QuizStage } from './views/QuizStage'
import { HoldStage } from './views/HoldStage'
import { pickSupabaseQuiz, parseQuizOptions } from '../shared/quiz'
import { quizExtra, holdExtra } from '../shared/scoring.p3'
import { makeReactOptions } from '../shared/react'
import { sfx, unlockSfx } from './sfx'
import { isMusicMuted, setMusic, toggleMusicMute, unlockMusic } from './music'
import { avgLatency, channelName, rpc, supabase } from '../shared/supabase'
import { now, parseTs } from '../shared/time'
import { PRESETS, applyPreset, loadSchedule } from './presets'
import { phaseAt, timingFromUrl } from '../shared/timing'
import { addMvpPoints, finalResult, scoreRound, type MoveStep } from '../shared/scoring'
import { minorityExtra, rpsExtra } from '../shared/extras'
import { pickQuestion } from '../shared/questions'
import type { FinalPayload, GameState, InputRow, Kind, PlayerRow, ResultPayload, RoundPayload, StateResponse, Triple } from '../shared/types'

type Phase = 'boot' | 'auth' | 'lobby' | 'intro' | 'play' | 'collect' | 'result' | 'final' | 'error'

interface Snap {
  phase: Phase
  gameId: string
  roundIdx: number
  kind: RoundPayload['kind']
  options: unknown
  presetId: string
  schedule: Kind[]
  players: (PlayerRow & { joined_at?: string })[]
  maxPlayers: number
  counts: Triple
  live: InputRow[]
  result: ResultPayload | null
  steps: MoveStep[]
  fin: FinalPayload | null
  channel: string
  lastError: string
  resumeRound: number | null
  bots: { joined: number; failed: number; total: number } | null
  tick: number
}

interface Internal {
  gameId: string
  key: string
  roundIdx: number
  round: { id: string; kind: RoundPayload['kind']; starts: number; ends: number; options: unknown } | null
  positions: Triple
  mvpPoints: GameState['mvp_points']
  counts: Triple
  lastLive: InputRow[]
  finalizing: boolean
  finalized: boolean
  nextAt: number
  starting: boolean
  retryAt: number
  skip: boolean
  channel: RealtimeChannel | null
  bots: BotPool | null
  liveTimer: number | null
  lastJoined: string | null
  schedule: Kind[]
}

const T = timingFromUrl()
const GAME_SCALE = 0.895
const GAME_LEFT = 1920 * (1 - GAME_SCALE)
const GAME_TOP = (1080 * (1 - GAME_SCALE)) / 2
const params = new URLSearchParams(location.search)
let booted = false // StrictMode runs effects twice in dev; boot must run once
const initialSchedule = loadSchedule()

export default function Screen() {
  const [snap, setSnap] = useState<Snap>({
    phase: 'boot', gameId: '', roundIdx: -1, kind: 'mash', options: null, presetId: initialSchedule.presetId, schedule: initialSchedule.schedule, players: [], maxPlayers: 120, counts: [0, 0, 0], live: [],
    result: null, steps: [], fin: null, channel: 'CLOSED', lastError: '', resumeRound: null, bots: null, tick: 0,
  })
  const [panel, setPanelRaw] = useState(() => { try { return sessionStorage.getItem('pb:panel') === 'open' } catch { return false } })
  const setPanel = (f: (v: boolean) => boolean) => setPanelRaw((v) => { const n = f(v); try { sessionStorage.setItem('pb:panel', n ? 'open' : 'closed') } catch { /* ignore */ } return n })
  const [admin, setAdmin] = useState(() => { try { return localStorage.getItem('pb:admin') ?? '' } catch { return '' } })
  const [authError, setAuthError] = useState('')
  const [hostsOnly, setHostsOnly] = useState(false)
  const fs = useFullscreen()
  const [muted, setMuted] = useState(isMusicMuted)
  // Background track follows the phase.
  useEffect(() => {
    const ph = snap.phase
    setMusic(ph === 'lobby' ? 'lobby' : ph === 'intro' || ph === 'play' || ph === 'collect' ? 'play' : ph === 'result' ? 'result' : ph === 'final' ? 'final' : 'off')
  }, [snap.phase])
  const S = useRef<Internal>({
    gameId: '', key: '', roundIdx: -1, round: null, positions: [0, 0, 0], mvpPoints: {}, counts: [0, 0, 0], lastLive: [],
    finalizing: false, finalized: false, nextAt: 0, starting: false, retryAt: 0, skip: false, channel: null, bots: null,
    liveTimer: null, lastJoined: null, schedule: initialSchedule.schedule,
  }).current
  const phaseRef = useRef<Phase>('boot')
  const patch = (p: Partial<Snap>) => setSnap((s) => ({ ...s, ...p }))
  const fail = (e: unknown) => patch({ lastError: e instanceof Error ? e.message : String(e) })
  const setPhase = (p: Phase) => { if (phaseRef.current !== p) { phaseRef.current = p; patch({ phase: p }) } }

  // ── boot ──
  useEffect(() => {
    if (booted) return
    booted = true
    const alive = true
    ;(async () => {
      try {
        let g = params.get('g')
        let key = params.get('key')
        const keep = new URLSearchParams()
        keep.set('screen', '1')
        for (const k of ['bots', 'fast']) if (params.get(k)) keep.set(k, params.get(k)!)
        if (!g) {
          // No game yet: hosts only. Ask for the passphrase (remembered in localStorage).
          let secret = ''
          try { secret = localStorage.getItem('pb:admin') ?? '' } catch { /* ignore */ }
          if (!secret) { setPhase('auth'); return }
          key = crypto.randomUUID().replaceAll('-', '')
          try {
            const r = await rpc<{ game_id: string }>('create_game', { p_key: key, p_admin: secret }, { retries: 1 })
            g = r.game_id
          } catch (e) {
            if (String(e instanceof Error ? e.message : e).includes('hosts only')) { try { localStorage.removeItem('pb:admin') } catch { /* ignore */ } setHostsOnly(true); setPhase('auth'); return }
            throw e
          }
        }
        if (key) { try { sessionStorage.setItem(`pb:hostkey:${g}`, key) } catch { /* ignore */ } }
        else { try { key = sessionStorage.getItem(`pb:hostkey:${g}`) } catch { /* ignore */ } }
        keep.set('g', g)
        history.replaceState(null, '', `/?${keep.toString()}`)
        if (!key) { patch({ lastError: 'Missing host key. Open /?screen=1 to create a new game.', gameId: g }); setPhase('error'); return }
        S.gameId = g; S.key = key
        patch({ gameId: g })

        // resume
        const st = await rpc<StateResponse>('get_state', { p_game: g }, { retries: 2 })
        S.counts = st.counts
        patch({ counts: st.counts, maxPlayers: st.max_players ?? 120 })
        if (st.state?.positions) S.positions = st.state.positions
        if (st.state?.mvp_points) S.mvpPoints = st.state.mvp_points
        if (st.status === 'finished') {
          const fin = st.state?.last_final ?? { type: 'final' as const, ...finalResult(S.positions, S.mvpPoints) }
          patch({ fin }); setPhase('final')
        } else {
          if (st.status === 'playing') {
            const last = st.state?.round_idx ?? -1
            S.roundIdx = last
            patch({ roundIdx: last, resumeRound: last + 1 < S.schedule.length ? last + 1 : null })
          }
          setPhase('lobby')
        }

        // channel
        const ch = supabase.channel(channelName(g))
        S.channel = ch
        ch.subscribe((status) => { if (alive) patch({ channel: status }) })

        // bots
        const nb = Number(params.get('bots') || 0)
        if (nb > 0) {
          S.bots = new BotPool(g, nb)
          ;(window as unknown as { __pb: unknown }).__pb = S.bots
          patch({ bots: { joined: 0, failed: 0, total: nb } })
          S.bots.join().catch(fail)
        }
      } catch (e) { fail(e); setPhase('error') }
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── lobby polling: list_players every 1s (keeps running all game; cheap) ──
  useEffect(() => {
    const id = window.setInterval(async () => {
      if (!S.gameId || phaseRef.current === 'error') return
      try {
        const rows = await rpc<(PlayerRow & { joined_at: string })[]>('list_players', { p_game: S.gameId, p_key: S.key, p_after: S.lastJoined })
        if (rows.length) {
          S.lastJoined = rows[rows.length - 1].joined_at
          setSnap((s) => {
            const seen = new Set(s.players.map((p) => p.id))
            const players = [...s.players, ...rows.filter((r) => !seen.has(r.id))]
            const counts: Triple = [0, 0, 0]
            for (const p of players) if (p.faction >= 0 && p.faction < 3) counts[p.faction]++
            S.counts = counts
            return { ...s, players, counts, bots: s.bots && S.bots ? { ...s.bots, joined: S.bots.joined, failed: S.bots.failed } : s.bots }
          })
        } else if (S.bots) {
          const b = S.bots
          setSnap((s) => (s.bots ? { ...s, bots: { ...s.bots, joined: b.joined, failed: b.failed } } : s))
        }
      } catch (e) { fail(e) }
    }, 1000)
    return () => clearInterval(id)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── round control ──
  const startRound = async (idx: number) => {
    if (S.starting) return
    S.starting = true
    try {
      const kind = S.schedule[idx]
      const playMs = kind === 'hold' ? Math.max(T.play, 7000) : T.play
      const isFinal = idx === S.schedule.length - 1
      const options: unknown = kind === 'minority' ? pickQuestion()
        : kind === 'quiz' ? pickSupabaseQuiz(S.schedule.slice(0, idx).filter((k) => k === 'quiz').length, S.gameId)
        : kind === 'react' ? (() => { const o = makeReactOptions(now() + T.intro); const after = Math.min(o.go_after_ms ?? 4000, Math.max(1000, playMs - 2500)); return { go_after_ms: after, go_at: new Date(now() + T.intro + after).toISOString() } })()
        : null
      const r = await rpc<{ round_id: string; starts_at: string; ends_at: string }>('start_round', {
        p_game: S.gameId, p_key: S.key, p_idx: idx, p_kind: kind, p_options: options, p_intro_ms: T.intro, p_play_ms: playMs,
      }, { retries: 2 })
      // authoritative counts for scoring
      try { const st = await rpc<StateResponse>('get_state', { p_game: S.gameId }); S.counts = st.counts; patch({ counts: st.counts }) } catch { /* keep lobby counts */ }
      const payload: RoundPayload & { total_rounds: number } = { type: 'round', round_idx: idx, round_id: r.round_id, kind, options: options ?? undefined, starts_at: r.starts_at, ends_at: r.ends_at, final: isFinal, total_rounds: S.schedule.length }
      S.round = { id: r.round_id, kind, starts: parseTs(r.starts_at), ends: parseTs(r.ends_at), options }
      S.roundIdx = idx
      S.finalized = false; S.finalizing = false; S.skip = false; S.lastLive = []
      patch({ roundIdx: idx, kind, options, live: [], result: null, steps: [], resumeRound: null })
      await S.channel?.send({ type: 'broadcast', event: 'round', payload })
      S.bots?.onRound(payload)
      setPhase('intro')
    } catch (e) { fail(e); S.retryAt = now() + 1500 }
    finally { S.starting = false }
  }

  const finalize = async () => {
    if (S.finalizing || S.finalized || !S.round) return
    S.finalizing = true
    stopLive()
    const idx = S.roundIdx, round = S.round
    let rows: InputRow[] = S.lastLive
    try { rows = await rpc<InputRow[]>('round_live', { p_round: round.id, p_key: S.key }, { retries: 2 }) } catch (e) { fail(e) }
    const res = scoreRound(round.kind, rows, S.counts, S.positions, idx === S.schedule.length - 1, round.options)
    const mvpPoints = addMvpPoints(S.mvpPoints, res.mvp, idx)
    const extra = round.kind === 'minority' ? minorityExtra(rows) : round.kind === 'rps' ? rpsExtra(rows)
      : round.kind === 'quiz' ? quizExtra(rows, parseQuizOptions(round.options).answer) : round.kind === 'hold' ? holdExtra(rows, S.counts) : undefined
    const payload: ResultPayload = { type: 'result', round_idx: idx, kind: round.kind, ranks: res.ranks, scores: res.scores, moves: res.moves, positions: res.positions, mvp: res.mvp, ...(extra ? { extra } : {}) }
    const state: GameState = { positions: res.positions, round_idx: idx, last_result: payload, mvp_points: mvpPoints }
    S.positions = res.positions; S.mvpPoints = mvpPoints
    try { await rpc('set_game_state', { p_game: S.gameId, p_key: S.key, p_status: 'playing', p_state: state }, { retries: 2 }) } catch (e) { fail(e) }
    try { await S.channel?.send({ type: 'broadcast', event: 'result', payload }) } catch (e) { fail(e) }
    const t = now()
    S.nextAt = Math.max(round.ends + T.collect + T.result, t + T.result)
    S.finalized = true; S.finalizing = false
    patch({ result: payload, steps: res.steps, live: rows })
    setPhase('result')
  }

  const finishGame = async () => {
    if (S.starting) return
    S.starting = true
    try {
      const fin: FinalPayload = { type: 'final', ...finalResult(S.positions, S.mvpPoints) }
      const state: GameState = { positions: S.positions, round_idx: S.roundIdx, last_result: snap.result, mvp_points: S.mvpPoints, last_final: fin }
      try { await rpc('set_game_state', { p_game: S.gameId, p_key: S.key, p_status: 'finished', p_state: state }, { retries: 2 }) } catch (e) { fail(e) }
      try { await S.channel?.send({ type: 'broadcast', event: 'final', payload: fin }) } catch (e) { fail(e) }
      S.round = null
      patch({ fin })
      setPhase('final')
      sfx.win()
    } finally { S.starting = false }
  }

  const startLive = () => {
    if (S.liveTimer !== null) return
    S.liveTimer = window.setInterval(async () => {
      if (!S.round) return
      try {
        const rows = await rpc<InputRow[]>('round_live', { p_round: S.round.id, p_key: S.key })
        S.lastLive = rows
        patch({ live: rows })
      } catch { /* next tick */ }
    }, 250)
  }
  const stopLive = () => { if (S.liveTimer !== null) { clearInterval(S.liveTimer); S.liveTimer = null } }

  // ── rAF phase machine ──
  useEffect(() => {
    let raf = 0
    let lastTick = 0
    const loop = () => {
      raf = requestAnimationFrame(loop)
      const t = now()
      const ph = phaseRef.current
      if (S.round && ph !== 'final' && ph !== 'error' && ph !== 'lobby') {
        if (!S.finalized) {
          const p = S.skip ? 'done' : phaseAt(t, S.round.starts, S.round.ends, T)
          if (p === 'intro') setPhase('intro')
          else if (p === 'play') { if (phaseRef.current !== 'play') sfx.horn(); setPhase('play'); startLive() }
          else if (p === 'collect') { setPhase('collect') }
          else if (!S.finalizing) { setPhase('collect'); void finalize() }
        } else if (t < S.nextAt && !S.skip) {
          setPhase('result')
        } else if (!S.starting && t >= S.retryAt) {
          S.skip = false
          if (S.roundIdx + 1 < S.schedule.length) void startRound(S.roundIdx + 1)
          else void finishGame()
        }
      }
      if (t - lastTick > 100) { lastTick = t; setSnap((s) => ({ ...s, tick: t })) }
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── host panel actions + H key ──
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      unlockSfx(); unlockMusic()
      if (e.key === 'h' || e.key === 'H') setPanel((v) => !v)
      if (e.key === 'm' || e.key === 'M') setMuted(toggleMusicMute())
    }
    const unlock = () => { unlockSfx(); unlockMusic() }
    window.addEventListener('keydown', on)
    window.addEventListener('pointerdown', unlock)
    return () => { window.removeEventListener('keydown', on); window.removeEventListener('pointerdown', unlock) }
  }, [])
  const onPreset = (id: string) => { const r = applyPreset(id); S.schedule = r.schedule; patch({ presetId: r.presetId, schedule: r.schedule }) }
  const onStart = () => { void startRound(snap.resumeRound ?? 0) }
  const onSkip = () => {
    const ph = phaseRef.current
    if (ph === 'intro' || ph === 'play' || ph === 'collect') { S.skip = true }
    else if (ph === 'result') { S.nextAt = 0 }
  }
  const submitAdmin = () => {
    const v = admin.trim()
    if (!v) return
    try { localStorage.setItem('pb:admin', v) } catch { /* ignore */ }
    setAuthError('')
    location.reload()
  }
  const onReset = () => {
    let secret = ''
    try { secret = localStorage.getItem('pb:admin') ?? '' } catch { /* ignore */ }
    if (!secret) { location.href = '/?screen=1'; return }
    const key = crypto.randomUUID().replaceAll('-', '')
    rpc<{ game_id: string }>('create_game', { p_key: key, p_admin: secret }, { retries: 1 }).then((r) => {
      const q = new URLSearchParams({ screen: '1', g: r.game_id, key })
      for (const k of ['bots', 'fast']) if (params.get(k)) q.set(k, params.get(k)!)
      S.bots?.stop()
      location.href = `/?${q.toString()}`
    }).catch(fail)
  }

  // ── render ──
  const joinUrl = `${location.origin}/?g=${snap.gameId}`
  const secondsLeft = (() => {
    if (!S.round) return 0
    const t = now()
    if (snap.phase === 'intro') return Math.max(1, Math.ceil((S.round.starts - t) / 1000))
    return Math.max(0, Math.ceil((S.round.ends - t) / 1000))
  })()
  const lastTickSec = useRef(-1)
  useEffect(() => {
    if (snap.phase === 'intro' && secondsLeft !== lastTickSec.current) { lastTickSec.current = secondsLeft; sfx.tick() }
    if (snap.phase !== 'intro') lastTickSec.current = -1
  }, [snap.phase, secondsLeft])
  const canStart = snap.phase === 'lobby' && snap.channel === 'SUBSCRIBED' && !!snap.gameId
  const startLabel = snap.phase !== 'lobby' ? 'Game running' : snap.channel !== 'SUBSCRIBED' ? `Waiting for channel (${snap.channel})`
    : snap.resumeRound !== null ? `Continue: round ${snap.resumeRound + 1}` : 'Start game'

  return (
    <>
      <Stage>
        {snap.phase === 'boot' && <div className="title" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 80 }}>Loading…</div>}
        {snap.phase === 'auth' && (
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
            {hostsOnly ? (
              <div className="pop" style={{ padding: 100 }}>
                <div className="title" style={{ fontSize: 64 }}>Hosts only. Scan the QR code on stage to play.</div>
                <button onClick={() => { try { localStorage.removeItem('pb:admin') } catch { /* ignore */ } setAdmin(''); setHostsOnly(false) }} style={{ marginTop: 40, fontSize: 20, background: 'transparent', color: 'rgba(255,255,255,0.45)', textDecoration: 'underline' }}>Host? Try again</button>
              </div>
            ) : (
              <div className="card pop" style={{ padding: 50, width: 820 }}>
                <div className="title" style={{ fontSize: 64, marginBottom: 20 }}>PARTY BLITZ ⚡ host</div>
                <div style={{ fontSize: 28, opacity: 0.8, marginBottom: 20 }}>Host passphrase</div>
                <input data-role="admin" type="password" value={admin} autoFocus onChange={(e) => setAdmin(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submitAdmin() }}
                  style={{ fontSize: 40, padding: '14px 24px', borderRadius: 18, border: '4px solid rgba(255,255,255,0.3)', width: '100%', textAlign: 'center', fontFamily: 'inherit' }} />
                <button data-role="create" onClick={submitAdmin} style={{ marginTop: 24, fontSize: 36, fontWeight: 800, padding: '16px 50px', borderRadius: 20, background: '#FFD633', color: '#1B1033' }}>Create game</button>
                {authError && <div style={{ color: '#FFB199', marginTop: 16, fontSize: 24 }}>{authError}</div>}
              </div>
            )}
          </div>
        )}
        {snap.phase === 'error' && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 48, color: '#FFB199', textAlign: 'center', padding: 100 }}>{snap.lastError}</div>}
        {snap.phase === 'lobby' && <Lobby joinUrl={joinUrl} players={snap.players} maxPlayers={snap.maxPlayers} resumeRound={snap.resumeRound} />}
        {/* Game content: uniform scale 0.895 anchored right, so the left ~200px strip holds the QR
            and the panel button while the stage keeps ≥ 80% of the screen area. */}
        <div style={{ position: 'absolute', left: GAME_LEFT, top: GAME_TOP, width: 1920, height: 1080, transform: `scale(${GAME_SCALE})`, transformOrigin: 'top left' }}>
        {snap.phase === 'intro' && <Intro kind={snap.kind} roundIdx={snap.roundIdx} total={snap.schedule.length} secondsLeft={secondsLeft} final={snap.roundIdx === snap.schedule.length - 1} />}
        {(snap.phase === 'play' || snap.phase === 'collect') && (snap.kind === 'mash'
          ? <Race rows={snap.live} counts={snap.counts} secondsLeft={secondsLeft} collecting={snap.phase === 'collect'} roundIdx={snap.roundIdx} />
          : snap.kind === 'stop'
          ? <Darts rows={snap.live} counts={snap.counts} secondsLeft={secondsLeft} collecting={snap.phase === 'collect'} roundIdx={snap.roundIdx} />
          : snap.kind === 'minority'
          ? <MinorityStage rows={snap.live} counts={snap.counts} secondsLeft={secondsLeft} collecting={snap.phase === 'collect'} roundIdx={snap.roundIdx} options={snap.options} />
          : snap.kind === 'rps'
          ? <RpsStage rows={snap.live} counts={snap.counts} secondsLeft={secondsLeft} collecting={snap.phase === 'collect'} roundIdx={snap.roundIdx} />
          : snap.kind === 'quiz'
          ? <QuizStage rows={snap.live} counts={snap.counts} secondsLeft={secondsLeft} collecting={snap.phase === 'collect'} roundIdx={snap.roundIdx} options={snap.options} />
          : snap.kind === 'hold'
          ? <HoldStage rows={snap.live} counts={snap.counts} secondsLeft={secondsLeft} collecting={snap.phase === 'collect'} roundIdx={snap.roundIdx} />
          : snap.kind === 'react'
          ? <ReactStage rows={snap.live} counts={snap.counts} secondsLeft={secondsLeft} collecting={snap.phase === 'collect'} roundIdx={snap.roundIdx} options={snap.options} startsAt={S.round?.starts ?? 0} />
          : <LiveBars kind={snap.kind} rows={snap.live} counts={snap.counts} secondsLeft={secondsLeft} collecting={snap.phase === 'collect'} roundIdx={snap.roundIdx} />)}
        {snap.phase === 'result' && snap.result && <ResultView key={snap.result.round_idx} result={snap.result} steps={snap.steps} total={snap.schedule.length} />}
        {snap.phase === 'final' && snap.fin && <FinalView fin={snap.fin} />}
        </div>
        {snap.phase !== 'lobby' && snap.phase !== 'boot' && snap.phase !== 'error' && snap.gameId && <CornerQr joinUrl={joinUrl} />}
        {snap.phase === 'lobby' && !fs.full && (
          <button onClick={fs.enter} style={{ position: 'absolute', right: 30, top: 30, padding: '10px 22px', borderRadius: 14, fontSize: 24, fontWeight: 800, background: 'rgba(255,255,255,0.15)', color: '#fff', border: '3px solid rgba(255,255,255,0.3)' }}>⛶ Fullscreen</button>
        )}
      </Stage>
      {snap.phase !== 'auth' && <HostPanel
        visible={panel} phase={snap.phase} roundIdx={snap.roundIdx} totalRounds={snap.schedule.length} players={snap.players.length}
        channel={snap.channel} rpcMs={avgLatency()} bots={snap.bots} lastError={snap.lastError} gameId={snap.gameId}
        canStart={canStart} startLabel={startLabel} onStart={onStart} onSkip={onSkip} onReset={onReset}
        isFullscreen={fs.full} onFullscreen={fs.enter}
        presets={PRESETS} presetId={snap.presetId} schedule={snap.schedule} onPreset={onPreset}
        onToggle={() => setPanel((v) => !v)}
        musicMuted={muted} onMusic={() => setMuted(toggleMusicMute())}
      />}
    </>
  )
}
