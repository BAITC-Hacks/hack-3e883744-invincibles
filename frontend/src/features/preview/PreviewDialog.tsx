import { useEffect, useState } from 'react'
import { ApiError, api, isAbort } from '../../shared/api/client'
import type {
  EventAction,
  Preview,
  Profile,
  RecommendationItem,
} from '../../shared/api/types'
import { usePreferences } from '../../shared/lib/preferences'
import { Dialog, ErrorState, Skeleton } from '../../shared/ui'

export function PreviewDialog({
  profile,
  item,
  onClose,
  onStale,
  onComplete,
}: {
  profile: Profile
  item: RecommendationItem
  onClose: () => void
  onStale: () => void
  onComplete: () => void
}) {
  const { t, label, percent, number } = usePreferences()
  const alternatives = profile.available_events.filter(
    (event) => event.event_id !== item.event_id,
  )
  const [alternativeId, setAlternativeId] = useState(
    alternatives.some(event => event.event_id === item.comparison_event_id)
      ? item.comparison_event_id || ''
      : alternatives[0]?.event_id || '',
  )
  const [compare, setCompare] = useState(false)
  const [first, setFirst] = useState<Preview | null>(null)
  const [second, setSecond] = useState<Preview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<unknown>(null)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    const action = (event_id: string): EventAction => ({
      event_id,
      employee_version: profile.employee_version,
      dataset_version: profile.dataset_version,
    })
    setLoading(true)
    setError(null)
    setFirst(null)
    setSecond(null)
    Promise.all([
      api.preview(
        profile.employee.employee_id,
        action(item.event_id),
        controller.signal,
      ),
      compare && alternativeId
        ? api.preview(
            profile.employee.employee_id,
            action(alternativeId),
            controller.signal,
          )
        : Promise.resolve(null),
    ])
      .then(([a, b]) => {
        if (controller.signal.aborted) return
        if (
          [a, b].some(
            (value) =>
              value &&
              (value.employee_version !== profile.employee_version ||
                value.dataset_version !== profile.dataset_version),
          )
        ) {
          onStale()
          return
        }
        setFirst(a)
        setSecond(b)
      })
      .catch((cause) => {
        if (isAbort(cause)) return
        if (cause instanceof ApiError && cause.code === 'STALE_CONTEXT')
          onStale()
        else setError(cause)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [profile, item.event_id, alternativeId, compare, attempt, onStale])
  const ids = [
    ...new Set(
      [...(first?.changes || []), ...(second?.changes || [])].map(
        (row) => row.skill_id,
      ),
    ),
  ]
  const alternative = alternatives.find(
    (event) => event.event_id === alternativeId,
  )
  return (
    <Dialog
      title={t('previewTitle')}
      onClose={onClose}
      footer={
        <>
          <button className="sh-button sh-secondary" onClick={onClose}>
            {t('back')}
          </button>
          <button
            className="sh-button sh-primary"
            disabled={loading || !first}
            onClick={onComplete}
          >
            {t('completeA')}
          </button>
        </>
      }
    >
      <p className="sh-muted">{t('previewSafe')}</p>
      <div className="sh-preview-base">
        <span>{t('current')}</span>
        <strong className="sh-number">{percent(profile.coverage)}</strong>
        <span>
          {t('target')}: {profile.target_grade || t('noTarget')}
        </span>
      </div>
      <label className="sh-check">
        <input
          type="checkbox"
          checked={compare}
          onChange={(event) => setCompare(event.target.checked)}
          disabled={!alternatives.length}
        />
        {t('compare')}
      </label>
      {compare && (
        <label className="sh-field">
          {t('alternative')}
          <select
            value={alternativeId}
            onChange={(event) => setAlternativeId(event.target.value)}
          >
            {alternatives.map((event) => (
              <option key={event.event_id} value={event.event_id}>
                {label(event.title)}
              </option>
            ))}
          </select>
        </label>
      )}
      {!alternatives.length && <p className="sh-muted">{t('noAlternative')}</p>}
      {Boolean(error) && (
        <ErrorState
          error={error}
          onRetry={() => setAttempt((value) => value + 1)}
        />
      )}
      {loading ? (
        <Skeleton className="sh-skeleton-tall" />
      ) : (
        first && (
          <>
            <div
              className={`sh-comparison ${compare && second ? 'sh-comparison-double' : ''}`}
            >
              {[first, ...(compare && second ? [second] : [])].map(
                (preview, index) => (
                  <section key={index} className="sh-compare-column">
                    <span className="sh-tag">
                      {t(index === 0 ? 'variantA' : 'variantB')}
                    </span>
                    <h3>
                      {label(
                        index === 0
                          ? item.title
                          : alternative?.title || item.title,
                      )}
                    </h3>
                    <div className="sh-forecast">
                      <span className="sh-muted">{t('after')}</span>
                      <strong className="sh-number">
                        {percent(preview.coverage_after)}
                      </strong>
                      {preview.coverage_before !== null && preview.coverage_after !== null && <span className="sh-delta">+{number(preview.coverage_after - preview.coverage_before)} {t('pp')}</span>}
                    </div>
                    {ids.map((id) => {
                      const row = profile.skill_rows.find(
                        (skill) => skill.skill_id === id,
                      )
                      const change = preview.changes.find(
                        (skill) => skill.skill_id === id,
                      )
                      const before = row?.current ?? change?.before ?? null,
                        after = change?.after ?? before,
                        target = row?.target ?? change?.target ?? null
                      return (
                        <div className="sh-preview-skill" key={id}>
                          <strong>{row ? label(row.name) : id}</strong>
                          <div className="sh-skill-numbers">
                            <span>
                              {t('current')}: {before ?? t('unknown')}
                            </span>
                            <span>
                              {t('after')}: {after ?? t('unknown')}
                            </span>
                            <span>
                              {t('required')}: {target ?? '—'}
                            </span>
                            <span>{t('remainingGap')}: {change?.remaining_gap ?? row?.gap ?? t('noData')}</span>
                          </div>
                          <div className="sh-three-bars" aria-hidden="true">
                            <span style={before === null ? { visibility: 'hidden' } : { width: `${before * 20}%` }} />
                            <span style={after === null ? { visibility: 'hidden' } : { width: `${after * 20}%` }} />
                            <span style={target === null ? { visibility: 'hidden' } : { width: `${target * 20}%` }} />
                          </div>
                        </div>
                      )
                    })}
                    {preview.target_gain === 0 && (
                      <p className="sh-notice">{t('noGain')}</p>
                    )}
                  </section>
                ),
              )}
            </div>
            {compare && <p className="sh-muted">{t('compareHint')}</p>}
          </>
        )
      )}
    </Dialog>
  )
}
