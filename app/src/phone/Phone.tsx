// Placeholder – the phone client is built separately (see DESIGN.md §5, §6, §8).
export default function Phone() {
  const g = new URLSearchParams(location.search).get('g')
  return (
    <div style={{ height: '100%', display: 'grid', placeItems: 'center', textAlign: 'center', padding: 24 }}>
      <div>
        <div style={{ fontSize: 64 }}>⚡</div>
        <h1 style={{ fontSize: 40 }}>PARTY BLITZ</h1>
        <p style={{ opacity: 0.7, marginTop: 12 }}>{g ? `game ${g.slice(0, 8)}…` : 'Scan the QR code on the big screen'}</p>
      </div>
    </div>
  )
}
