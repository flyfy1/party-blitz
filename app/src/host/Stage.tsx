import { useEffect, useState, type ReactNode } from 'react'

const W = 1920, H = 1080
const calc = () => Math.min(window.innerWidth / W, window.innerHeight / H)

/** Fixed 1920×1080 stage, scaled to fit the window. #stage-inner is the shake target. */
export function Stage({ children }: { children: ReactNode }) {
  const [scale, setScale] = useState(calc)
  useEffect(() => {
    const on = () => setScale(calc())
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  return (
    <div className="stage-root">
      <div className="blob b0" /><div className="blob b1" /><div className="blob b2" />
      <div className="stage" style={{ transform: `translate(-50%, -50%) scale(${scale})` }}>
        <div id="stage-inner" className="stage-inner">{children}</div>
      </div>
    </div>
  )
}
