import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Self-hosted fonts, latin only: DM Mono Regular for the button labels, VT323 for the digits.
import '@fontsource/dm-mono/latin-400.css'
import '@fontsource/vt323/latin-400.css'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
