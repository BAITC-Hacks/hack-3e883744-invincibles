import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom'
import { api, ApiError, isAbort } from '../shared/api/client'
import type {
  Auth,
  EventAction,
  HistoryRow,
  Profile,
  RecommendationItem,
  RecommendationResult,
} from '../shared/api/types'
import { usePreferences, reasonKey } from '../shared/lib/preferences'
import type { MessageKey } from '../shared/lib/messages'
import {
  AnimatedNumber,
  CatalogNote,
  Disclosure,
  EmptyState,
  ErrorState,
  Icon,
  PageHeader,
  Panel,
  Progress,
  Skeleton,
  Stat,
} from '../shared/ui'
import { DataTable, type Column } from '../shared/ui/DataTable'
import { Skills } from '../entities/skill/Skills'
import { SkillMap } from '../entities/skill/SkillMap'
import { RecommendationCard } from '../features/recommendations/RecommendationCard'
import { PreviewDialog } from '../features/preview/PreviewDialog'
import { CompletionDialog } from '../features/completion/CompletionDialog'

export function ProfilePage({ auth }: { auth: Auth }) {
  const { id } = useParams()
  const location = useLocation()
  const [params] = useSearchParams()
  const { t, label, percent, date } = usePreferences()
  const employeeId = auth.role === 'hr' ? id : auth.employee_id
  const requested =
    auth.role === 'hr' ? params.get('tab') : location.pathname.split('/')[2]
  const section =
    requested === 'skills' || requested === 'history' ? requested : 'overview'
  const [profile, setProfile] = useState<Profile | null>(null)
  const [profileError, setProfileError] = useState<unknown>(null)
  const [recommendations, setRecommendations] =
    useState<RecommendationResult | null>(null)
  const [recError, setRecError] = useState<unknown>(null)
  const [excluded, setExcluded] = useState<string[]>([])
  const [refresh, setRefresh] = useState(0)
  const [recAttempt, setRecAttempt] = useState(0)
  const [previewItem, setPreviewItem] = useState<RecommendationItem | null>(
    null,
  )
  const [confirmItem, setConfirmItem] = useState<RecommendationItem | null>(
    null,
  )
  const [confirmError, setConfirmError] = useState<unknown>(null)
  const [confirmBusy, setConfirmBusy] = useState(false)
  const [banner, setBanner] = useState<MessageKey | null>(null)
  const operation = useRef<{
    id: string
    key: string
    body: EventAction
  } | null>(null)
  const pending = useRef(false)
  const staleRecommendations = useRef(0)
  useEffect(() => {
    setExcluded([])
    setPreviewItem(null)
    setConfirmItem(null)
    setBanner(null)
    operation.current = null
    staleRecommendations.current = 0
  }, [employeeId])
  useEffect(() => {
    if (!employeeId) return
    const controller = new AbortController()
    setProfileError(null)
    setProfile(null)
    setRecommendations(null)
    api
      .profile(employeeId, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setProfile(value)
      })
      .catch((cause) => {
        if (!isAbort(cause)) setProfileError(cause)
      })
    return () => controller.abort()
  }, [employeeId, refresh])
  const stale = useCallback(() => {
    setPreviewItem(null)
    setConfirmItem(null)
    operation.current = null
    setBanner('stale')
    setRefresh((value) => value + 1)
  }, [])
  const retryStaleRecommendation = useCallback(() => {
    staleRecommendations.current += 1
    if (staleRecommendations.current === 1) stale()
    else setRecError(new ApiError(409, 'STALE_CONTEXT', 'Профиль изменился. Обновите данные и запросите рекомендации снова.'))
  }, [stale])
  useEffect(() => {
    if (!profile || !employeeId) return
    const controller = new AbortController()
    setRecError(null)
    setRecommendations(null)
    api
      .recommendations(employeeId, profile, excluded, controller.signal)
      .then((value) => {
        if (controller.signal.aborted) return
        if (value.employee_id !== employeeId ||
          value.employee_version !== profile.employee_version ||
          value.dataset_version !== profile.dataset_version ||
          value.items.some(item => item.preview.employee_version !== profile.employee_version || item.preview.dataset_version !== profile.dataset_version)) {
          retryStaleRecommendation()
          return
        }
        staleRecommendations.current = 0
        setRecommendations(value)
      })
      .catch((cause) => {
        if (isAbort(cause)) return
        if (cause instanceof ApiError && cause.code === 'STALE_CONTEXT') {
          retryStaleRecommendation()
          return
        }
        setRecError(cause)
      })
    return () => controller.abort()
  }, [employeeId, profile, excluded, recAttempt, retryStaleRecommendation])
  function beginComplete(item: RecommendationItem) {
    if (!employeeId || !profile) return
    const body = {
      event_id: item.event_id,
      employee_version: profile.employee_version,
      dataset_version: profile.dataset_version,
    }
    if (
      !operation.current ||
      operation.current.id !== employeeId ||
      JSON.stringify(operation.current.body) !== JSON.stringify(body)
    )
      operation.current = { id: employeeId, key: crypto.randomUUID(), body }
    setPreviewItem(null)
    setConfirmError(null)
    setConfirmItem(item)
  }
  async function confirm() {
    if (!operation.current || !confirmItem || pending.current) return
    pending.current = true
    setConfirmBusy(true)
    setConfirmError(null)
    const request = operation.current
    try {
      await api.complete(request.id, request.body, request.key)
      operation.current = null
      setConfirmItem(null)
      setPreviewItem(null)
      setExcluded([])
      setBanner('completionSaved')
      setRefresh((value) => value + 1)
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) stale()
      else setConfirmError(cause)
    } finally {
      pending.current = false
      setConfirmBusy(false)
    }
  }
  const sectionLink = (value: string) =>
    auth.role === 'hr'
      ? `/employees/${employeeId}${value === 'overview' ? '' : `?tab=${value}`}`
      : `/me${value === 'overview' ? '' : `/${value}`}`
  const columns: Column<HistoryRow>[] = [
    { key: 'activity', label: t('activity'), value: (row) => label(row.title) },
    { key: 'date', label: t('date'), value: (row) => date(row.occurred_at) },
    { key: 'status', label: t('status'), value: (row) => t(row.status) },
  ]
  const showItem = (item: RecommendationItem, compact = false) =>
    recommendations &&
    profile && (
      <RecommendationCard
        key={item.event_id}
        item={item}
        result={recommendations}
        rows={profile.skill_rows}
        compact={compact}
        onPreview={() => setPreviewItem(item)}
        onComplete={() => beginComplete(item)}
        onExclude={() =>
          setExcluded((values) =>
            values.includes(item.event_id)
              ? values
              : [...values, item.event_id],
          )
        }
      />
    )
  if (!employeeId)
    return <p className="sh-notice sh-error">{t('missingProfile')}</p>
  return (
    <>
      {auth.role === 'hr' && (
        <Link
          className="sh-back"
          to={
            typeof location.state?.from === 'string' &&
            location.state.from.startsWith('/hr')
              ? location.state.from
              : '/hr'
          }
        >
          {t('back')} · HR
        </Link>
      )}
      <PageHeader
        title={t(
          section === 'overview'
            ? auth.role === 'hr'
              ? 'profile'
              : 'myGrowth'
            : section,
        )}
        description={
          profile
            ? `${label(profile.role_name)} · ID ${profile.employee.employee_id} · ${profile.employee.grade}`
            : t('loading')
        }
      />
      {auth.role === 'hr' && (
        <nav className="sh-local-nav" aria-label={t('profile')}>
          {(['overview', 'skills', 'history'] as const).map((value) => (
            <Link
              key={value}
              aria-current={section === value ? 'page' : undefined}
              to={sectionLink(value)}
            >
              {t(value)}
            </Link>
          ))}
        </nav>
      )}
      {banner && (
        <div className="sh-notice sh-success" role="status">
          <span>{t(banner)}</span>
          <button
            className="sh-icon-button"
            aria-label={t('close')}
            onClick={() => setBanner(null)}
          >
            <Icon name="close" />
          </button>
        </div>
      )}
      {Boolean(profileError) && (
        <ErrorState
          error={profileError}
          onRetry={() => setRefresh((value) => value + 1)}
        />
      )}
      {!profile && !profileError && <Skeleton className="sh-skeleton-tall" />}
      {profile && section === 'overview' && (
        <>
          <div className="sh-profile-overview">
            <Panel className="sh-readiness">
              <div className="sh-readiness-grid">
                <div className="sh-readiness-coverage">
                  <h2>{t('coverage')}</h2>
                  <p className="sh-muted">
                    {profile.target_grade
                      ? t('coverageHint', { grade: profile.target_grade })
                      : t('noTarget')}
                  </p>
                  <strong className="sh-number sh-coverage-number">
                    <AnimatedNumber value={profile.coverage} format={percent} />
                  </strong>
                </div>
                <Stat label={t('deficits')} value={profile.skill_rows.filter(row => row.gap !== null && row.gap > 0).length} />
                <Stat label={t('completedCount')} value={profile.history.filter(row => row.status === 'completed').length} />
              </div>
              <Progress value={profile.coverage} label={t('coverage')} />
              <Disclosure title={t('details')}>
                <p className="sh-muted">{t('coverageDisclaimer')}</p>
              </Disclosure>
              {profile.state !== 'active' && (
                <p className="sh-notice">{t(reasonKey(profile.state))}</p>
              )}
            </Panel>
            <SkillMap rows={profile.skill_rows} skillsLink={sectionLink('skills')} />
            <div className="sh-next-step">
              <div className="sh-section-heading">
                <h2>{t('nextStep')}</h2>
                {excluded.length > 0 && (
                  <button
                    className="sh-text-button"
                    onClick={() => setExcluded([])}
                  >
                    {t('resetChoices')}
                  </button>
                )}
              </div>
              {!recommendations && !recError && (
                <Skeleton className="sh-skeleton-recommendation" />
              )}
              {Boolean(recError) && (
                <ErrorState
                  error={recError}
                  onRetry={() => {
                    if (recError instanceof ApiError && recError.code === 'STALE_CONTEXT') {
                      staleRecommendations.current = 0
                      setRefresh(value => value + 1)
                    } else setRecAttempt(value => value + 1)
                  }}
                />
              )}
              {recommendations &&
                (recommendations.items.length ? (
                  <>
                    {showItem(recommendations.items[0])}
                    {recommendations.items.length > 1 && (
                      <Disclosure
                        title={`${t('alternatives')} · ${recommendations.items.length - 1}`}
                        className="sh-alternatives"
                      >
                        <div className="sh-alternative-list">
                          {recommendations.items
                            .slice(1, 3)
                            .map((item) => showItem(item, true))}
                        </div>
                      </Disclosure>
                    )}
                  </>
                ) : (
                  <Panel>
                    <EmptyState
                      title={t('emptyStep')}
                      description={t(
                        reasonKey(
                          recommendations.no_step_reason ||
                            recommendations.status,
                        ),
                      )}
                    >
                      {recommendations.status === 'all_candidates_excluded' && (
                        <button
                          className="sh-button sh-secondary"
                          onClick={() => setExcluded([])}
                        >
                          {t('resetChoices')}
                        </button>
                      )}
                    </EmptyState>
                  </Panel>
                ))}
            </div>
          </div>
          <Panel className="sh-recent-history">
            <div className="sh-skill-map-head"><h2>{t('history')}</h2><Link className="sh-text-button" to={sectionLink('history')}>{t('allHistory')} <Icon name="chevron" /></Link></div>
            {profile.history.length ? <div className="sh-recent-list">{[...profile.history].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)).slice(0, 3).map(row => <div key={row.history_id}><span>{label(row.title)}</span><small>{date(row.occurred_at)} · {t(row.status)}</small></div>)}</div> : <p className="sh-muted">{t('noHistory')}</p>}
          </Panel>
        </>
      )}
      {profile && section === 'skills' && (
        <>
          <p className="sh-page-intro">{t('skillsHint')}</p>
          <Skills rows={profile.skill_rows} />
        </>
      )}
      {profile && section === 'history' && (
        <>
          <p className="sh-page-intro">{t('historyHint')}</p>
          <Panel>
            {profile.history.length ? (
              <DataTable
                rows={[...profile.history].sort((a, b) =>
                  b.occurred_at.localeCompare(a.occurred_at),
                )}
                columns={columns}
                getId={(row) => row.history_id}
                searchText={(row) => `${label(row.title)} ${t(row.status)}`}
                firstLabel={(row) => label(row.title)}
              />
            ) : (
              <EmptyState
                title={t('noHistory')}
                description={t('noHistoryHint')}
              >
                <Link
                  className="sh-button sh-secondary"
                  to={sectionLink('overview')}
                >
                  {t('overview')}
                </Link>
              </EmptyState>
            )}
          </Panel>
        </>
      )}
      <CatalogNote />
      {profile &&
        previewItem &&
        createPortal(
          <PreviewDialog
            profile={profile}
            item={previewItem}
            onClose={() => setPreviewItem(null)}
            onStale={stale}
            onComplete={() => beginComplete(previewItem)}
          />,
          document.body,
        )}
      {profile &&
        confirmItem &&
        createPortal(
          <CompletionDialog
            item={confirmItem}
            profile={profile}
            role={auth.role}
            busy={confirmBusy}
            error={confirmError}
            onClose={() => {
              if (!pending.current) setConfirmItem(null)
            }}
            onConfirm={confirm}
          />,
          document.body,
        )}
    </>
  )
}
