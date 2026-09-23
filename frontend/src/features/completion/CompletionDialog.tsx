import type { Auth, Profile, RecommendationItem } from '../../shared/api/types'
import { usePreferences } from '../../shared/lib/preferences'
import { Dialog, ErrorState } from '../../shared/ui'

export function CompletionDialog({
  item,
  profile,
  role,
  busy,
  error,
  onClose,
  onConfirm,
}: {
  item: RecommendationItem
  profile: Profile
  role: Auth['role']
  busy: boolean
  error: unknown
  onClose: () => void
  onConfirm: () => void
}) {
  const { t, label } = usePreferences()
  return (
    <Dialog
      title={t(role === 'hr' ? 'confirmHr' : 'confirmTitle')}
      compact
      busy={busy}
      onClose={onClose}
      footer={
        <>
          <button
            className="sh-button sh-secondary"
            disabled={busy}
            onClick={onClose}
          >
            {t('cancel')}
          </button>
          <button
            className="sh-button sh-primary"
            disabled={busy}
            onClick={onConfirm}
          >
            {t(busy ? 'saving' : error ? 'retrySame' : 'confirmYes')}
          </button>
        </>
      }
    >
      <h3>{label(item.title)}</h3>
      <p className="sh-muted">{t('confirmHint')}</p>
      <div className="sh-confirm-changes">
        {item.preview.changes.map((change) => (
          <div key={change.skill_id}>
            <span>
              {label(
                profile.skill_rows.find(
                  (row) => row.skill_id === change.skill_id,
                )?.name || { ru: null, kk: null, en: change.skill_id },
              )}
            </span>
            <strong className="sh-number">
              {change.before} → {change.after}
            </strong>
          </div>
        ))}
      </div>
      {Boolean(error) && (
        <>
          <ErrorState error={error} />
          <p className="sh-muted">{t('safeRetry')}</p>
        </>
      )}
    </Dialog>
  )
}
