export default function Phone() {
  const g = new URLSearchParams(location.search).get('g')
  return (
    <div style={{ height: '100%', display: 'grid', placeItems: 'center', textAlign: 'center', padding: 24 }}>
      <div>
        <div style={{ fontSize: 64 }}>⚡</div>
        <h1 className="cn" style={{ fontSize: 40 }}>PARTY BLITZ</h1>
        <p style={{ opacity: 0.7, marginTop: 12 }}>{g ? `game ${g.slice(0, 8)}…` : '手机端 · 等待二维码'}</p>
      </div>
    </div>
  )
}
