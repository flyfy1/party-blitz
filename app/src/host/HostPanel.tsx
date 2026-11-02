import { useEffect, useState } from 'react'

export interface PanelProps {
  visible: boolean
  phase: string
  roundIdx: number
  totalRounds: number
  players: number
  channel: string
  rpcMs: number
  bots: { joined: number; failed: number; total: number } | null
  lastError: string
  gameId: string
  canStart: boolean
  startLabel: string
  onStart: () => void
  onSkip: () => void
  onReset: () => void
  isFullscreen: boolean
  onFullscreen: () => void
  presets: { id: string; label: string }[]
  presetId: string
  schedule: string[]
  onPreset: (id: string) => void
}

export function HostPanel(p: PanelProps) {
  const [confirmReset, setConfirmReset] = useState(false)
  useEffect(() => { if (!p.visible) setConfirmReset(false) }, [p.visible])
  if (!p.visible) return null
  return (
    <div className="panel">
      <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 6 }}>Host panel <span style={{ opacity: 0.5, fontWeight: 400 }}>(H to hide)</span></div>
      {!p.isFullscreen && <button onClick={p.onFullscreen}>⛶ Fullscreen</button>}
      {p.phase === 'lobby' && (
        <div style={{ margin: '6px 0' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            {p.presets.map((x) => (
              <button key={x.id} data-role={`preset-${x.id}`} onClick={() => p.onPreset(x.id)} style={{ margin: 0, padding: 6, fontSize: 13, background: x.id === p.presetId ? '#FFD633' : 'rgba(255,255,255,0.15)', color: x.id === p.presetId ? '#1B1033' : '#fff' }}>{x.label}</button>
            ))}
          </div>
          <div style={{ opacity: 0.7, fontSize: 12, marginTop: 4 }}>{p.schedule.length} rounds: {p.schedule.join(' → ')} (last ×2)</div>
        </div>
      )}
      <button data-role="start" disabled={!p.canStart} onClick={p.onStart}>{p.startLabel}</button>
      <button onClick={p.onSkip} disabled={p.phase === 'lobby' || p.phase === 'final' || p.phase === 'boot'}>Skip phase</button>
      {confirmReset
        ? <button className="danger" onClick={p.onReset}>Confirm reset (new game + QR)</button>
        : <button className="danger" onClick={() => setConfirmReset(true)}>Reset game</button>}
      <div className="kv"><span>Phase</span><span>{p.phase}{p.roundIdx >= 0 ? ` · round ${p.roundIdx + 1}/${p.totalRounds}` : ''}</span></div>
      <div className="kv"><span>Players</span><span>{p.players}</span></div>
      <div className="kv"><span>Channel</span><span style={{ color: p.channel === 'SUBSCRIBED' ? '#A7F3C0' : '#FFB199' }}>{p.channel}</span></div>
      <div className="kv"><span>RPC avg</span><span>{p.rpcMs} ms</span></div>
      {p.bots && <div className="kv"><span>Bots</span><span>{p.bots.joined}/{p.bots.total}{p.bots.failed ? ` (${p.bots.failed} failed)` : ''}</span></div>}
      <div className="kv"><span>Game</span><span>{p.gameId.slice(0, 8)}</span></div>
      {p.lastError && <div className="err">⚠ {p.lastError}</div>}
    </div>
  )
}
