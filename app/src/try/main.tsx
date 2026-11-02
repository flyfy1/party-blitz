import { createRoot } from 'react-dom/client'
import '../index.css'
import Try from './Try'

// No StrictMode: the local round clock runs in effects, same as the demo.
createRoot(document.getElementById('root')!).render(<Try />)
