import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'

registerSW({ immediate: true })

async function bootstrap() {
  const isPreviewPrototype = import.meta.env.MODE === 'preview'
  const [{ default: App }] = await Promise.all([
    isPreviewPrototype ? import('./prototype/V5Prototype') : import('./App'),
    isPreviewPrototype ? import('./prototype/v5-prototype.css') : import('./styles.css'),
  ])

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void bootstrap()
