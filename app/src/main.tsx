import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import Phone from './phone/Phone'
import Screen from './host/Screen'

// Single entry: ?screen=1 renders the big screen (host), anything else is the phone.
const isScreen = new URLSearchParams(location.search).get('screen') === '1'

createRoot(document.getElementById('root')!).render(
  <StrictMode>{isScreen ? <Screen /> : <Phone />}</StrictMode>,
)
