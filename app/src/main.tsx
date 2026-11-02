import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import Phone from './phone/Phone'
import Screen from './host/Screen'

const isScreen = location.pathname.replace(/\/+$/, '') === '/screen'

createRoot(document.getElementById('root')!).render(
  <StrictMode>{isScreen ? <Screen /> : <Phone />}</StrictMode>,
)
