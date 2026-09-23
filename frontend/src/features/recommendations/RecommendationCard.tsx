import type {
  RecommendationItem,
  RecommendationResult,
  SkillRow,
} from '../../shared/api/types'
import { usePreferences, reasonKey } from '../../shared/lib/preferences'
import { Disclosure, Icon, Panel } from '../../shared/ui'

export function RecommendationCard({
  item,
  result,
  rows,
  onPreview,
  onComplete,
  onExclude,
  compact = false,
}: {
  item: RecommendationItem
  result: RecommendationResult
  rows: SkillRow[]
  onPreview: () => void
  onComplete: () => void
  onExclude: () => void
  compact?: boolean
}) {
  const { t, label, percent, number, language } = usePreferences()
  const before = item.preview.coverage_before,
    after = item.preview.coverage_after
  return (
    <Panel
      className={`sh-recommendation ${compact ? 'sh-recommendation-small' : ''}`}
    >
      <div className="sh-rec-meta">
        <span className="sh-tag">{t(item.type)}</span>
        <span className="sh-source">
          {t(result.source === 'llm' ? 'ai' : 'rules')}
          {result.source === 'deterministic_fallback' && (
            <small>
              {t(reasonKey(result.fallback_reason || 'unavailable'))}
            </small>
          )}
        </span>
      </div>
      <h3>{label(item.title)}</h3>
      <div className="sh-effect">
        <div>
          <span className="sh-muted">{t('current')}</span>
          <strong className="sh-number">{percent(before)}</strong>
        </div>
        <Icon name="arrow" />
        <div>
          <span className="sh-muted">{t('after')}</span>
          <strong className="sh-number">{percent(after)}</strong>
        </div>
        {before !== null && after !== null && (
          <span className="sh-delta">
            +{number(after - before)} {t('pp')}
          </span>
        )}
      </div>
      {!compact && (
        <div className="sh-rec-skills">
          {item.preview.changes.slice(0, 2).map((change) => (
            <div key={change.skill_id}>
              <span>
                {label(
                  rows.find((row) => row.skill_id === change.skill_id)
                    ?.name || { en: change.skill_id, ru: null, kk: null },
                )}
              </span>
              <span className="sh-number">
                {change.before} <Icon name="arrow" /> {change.after}
              </span>
            </div>
          ))}
          {item.preview.changes.length > 2 && (
            <small className="sh-muted">
              {t('moreSkills', { count: item.preview.changes.length - 2 })}
            </small>
          )}
        </div>
      )}
      <button
        className="sh-button sh-primary sh-wide"
        onClick={(event) => {
          event.currentTarget.focus()
          onPreview()
        }}
      >
        {t('preview')}
        <Icon name="arrow" />
      </button>
      <div className="sh-rec-actions">
        <button
          className="sh-text-button"
          onClick={(event) => {
            event.currentTarget.focus()
            onComplete()
          }}
        >
          {t('complete')}
        </button>
        <button className="sh-text-button" onClick={onExclude}>
          {t('another')}
        </button>
      </div>
      <Disclosure title={t('why')}>
        <p className="sh-muted">{t('coverageDisclaimer')}</p>
        {language !== 'ru' && (
          <p className="sh-catalog-note">{t('evidenceLanguage')}</p>
        )}
        {item.evidence.map((entry, i) => (
          <div key={i} className="sh-evidence">
            <p>{entry.text}</p>
            <Disclosure title={t('refs')}>
              <ul className="sh-refs">
                {entry.refs.map((ref) => (
                  <li key={ref}>{ref}</li>
                ))}
              </ul>
            </Disclosure>
          </div>
        ))}
      </Disclosure>
    </Panel>
  )
}
