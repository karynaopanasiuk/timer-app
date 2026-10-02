import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Self-hosted Inter Variable (weight axis). The package has no Latin-only stylesheet, but every
// subset has a unicode-range, so an English UI downloads only the Latin file.
import '@fontsource-variable/inter'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
