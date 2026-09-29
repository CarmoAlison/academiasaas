import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { installGlobalErrorHandlers } from './services/logService'
import './styles/global.css'

installGlobalErrorHandlers()

// Após um novo deploy, os arquivos antigos (chunks com hash) deixam de existir.
// Quem estava com o sistema aberto recarrega uma vez para pegar a versão nova.
window.addEventListener('vite:preloadError', (event) => {
  const KEY = 'academia.reloadedForNewVersion'
  const last = Number(sessionStorage.getItem(KEY) || 0)
  if (Date.now() - last > 10_000) {
    event.preventDefault()
    sessionStorage.setItem(KEY, String(Date.now()))
    window.location.reload()
  }
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
