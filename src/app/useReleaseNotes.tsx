import { useEffect, useRef, useState } from 'react'

import { acknowledgeReleaseNotes } from '../db'
import { CURRENT_RELEASE_NOTES_VERSION, ReleaseNotesModal } from '../features/release-notes'
import { errorMessage } from './shared-ui'

export function useReleaseNotes({
  ready,
  growthDomainsReady,
  newcomerEligible,
  autoOpenAllowed,
  lastSeenVersion,
  refresh,
  onError,
  onOpenRewards,
}: {
  ready: boolean
  growthDomainsReady: boolean
  newcomerEligible: boolean
  autoOpenAllowed: boolean
  lastSeenVersion?: string
  refresh: () => Promise<void>
  onError: (message: string) => void
  onOpenRewards: () => void
}) {
  const [open, setOpen] = useState(false)
  const checkedThisSession = useRef(false)

  useEffect(() => {
    if (checkedThisSession.current || !ready || !growthDomainsReady) return
    if (newcomerEligible) {
      checkedThisSession.current = true
      return
    }
    if (!autoOpenAllowed) return
    checkedThisSession.current = true
    if (!newcomerEligible && lastSeenVersion !== CURRENT_RELEASE_NOTES_VERSION) setOpen(true)
  }, [autoOpenAllowed, growthDomainsReady, lastSeenVersion, newcomerEligible, ready])

  async function acknowledge(after?: () => void) {
    try {
      await acknowledgeReleaseNotes(CURRENT_RELEASE_NOTES_VERSION)
      await refresh()
      setOpen(false)
      after?.()
    } catch (error) {
      onError(errorMessage(error))
    }
  }

  return {
    open: () => setOpen(true),
    modal: open ? (
      <ReleaseNotesModal
        onLater={() => setOpen(false)}
        onAcknowledge={() => void acknowledge()}
        onOpenRewards={() => void acknowledge(onOpenRewards)}
      />
    ) : null,
  }
}
