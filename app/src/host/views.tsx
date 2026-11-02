import { useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import confetti from 'canvas-confetti'
import QRCode from 'qrcode'
import { FACTIONS, KIND_META } from '../shared/factions'
import { BOARD_SIZE, SPECIAL_CELLS } from '../shared/board'
import type { MoveStep } from '../shared/scoring'
import type { FinalPayload, InputRow, Kind, PlayerRow, ResultPayload, Triple } from '../shared/types'

// ── helpers ──────────────────────────────────────────────────────────────

/** Number that rolls to its new value instead of jumping. */
export function Roll({ value, digits = 0, style }: { value: number; digits?: number; style?: React.CSSProperties }) {
  const [shown, setShown] = useState(value)
  const obj = useRef({ v: value })
  useEffect(() => {
    gsap.to(obj.current, { v: value, duration: 0.6, ease: 'power2.out', onUpdate: () => setShown(obj.current.v) })
  }, [value])
  return <span style={style}>{shown.toFixed(digits)}</span>
}

export function BigWord({ text, small, k }: { text: string; small?: boolean; k?: string | number }) {
  return <div key={k ?? text} className={`bigword pop${small ? ' small' : ''}`}>{text}</div>
}

export function shake(ms = 300) {
  const el = document.getElementById('stage-inner')
  if (!el) return
  gsap.fromTo(el, { x: -14 }, { x: 14, duration: 0.05, repeat: Math.round(ms / 50), yoyo: true, onComplete: () => gsap.set(el, { x: 0 }) })
}

export function burst(x = 0.5, y = 0.5, colors?: string[]) {
  confetti({ particleCount: 160, spread: 90, startVelocity: 55, origin: { x, y }, colors })
}

const colorOf = (f: number) => FACTIONS[f]?.color ?? '#fff'

// ── Lobby ────────────────────────────────────────────────────────────────

export function Lobby({ joinUrl, players, maxPlayers, resumeRound }: { joinUrl: string; players: PlayerRow[]; maxPlayers: number; resumeRound: number | null }) {
  const [qr, setQr] = useState('')
  useEffect(() => { QRCode.toDataURL(joinUrl, { width: 1000, margin: 1, errorCorrectionLevel: 'M' }).then(setQr) }, [joinUrl])
  const full = players.length >= maxPlayers
  const left = maxPlayers - players.length
  const host = joinUrl.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  const byFaction = [0, 1, 2].map((f) => players.filter((p) => p.faction === f))
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div style={{ position: 'absolute', top: 30, left: 0, right: 0, textAlign: 'center' }}>
        <div className="title pop" style={{ fontSize: 84 }}>PARTY BLITZ ⚡</div>
        <div className="counter" style={{ fontSize: 72 }}><Roll value={players.length} /> <span style={{ opacity: 0.5 }}>/ {maxPlayers}</span></div>
        {!full && left <= 10 && <div className="pulse" style={{ fontSize: 44, color: '#FFD633', fontWeight: 800 }}>Last {left} spots!</div>}
        {full && <div style={{ fontSize: 36, color: '#FFB199' }}>Full! Open the same link to spectate and cheer 📣</div>}
      </div>

      <div style={{ position: 'absolute', left: 80, top: 250, width: 700 }}>
        <div className="pop" style={{ position: 'relative', background: '#fff', borderRadius: 40, padding: 22, width: 700, height: 660 }}>
          {qr && <img src={qr} alt="QR" style={{ width: 616, height: 616, display: 'block', imageRendering: 'pixelated' }} />}
          {full && <div className="stamp"><span>FULL</span></div>}
        </div>
        <div style={{ textAlign: 'center', marginTop: 10, fontSize: 48, fontWeight: 800, lineHeight: 1.1 }}>{host}</div>
        <div style={{ textAlign: 'center', fontSize: 20, opacity: 0.55, lineHeight: 1.2 }}>{joinUrl}</div>
      </div>

      <div style={{ position: 'absolute', left: 860, right: 60, top: 260, bottom: 60, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)', gap: 24 }}>
        {FACTIONS.map((f, i) => (
          <div key={f.id} className="card pop" style={{ borderColor: f.color, padding: 20, display: 'flex', flexDirection: 'column', minWidth: 0, overflow: 'hidden', animationDelay: `${i * 0.1}s` }}>
            <div style={{ textAlign: 'center' }}>
              <div className="float" style={{ fontSize: 130, lineHeight: 1 }}>{f.emoji}</div>
              <div style={{ fontSize: 44, fontWeight: 800, color: f.color }}>{f.name}</div>
              <div style={{ fontSize: 40, fontWeight: 800 }}><Roll value={byFaction[i].length} /></div>
            </div>
            <div className="lobby-names" style={{ marginTop: 16, overflow: 'hidden', flex: 1 }}>
              {byFaction[i].slice(-14).map((p) => <span key={p.id} className="name-chip pop" style={{ background: f.light }}>{p.nickname}</span>)}
            </div>
          </div>
        ))}
      </div>

      <div style={{ position: 'absolute', bottom: 14, left: 0, right: 0, textAlign: 'center', fontSize: 22, opacity: 0.45 }}>
        {resumeRound !== null ? `Game in progress – press H and continue from round ${resumeRound + 1}` : 'Press H for the host panel · Start when everyone is in'}
      </div>
    </div>
  )
}

// ── Intro ────────────────────────────────────────────────────────────────

export function Intro({ kind, roundIdx, total, secondsLeft, final }: { kind: Kind; roundIdx: number; total: number; secondsLeft: number; final: boolean }) {
  const m = KIND_META[kind]
  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
      <div className="stripes" />
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', textAlign: 'center' }}>
        <div>
          <div style={{ fontSize: 48, fontWeight: 800, opacity: 0.9 }}>ROUND {roundIdx + 1} / {total}{final ? ' · FINAL ×2' : ''}</div>
          <div className="pop" style={{ fontSize: 220, lineHeight: 1 }}>{m.icon}</div>
          <div className="title pop" style={{ fontSize: 200, lineHeight: 1 }}>{m.verb}</div>
          <div style={{ fontSize: 40, opacity: 0.85, marginTop: 10 }}>{m.hint}</div>
          <div key={secondsLeft} className="pop" style={{ fontSize: 160, fontWeight: 800, lineHeight: 1, marginTop: 10 }}>{secondsLeft}</div>
        </div>
      </div>
    </div>
  )
}

// ── Mash race ────────────────────────────────────────────────────────────

export function Race({ rows, counts, secondsLeft, collecting, roundIdx }: { rows: InputRow[]; counts: Triple; secondsLeft: number; collecting: boolean; roundIdx: number }) {
  const sums: Triple = [0, 0, 0], n: Triple = [0, 0, 0]
  for (const r of rows) if (r.faction >= 0 && r.faction < 3) { sums[r.faction] += r.value; n[r.faction]++ }
  const avg = sums.map((s, i) => (counts[i] ? s / counts[i] : 0)) as Triple
  const max = Math.max(...avg, 1e-9)
  const leader = avg.indexOf(Math.max(...avg))
  const prevLeader = useRef(-1)
  const prevAvg = useRef<Triple>([0, 0, 0])
  const [overtake, setOvertake] = useState(0)
  useEffect(() => {
    if (Math.max(...avg) > 0 && prevLeader.current !== -1 && prevLeader.current !== leader) { setOvertake(Date.now()); shake(300) }
    if (Math.max(...avg) > 0) prevLeader.current = leader
  }, [leader]) // eslint-disable-line react-hooks/exhaustive-deps
  const speeds = avg.map((a, i) => a - prevAvg.current[i])
  useEffect(() => { prevAvg.current = avg })
  useEffect(() => { if (collecting) { burst(0.9, 0.3); burst(0.9, 0.7) } }, [collecting])
  const submitted = n.reduce((a, b) => a + b, 0), total = counts.reduce((a, b) => a + b, 0)
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div style={{ position: 'absolute', top: 24, left: 60, fontSize: 44, fontWeight: 800 }}>ROUND {roundIdx + 1} · ⚡ {KIND_META.mash.title}</div>
      <div style={{ position: 'absolute', top: 24, right: 60, fontSize: 44, opacity: 0.7 }}>{submitted} / {total} tapping</div>
      <div style={{ position: 'absolute', top: 80, left: 0, right: 0, textAlign: 'center' }}>
        <span key={secondsLeft} className={`counter pop ${secondsLeft <= 3 ? 'pulse' : ''}`} style={{ fontSize: 150, color: secondsLeft <= 3 ? '#FFD633' : '#fff' }}>{collecting ? '' : secondsLeft}</span>
      </div>
      {FACTIONS.map((f, i) => {
        const x = 150 + (avg[i] / max) * 1480
        const dust = Math.min(1, Math.max(0, speeds[i] / 3))
        return (
          <div key={f.id} className="lane" style={{ top: 280 + i * 230, borderColor: f.color }}>
            <div className="finish" />
            <div style={{ position: 'absolute', left: 20, top: -44, fontSize: 32, fontWeight: 800, color: f.color }}>{f.name}</div>
            <div className="runner" style={{ left: x, transform: `translate(-50%, -50%) scale(${i === leader && avg[i] > 0 ? 1.15 : 1})` }}>
              <span className="dust" style={{ opacity: dust }}>💨</span>
              <span className="float">{f.emoji}</span>
              <div style={{ position: 'absolute', left: '50%', top: '100%', transform: 'translateX(-50%)', fontSize: 40, fontWeight: 800, whiteSpace: 'nowrap', color: f.color }}>
                <Roll value={avg[i]} digits={1} /> <span style={{ fontSize: 24, opacity: 0.7 }}>avg</span>
              </div>
            </div>
          </div>
        )
      })}
      {collecting && <BigWord text="TIME'S UP!" />}
      {!collecting && overtake > 0 && Date.now() - overtake < 1200 && <BigWord k={overtake} text="OVERTAKE!" small />}
    </div>
  )
}

/** Generic live view for non-mash kinds (P0 fallback): submissions per faction. */
export function LiveBars({ kind, rows, counts, secondsLeft, collecting, roundIdx }: { kind: Kind; rows: InputRow[]; counts: Triple; secondsLeft: number; collecting: boolean; roundIdx: number }) {
  const n: Triple = [0, 0, 0]
  for (const r of rows) if (r.faction >= 0 && r.faction < 3) n[r.faction]++
  const m = KIND_META[kind]
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div style={{ position: 'absolute', top: 24, left: 60, fontSize: 44, fontWeight: 800 }}>ROUND {roundIdx + 1} · {m.icon} {m.title}</div>
      <div style={{ position: 'absolute', top: 80, left: 0, right: 0, textAlign: 'center' }}>
        <span key={secondsLeft} className="counter pop" style={{ fontSize: 150 }}>{collecting ? '' : secondsLeft}</span>
      </div>
      <div style={{ position: 'absolute', left: 120, right: 120, top: 320, display: 'grid', gap: 40 }}>
        {FACTIONS.map((f, i) => (
          <div key={f.id} className="rankrow" style={{ background: f.dark }}>
            <span style={{ fontSize: 80 }}>{f.emoji}</span><span style={{ width: 220 }}>{f.name}</span>
            <div className="bar"><div style={{ width: `${counts[i] ? (n[i] / counts[i]) * 100 : 0}%`, background: f.color }} /></div>
            <span>{n[i]} / {counts[i]}</span>
          </div>
        ))}
      </div>
      {collecting && <BigWord text="TIME'S UP!" />}
    </div>
  )
}

// ── Result + board ───────────────────────────────────────────────────────

const CELL_W = 86, BOARD_LEFT = 54

export function ResultView({ result, steps, total }: { result: ResultPayload; steps: MoveStep[]; total: number }) {
  const pieceRefs = useRef<(HTMLDivElement | null)[]>([])
  const [specialHit, setSpecialHit] = useState<{ f: number; emoji: string; label: string } | null>(null)
  const [done, setDone] = useState(false)
  // Pieces that share a cell are spread horizontally so none hides behind another.
  const shareOffset = (cells: number[], f: number) => {
    const same = cells.map((c, i) => (c === cells[f] ? i : -1)).filter((i) => i >= 0)
    return (same.indexOf(f) - (same.length - 1) / 2) * 28
  }
  const fromOff = steps.map((_, f) => shareOffset(steps.map((s) => s.from), f))
  const finalOff = steps.map((_, f) => shareOffset(steps.map((s) => s.final), f))
  useEffect(() => {
    const tl = gsap.timeline({ delay: 0.8, onComplete: () => setDone(true) })
    steps.forEach((s, f) => {
      const el = pieceRefs.current[f]
      if (!el) return
      const x = (c: number) => BOARD_LEFT + c * CELL_W
      gsap.set(el, { left: x(s.from) + fromOff[f] })
      const dir = s.landed >= s.from ? 1 : -1
      for (let c = s.from; c !== s.landed; c += dir) {
        tl.to(el, { left: x(c + dir), duration: 0.22, ease: 'power1.inOut' }, '<+=0.05')
        tl.to(el, { y: -60, duration: 0.11, ease: 'power1.out' }, '<')
        tl.to(el, { y: 0, scaleY: 0.8, scaleX: 1.2, duration: 0.11, ease: 'power1.in' }, '>')
        tl.to(el, { scaleY: 1, scaleX: 1, duration: 0.1 }, '>')
      }
      if (s.special) {
        const sp = s.special
        tl.call(() => { setSpecialHit({ f, emoji: sp.emoji, label: sp.label }); if (sp.delta < 0) shake(300) })
        tl.to(el, { left: x(s.final) + finalOff[f], duration: 0.5, ease: sp.delta > 0 ? 'back.out(1.5)' : 'bounce.out' }, '+=0.3')
      } else {
        tl.to(el, { left: x(s.final) + finalOff[f], duration: 0.2 })
      }
      if (s.final === BOARD_SIZE) tl.call(() => burst(0.95, 0.75, [colorOf(f)]))
    })
    return () => { tl.kill() }
  }, [steps])
  const order = [0, 1, 2].sort((a, b) => result.ranks[a] - result.ranks[b] || b - a)
  const medal = (r: number) => (r === 1 ? '🥇' : r === 2 ? '🥈' : '🥉')
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div style={{ position: 'absolute', top: 20, left: 60, fontSize: 40, fontWeight: 800, opacity: 0.85 }}>ROUND {result.round_idx + 1} / {total} RESULTS</div>
      <div style={{ position: 'absolute', top: 80, left: 60, width: 1120, display: 'grid', gap: 14 }}>
        {order.map((f, i) => (
          <div key={f} className="rankrow pop" style={{ background: FACTIONS[f].dark, animationDelay: `${i * 0.15}s` }}>
            <span style={{ fontSize: 56 }}>{medal(result.ranks[f])}</span>
            <span style={{ fontSize: 60 }}>{FACTIONS[f].emoji}</span>
            <span style={{ width: 200, color: FACTIONS[f].light }}>{FACTIONS[f].name}</span>
            <div className="bar"><div style={{ width: `${(result.scores[f] / Math.max(...result.scores, 1e-9)) * 100}%`, background: FACTIONS[f].color }} /></div>
            <span style={{ width: 150, textAlign: 'right' }}><Roll value={result.scores[f]} digits={1} /></span>
            <span style={{ width: 170, textAlign: 'right', color: '#FFD633' }}>+{result.moves[f]} cells</span>
          </div>
        ))}
      </div>
      <div className="card pop" style={{ position: 'absolute', top: 80, right: 60, width: 640, padding: 20, animationDelay: '0.4s' }}>
        <div style={{ fontSize: 34, fontWeight: 800, marginBottom: 8 }}>🏆 Round MVP</div>
        {result.mvp.length === 0 && <div style={{ opacity: 0.6, fontSize: 28 }}>{result.kind === 'mash' ? 'Nobody tapped!' : 'No MVP this round'}</div>}
        {result.mvp.map((m, i) => (
          <div key={m.player_id} className="pop" style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 36, fontWeight: 800, padding: '4px 0', animationDelay: `${0.5 + i * 0.15}s` }}>
            <span>{medal(i + 1)}</span><span>{FACTIONS[m.faction].emoji}</span>
            <span style={{ flex: 1, color: FACTIONS[m.faction].light, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.nick}</span>
            <span style={{ opacity: 0.8 }}>{result.kind === 'mash' ? `${Math.round(m.value)} taps` : result.kind === 'stop' ? `${(m.value * 100).toFixed(0)}% off` : '✓'}</span>
          </div>
        ))}
      </div>

      {/* board: lower 2/3 */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 120, height: 260 }}>
        {Array.from({ length: BOARD_SIZE + 1 }, (_, c) => {
          const sp = SPECIAL_CELLS[c]
          const cls = c === BOARD_SIZE ? 'finish' : sp?.type ?? ''
          return (
            <div key={c} className={`cell ${cls}`} style={{ left: BOARD_LEFT + c * CELL_W }}>
              <span className="num">{c === 0 ? 'START' : c === BOARD_SIZE ? 'FINISH' : c}</span>
              {sp ? sp.emoji : c === BOARD_SIZE ? '🏁' : ''}
            </div>
          )
        })}
        {FACTIONS.map((f, i) => {
          const st = steps[i]
          return (
            <div key={f.id} ref={(el) => { pieceRefs.current[i] = el }} className="piece" style={{ left: BOARD_LEFT + st.from * CELL_W + fromOff[i], bottom: 90 + i * 8, zIndex: 10 + i }}>
              <span className="float" style={{ animationDelay: `${i * 0.3}s` }}>{f.emoji}</span>
            </div>
          )
        })}
      </div>
      <div style={{ position: 'absolute', bottom: 30, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 60, fontSize: 30, opacity: 0.8 }}>
        {FACTIONS.map((f, i) => <span key={f.id} style={{ color: f.color, fontWeight: 800 }}>{f.emoji} {done ? result.positions[i] : steps[i].from} / {BOARD_SIZE}</span>)}
        <span style={{ opacity: 0.6 }}>⭐ +1 · 🚀 +2 · 💥 −2</span>
      </div>
      {specialHit && <BigWord k={`${specialHit.f}-${specialHit.emoji}`} text={`${specialHit.emoji} ${specialHit.label}`} small />}
    </div>
  )
}

// ── Final ────────────────────────────────────────────────────────────────

export function FinalView({ fin }: { fin: FinalPayload }) {
  const winners = Array.isArray(fin.winner) ? fin.winner : [fin.winner]
  useEffect(() => {
    const colors = winners.map(colorOf)
    const id = window.setInterval(() => {
      confetti({ particleCount: 60, spread: 70, origin: { x: Math.random(), y: -0.1 }, colors, gravity: 0.9, startVelocity: 25, ticks: 300 })
    }, 350)
    burst(0.5, 0.4, colors)
    return () => clearInterval(id)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const medal = ['🥇', '🥈', '🥉']
  const podiumH = [260, 190, 140]
  const podiumOrder = [1, 0, 2]
  return (
    <div style={{ position: 'absolute', inset: 0, textAlign: 'center' }}>
      <div className="title pop" style={{ fontSize: 110, marginTop: 30 }}>
        {winners.length === 1 ? `${FACTIONS[winners[0]].name.toUpperCase()} WINS!` : 'IT\'S A TIE!'}
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 40 }}>
        {winners.map((w) => <div key={w} className="pop float" style={{ fontSize: 320, lineHeight: 1 }}>{FACTIONS[w].emoji}</div>)}
      </div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 50, fontSize: 34, fontWeight: 800, marginTop: -10 }}>
        {FACTIONS.map((f, i) => <span key={f.id} style={{ color: f.color }}>{f.emoji} {fin.positions[i]} / {BOARD_SIZE}</span>)}
      </div>
      <div style={{ position: 'absolute', bottom: 60, left: 0, right: 0 }}>
        <div style={{ fontSize: 40, fontWeight: 800, marginBottom: 14 }}>🏆 MVP podium</div>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: 24 }}>
          {podiumOrder.map((rank, i) => {
            const m = fin.mvp_top3[rank]
            return (
              <div key={rank} className="pop" style={{ width: 420, animationDelay: `${0.6 + i * 0.25}s` }}>
                {m && <div style={{ fontSize: 32, fontWeight: 800, lineHeight: 1.1, color: FACTIONS[m.faction].light, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{FACTIONS[m.faction].emoji} {m.nick}</div>}
                <div className="card" style={{ height: podiumH[rank], display: 'grid', placeItems: 'center', fontSize: 70, background: m ? FACTIONS[m.faction].dark : undefined }}>
                  {medal[rank]} {m ? <span style={{ fontSize: 40 }}>{m.points} pts</span> : ''}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ── Stop: dart rain ──────────────────────────────────────────────────────

const hash01 = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) } return ((h >>> 0) % 10000) / 10000 }

export function Darts({ rows, counts, secondsLeft, collecting, roundIdx }: { rows: InputRow[]; counts: Triple; secondsLeft: number; collecting: boolean; roundIdx: number }) {
  const cx = 960, cy = 590, R = 400
  const shown = rows.slice(0, 300)
  const closest = [...rows].sort((a, b) => a.value - b.value).slice(0, 3).map((r) => r.player_id)
  const best = collecting && rows.length ? rows.reduce((a, b) => (b.value < a.value ? b : a)) : null
  const total = counts.reduce((a, b) => a + b, 0)
  const m = KIND_META.stop
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      <div style={{ position: 'absolute', top: 24, left: 60, fontSize: 44, fontWeight: 800 }}>ROUND {roundIdx + 1} · {m.icon} {m.title}</div>
      <div style={{ position: 'absolute', top: 24, right: 60, fontSize: 44, opacity: 0.7 }}>{rows.length} / {total} thrown</div>
      <div style={{ position: 'absolute', top: 80, left: 0, right: 0, textAlign: 'center' }}>
        <span key={secondsLeft} className={`counter pop ${secondsLeft <= 3 ? 'pulse' : ''}`} style={{ fontSize: 150, color: secondsLeft <= 3 ? '#FFD633' : '#fff' }}>{collecting ? '' : secondsLeft}</span>
      </div>
      {[1, 0.8, 0.6, 0.4, 0.2, 0.07].map((k, i) => (
        <div key={k} className="pop" style={{ position: 'absolute', left: cx - R * k, top: cy - R * k, width: 2 * R * k, height: 2 * R * k, borderRadius: '50%', background: i % 2 ? '#F8F1E7' : '#E5484D', border: '4px solid #1B1033', animationDelay: `${i * 0.06}s` }} />
      ))}
      {shown.map((r) => {
        const a = hash01(r.player_id) * Math.PI * 2
        const rad = Math.min(1, Math.max(0, r.value)) * R
        const x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad
        const isBest = best?.player_id === r.player_id
        const near = closest.includes(r.player_id)
        return (
          <div key={r.player_id} className="pop" style={{ position: 'absolute', left: x, top: y, transform: 'translate(-50%, -50%)', zIndex: isBest ? 40 : near ? 30 : 20 }}>
            <div style={{ width: isBest ? 54 : 26, height: isBest ? 54 : 26, borderRadius: '50%', background: colorOf(r.faction), border: '4px solid #1B1033', boxShadow: '0 4px 0 rgba(0,0,0,0.4)', margin: '0 auto' }} />
            {near && <div style={{ position: 'absolute', left: '50%', top: '100%', transform: 'translateX(-50%)', whiteSpace: 'nowrap', fontSize: isBest ? 44 : 22, fontWeight: 800, color: '#fff', textShadow: '0 2px 0 #1B1033, 0 0 8px #1B1033' }}>{r.nickname}{isBest ? ` · ${(r.value * 100).toFixed(0)}% off` : ''}</div>}
          </div>
        )
      })}
      {collecting && <BigWord text="TIME'S UP!" />}
    </div>
  )
}


// ── Corner QR (late joiners) + fullscreen button ─────────────────────────

export function CornerQr({ joinUrl }: { joinUrl: string }) {
  const [qr, setQr] = useState('')
  useEffect(() => { QRCode.toDataURL(joinUrl, { width: 400, margin: 1, errorCorrectionLevel: 'M' }).then(setQr) }, [joinUrl])
  const host = joinUrl.replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  return (
    <div className="pop" style={{ position: 'absolute', left: 12, top: 12, width: 180, zIndex: 60, textAlign: 'center' }}>
      <div style={{ background: '#fff', borderRadius: 14, padding: 6 }}>
        {qr && <img src={qr} alt="QR" style={{ width: 168, height: 168, display: 'block' }} />}
      </div>
      <div style={{ fontSize: 17, fontWeight: 800, marginTop: 4, textShadow: '0 2px 0 #1B1033', wordBreak: 'break-all' }}>{host}</div>
      <div style={{ fontSize: 14, opacity: 0.7 }}>Scan to join</div>
    </div>
  )
}

export function useFullscreen() {
  const [full, setFull] = useState(!!document.fullscreenElement)
  useEffect(() => {
    const on = () => setFull(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', on)
    return () => document.removeEventListener('fullscreenchange', on)
  }, [])
  const enter = () => { document.documentElement.requestFullscreen?.().catch(() => {}) }
  return { full, enter }
}
