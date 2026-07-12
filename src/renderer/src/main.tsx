import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { initTheme } from './stores/settings'
import './assets/fonts.css'
import './styles.css'

// stamp the resolved theme on <html> before first paint (story 14.1)
initTheme()

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
