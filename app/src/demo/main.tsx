import { createRoot } from 'react-dom/client'
import '../index.css'
import Demo from './Demo'

// No StrictMode: the simulation schedules timers in effects and must not be double-mounted.
createRoot(document.getElementById('root')!).render(<Demo />)
