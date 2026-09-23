import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { api, isAbort } from '../shared/api/client'
import type { EmployeeList, HrOverview } from '../shared/api/types'
import { usePreferences, reasonKey } from '../shared/lib/preferences'
import type { MessageKey } from '../shared/lib/messages'
import {
  CatalogNote,
  Disclosure,
  EmptyState,
  ErrorState,
  Icon,
  PageHeader,
  Panel,
  Skeleton,
  Stat,
} from '../shared/ui'
import { DataTable, type Column } from '../shared/ui/DataTable'
const reasonNames: Record<string, MessageKey> = {
  no_next_grade: 'lastGrade',
  target_met: 'goalMet',
  all_useful_completed: 'usefulCompleted',
  no_catalog_coverage: 'noActivities',
  incomplete_skills: 'incomplete',
}
export function HrPage() {
  const { t, label, number, share, language } = usePreferences()
  const [params, setParams] = useSearchParams()
  const location = useLocation()
  const tab = params.get('tab') || 'gaps'
  const employeeQuery = params.get('employee')
  const [overview, setOverview] = useState<HrOverview | null>(null)
  const [error, setError] = useState<unknown>(null),
    [refresh, setRefresh] = useState(0)
  const [query, setQuery] = useState(employeeQuery || '')
  const [results, setResults] = useState<EmployeeList | null>(null)
  const [searchError, setSearchError] = useState<unknown>(null),
    [searching, setSearching] = useState(false),
    [searchAttempt, setSearchAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setError(null)
    api
      .overview(controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setOverview(value)
      })
      .catch((cause) => {
        if (!isAbort(cause)) setError(cause)
      })
    return () => controller.abort()
  }, [refresh])
  useEffect(() => {
    if (employeeQuery === null) {
      setResults(null)
      return
    }
    setQuery(employeeQuery)
    setSearching(true)
    setSearchError(null)
    const controller = new AbortController()
    api
      .employees(employeeQuery, 0, 50, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setResults(value)
      })
      .catch((cause) => {
        if (!isAbort(cause)) setSearchError(cause)
      })
      .finally(() => {
        if (!controller.signal.aborted) setSearching(false)
      })
    return () => controller.abort()
  }, [employeeQuery, searchAttempt])
  function search(event: FormEvent) {
    event.preventDefault()
    if (query.trim() === employeeQuery) setSearchAttempt((value) => value + 1)
    else
      setParams(
        (previous) => {
          const next = new URLSearchParams(previous)
          next.set('employee', query.trim())
          return next
        },
        { replace: true, preventScrollReset: true },
      )
  }
  const gaps = overview
    ? [...overview.skill_gaps].sort(
        (a, b) =>
          b.affected_count - a.affected_count ||
          label(a.name).localeCompare(label(b.name), language),
      )
    : []
  const gapColumns: Column<HrOverview['skill_gaps'][number]>[] = [
    { key: 'skill', label: t('skill'), value: (row) => label(row.name) },
    {
      key: 'affected',
      label: t('affected'),
      value: (row) => row.affected_count,
    },
    {
      key: 'assessed',
      label: t('assessed'),
      value: (row) => row.assessed_count,
    },
    {
      key: 'share',
      label: t('share'),
      value: (row) => share(row.affected_share),
    },
    {
      key: 'gap',
      label: t('meanGap'),
      value: (row) =>
        row.mean_gap === null ? t('noData') : number(row.mean_gap),
    },
  ]
  const noStepColumns: Column<HrOverview['no_step'][number]>[] = [
    { key: 'employee', label: t('employee'), value: (row) => row.employee_id },
    {
      key: 'reason',
      label: t('reason'),
      value: (row) => t(reasonNames[row.reason] || reasonKey(row.reason)),
    },
    {
      key: 'open',
      label: t('profile'),
      value: (row) => (
        <Link
          className="sh-text-button"
          to={`/employees/${row.employee_id}`}
          state={{ from: location.pathname + location.search }}
        >
          {t('open')}
          <Icon name="chevron" />
        </Link>
      ),
    },
  ]
  if (overview?.no_step.some((row) => row.role_name))
    noStepColumns.splice(1, 0, {
      key: 'role',
      label: t('role'),
      value: (row) => (row.role_name ? label(row.role_name) : t('noData')),
    })
  const participationColumns: Column<HrOverview['participation'][number]>[] = [
    { key: 'activity', label: t('activity'), value: (row) => label(row.title) },
    { key: 'completed', label: t('completed'), value: (row) => row.completed },
    { key: 'skipped', label: t('skipped'), value: (row) => row.skipped },
    { key: 'declined', label: t('declined'), value: (row) => row.declined },
    {
      key: 'participants',
      label: t('participants'),
      value: (row) => row.unique_participants,
    },
    {
      key: 'share',
      label: t('completionShare'),
      value: (row) => share(row.completion_share),
    },
  ]
  return (
    <>
      <PageHeader
        title={t('team')}
        description={t('teamHint')}
        aside={
          <Link className="sh-button sh-secondary" to="/hr/import">
            <Icon name="upload" />
            {t('import')}
          </Link>
        }
      />
      <Panel className="sh-employee-search">
        <form onSubmit={search}>
          <label className="sh-field" htmlFor="employee-query">
            {t('employeeSearch')}
          </label>
          <div className="sh-search-row">
            <input
              id="employee-query"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="E0001"
            />
            <button className="sh-button sh-primary" disabled={searching}>
              {t(searching ? 'searching' : 'search')}
            </button>
          </div>
        </form>
        {Boolean(searchError) && (
          <ErrorState
            error={searchError}
            onRetry={() => setSearchAttempt((value) => value + 1)}
          />
        )}
        {results && (
          <div className="sh-search-results">
            {results.items.length ? (
              results.items.map((row) => (
                <Link
                  key={row.employee_id}
                  to={`/employees/${row.employee_id}`}
                  state={{ from: location.pathname + location.search }}
                >
                  <strong>{row.employee_id}</strong>
                  <span>
                    {row.role_name ? `${label(row.role_name)} · ` : ''}
                    {row.grade}
                  </span>
                  <Icon name="chevron" />
                </Link>
              ))
            ) : (
              <p>{t('employeeNotFound')}</p>
            )}
            {results.total > results.items.length && (
              <p className="sh-muted">
                {t('searchLimit', {
                  count: results.items.length,
                  total: results.total,
                })}
              </p>
            )}
          </div>
        )}
      </Panel>
      {Boolean(error) && (
        <ErrorState
          error={error}
          onRetry={() => setRefresh((value) => value + 1)}
        />
      )}
      {!overview && !error && <Skeleton className="sh-skeleton-tall" />}
      {overview && (
        <>
          <div className="sh-stats">
            <Stat label={t('employees')} value={overview.employees_total} />
            <Stat
              label={t('noActivities')}
              value={
                overview.no_step.filter(
                  (row) => row.reason === 'no_catalog_coverage',
                ).length
              }
            />
            <Stat
              label={t('incomplete')}
              value={
                overview.no_step.filter(
                  (row) => row.reason === 'incomplete_skills',
                ).length
              }
            />
          </div>
          <Panel className="sh-priorities">
            <h2>{t('topGaps')}</h2>
            <p className="sh-muted">{t('topGapsHint')}</p>
            <div className="sh-gap-chart">
              {gaps.slice(0, 5).map((row) => (
                <div key={row.skill_id}>
                  <div className="sh-gap-chart-heading">
                    <strong>{label(row.name)}</strong>
                    <span className="sh-number">
                      {share(row.affected_share)}
                    </span>
                  </div>
                  <div className="sh-chart-bar" aria-hidden="true">
                    <span
                      style={{
                        width: `${gaps[0]?.affected_count ? (row.affected_count / gaps[0].affected_count) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  <small className="sh-muted">
                    {t('affectedOf', {
                      affected: row.affected_count,
                      assessed: row.assessed_count,
                    })}
                  </small>
                </div>
              ))}
            </div>
            {!gaps.length && <p>{t('noGaps')}</p>}
          </Panel>
          <details
            className="sh-panel sh-report"
            open={params.has('tab') || undefined}
          >
            <summary>
              <span>
                <h2>{t('teamDetails')}</h2>
                <small className="sh-muted">
                  {t('deficitTab')} · {t('noStepTab')} · {t('participation')}
                </small>
              </span>
              <Icon name="down" />
            </summary>
            <div className="sh-report-content">
              <div
                className="sh-tabs"
                role="group"
                aria-label={t('teamDetails')}
              >
                {[
                  ['gaps', 'deficitTab'],
                  ['no-step', 'noStepTab'],
                  ['participation', 'participation'],
                ].map(([value, key]) => (
                  <button
                    key={value}
                    aria-pressed={tab === value}
                    onClick={() =>
                      setParams(
                        (previous) => {
                          const next = new URLSearchParams(previous)
                          next.set('tab', value)
                          next.delete('q')
                          next.delete('page')
                          next.delete('sort')
                          return next
                        },
                        { replace: true, preventScrollReset: true },
                      )
                    }
                  >
                    {t(key as MessageKey)}
                  </button>
                ))}
              </div>
              {tab === 'gaps' && (
                <>
                  <p className="sh-table-description">{t('shareHint')}</p>
                  <DataTable
                    rows={gaps}
                    columns={gapColumns}
                    getId={(row) => row.skill_id}
                    searchText={(row) => label(row.name)}
                    firstLabel={(row) => label(row.name)}
                  />
                </>
              )}
              {tab === 'no-step' && (
                <>
                  <p className="sh-table-description">{t('neutralState')}</p>
                  <Disclosure title={t('reason')}>
                    <dl className="sh-reason-counts">
                      {Object.entries(reasonNames).map(([key, message]) => (
                        <div key={key}>
                          <dt>{t(message)}</dt>
                          <dd>
                            {
                              overview.no_step.filter(
                                (row) => row.reason === key,
                              ).length
                            }
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </Disclosure>
                  <DataTable
                    rows={overview.no_step}
                    columns={noStepColumns}
                    getId={(row) => row.employee_id}
                    searchText={(row) =>
                      `${row.employee_id} ${t(reasonNames[row.reason] || reasonKey(row.reason))}`
                    }
                    firstLabel={(row) => row.employee_id}
                  />
                </>
              )}
              {tab === 'participation' && (
                <>
                  <p className="sh-table-description">
                    {t('participationHint')}
                  </p>
                  <DataTable
                    rows={overview.participation}
                    columns={participationColumns}
                    getId={(row) => row.event_id}
                    searchText={(row) => label(row.title)}
                    firstLabel={(row) => label(row.title)}
                  />
                </>
              )}
              {!['gaps', 'no-step', 'participation'].includes(tab) && (
                <EmptyState title={t('noResults')} />
              )}
            </div>
          </details>
        </>
      )}
      <CatalogNote />
    </>
  )
}
