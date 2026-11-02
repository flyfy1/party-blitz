import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import Phone from './phone/Phone'
import Screen from './host/Screen'

// Single entry: /screen (or ?screen=1) renders the big screen; everything else is the phone.
const params = new URLSearchParams(location.search)
const isScreen = location.pathname.replace(/\/+$/, '') === '/screen' || params.get('screen') === '1'

createRoot(document.getElementById('root')!).render(
  <StrictMode>{isScreen ? <Screen /> : <Phone />}</StrictMode>,
)
