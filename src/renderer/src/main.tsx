import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

function App(): React.JSX.Element {
  return (
    <main style={{ fontFamily: 'system-ui', padding: '2rem' }}>
      <h1>Loredex Desktop</h1>
      <p>Walking skeleton — core host transport check runs in the console (ping/pong).</p>
    </main>
  )
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
