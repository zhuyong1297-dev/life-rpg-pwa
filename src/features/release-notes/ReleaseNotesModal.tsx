import { Compass, Library, ShieldCheck } from 'lucide-react'

import { V5ModalSurface } from '../../prototype/v5/shared'
import { CURRENT_RELEASE_NOTES, CURRENT_RELEASE_NOTES_VERSION } from './releaseNotes'
import './release-notes.css'

export function ReleaseNotesModal({
  onLater,
  onAcknowledge,
  onOpenLibrary,
}: {
  onLater: () => void
  onAcknowledge: () => void
  onOpenLibrary: () => void
}) {
  const icons = [Compass, Library, ShieldCheck]

  return (
    <V5ModalSurface title={`V${CURRENT_RELEASE_NOTES_VERSION} 更新内容`} kicker="版本更新" onClose={onLater}>
      <div className="release-notes-content">
        <div className="release-notes-intro">
          <span>习惯与计划库</span>
          <strong>{CURRENT_RELEASE_NOTES.title}</strong>
          <p>{CURRENT_RELEASE_NOTES.summary}</p>
        </div>

        <ul className="release-notes-list">
          {CURRENT_RELEASE_NOTES.items.map((item, index) => {
            const Icon = icons[index]
            return (
              <li key={item.id}>
                <span className="release-notes-icon" aria-hidden="true"><Icon size={19} /></span>
                <div><strong>{item.title}</strong><p>{item.description}</p></div>
              </li>
            )
          })}
        </ul>

        <div className="release-notes-actions">
          <button className="release-notes-later" type="button" onClick={onLater}>稍后</button>
          <button className="release-notes-acknowledge" type="button" onClick={onAcknowledge}>知道了</button>
          <button className="release-notes-primary" type="button" onClick={onOpenLibrary}>查看推荐库</button>
        </div>
      </div>
    </V5ModalSurface>
  )
}
