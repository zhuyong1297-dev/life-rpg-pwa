import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { getRuntimeBrowserEnvironment } from './browser'

interface BeforeInstallPromptChoice {
  outcome: 'accepted' | 'dismissed'
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<BeforeInstallPromptChoice>
}

export type InstallPromptOutcome = 'accepted' | 'dismissed' | 'installed' | 'unavailable'

export function usePwaInstall() {
  const promptRef = useRef<BeforeInstallPromptEvent | undefined>(undefined)
  const [promptAvailable, setPromptAvailable] = useState(false)
  const [installed, setInstalled] = useState(() => getRuntimeBrowserEnvironment().standalone)

  useEffect(() => {
    const capturePrompt = (event: Event) => {
      event.preventDefault()
      promptRef.current = event as BeforeInstallPromptEvent
      setPromptAvailable(true)
    }
    const markInstalled = () => {
      promptRef.current = undefined
      setPromptAvailable(false)
      setInstalled(true)
    }

    window.addEventListener('beforeinstallprompt', capturePrompt)
    window.addEventListener('appinstalled', markInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', capturePrompt)
      window.removeEventListener('appinstalled', markInstalled)
    }
  }, [])

  const promptInstall = useCallback(async (): Promise<InstallPromptOutcome> => {
    if (installed) return 'installed'
    const prompt = promptRef.current
    if (!prompt) return 'unavailable'
    try {
      await prompt.prompt()
      const choice = await prompt.userChoice
      promptRef.current = undefined
      setPromptAvailable(false)
      return choice.outcome
    } catch {
      promptRef.current = undefined
      setPromptAvailable(false)
      return 'unavailable'
    }
  }, [installed])

  const environment = useMemo(
    () => getRuntimeBrowserEnvironment(promptAvailable, installed),
    [installed, promptAvailable],
  )

  return {
    environment,
    installed,
    canPromptInstall: promptAvailable && !installed,
    promptInstall,
  }
}
