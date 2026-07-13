import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { initTheme } from './stores/settings'
import { initFonts } from './stores/fonts'
import './assets/fonts.css'
import './styles.css'

// stamp the resolved theme on <html> before first paint (story 14.1)
initTheme()
initFonts()

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
