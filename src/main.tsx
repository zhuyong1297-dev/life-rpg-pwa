import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'

if ('serviceWorker' in navigator) {
  const wasControlled = Boolean(navigator.serviceWorker.controller)
  let reloadingForUpdate = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (wasControlled && !reloadingForUpdate) {
      reloadingForUpdate = true
      window.location.reload()
    }
  })
}

registerSW({ immediate: true })

async function bootstrap() {
  const imports: Promise<unknown>[] = [import('./styles.css'), import('./prototype/v5-live.css')]
  const [{ default: App }] = await Promise.all([import('./App'), ...imports])

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void bootstrap()
