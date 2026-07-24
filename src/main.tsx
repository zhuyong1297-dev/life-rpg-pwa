import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'

registerSW({ immediate: true })

async function bootstrap() {
  const isPreview = import.meta.env.MODE === 'preview'
  const imports: Promise<unknown>[] = [import('./styles.css')]
  if (isPreview) imports.push(import('./prototype/v5-live.css'))
  const [{ default: App }] = await Promise.all([import('./App'), ...imports])

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void bootstrap()
