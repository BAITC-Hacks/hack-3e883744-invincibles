import { useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api, ApiError } from '../shared/api/client'
import type { ImportCommit, ImportValidation } from '../shared/api/types'
import { usePreferences } from '../shared/lib/preferences'
import { Disclosure, ErrorState, Icon, PageHeader, Panel } from '../shared/ui'
import { existingIds, importedIds } from '../features/import/files'

export function ImportPage() {
  const { t, number, date } = usePreferences()
  const [employees, setEmployees] = useState<File | null>(null),
    [history, setHistory] = useState<File | null>(null)
  const [validation, setValidation] = useState<ImportValidation | null>(null),
    [result, setResult] = useState<ImportCommit | null>(null)
  const [newIds, setNewIds] = useState<string[]>([]),
    [replacedIds, setReplacedIds] = useState<string[]>([]),
    [idsKnown, setIdsKnown] = useState(false)
  const [validating, setValidating] = useState(false),
    [committing, setCommitting] = useState(false),
    [error, setError] = useState<unknown>(null)
  const pending = useRef(false)
  const reviewRef = useRef<HTMLElement>(null)
  function reset() {
    setValidation(null)
    setResult(null)
    setNewIds([])
    setReplacedIds([])
    setIdsKnown(false)
    setError(null)
  }
  async function validate(event: FormEvent) {
    event.preventDefault()
    if (!employees || !history || pending.current) return
    pending.current = true
    setValidating(true)
    reset()
    try {
      const ids = await importedIds(employees)
      const [known, report] = await Promise.all([
        existingIds().catch(() => null),
        api.validate(employees, history),
      ])
      setValidation(report)
      if (known) {
        setNewIds(ids.filter((id) => !known.has(id)))
        setReplacedIds(ids.filter((id) => known.has(id)))
        setIdsKnown(true)
      }
      requestAnimationFrame(() => {
        reviewRef.current?.focus()
        reviewRef.current?.scrollIntoView({ block: 'start' })
      })
    } catch (cause) {
      setError(cause)
    } finally {
      pending.current = false
      setValidating(false)
    }
  }
  async function commit() {
    if (!validation?.valid || !validation.import_id || pending.current) return
    pending.current = true
    setCommitting(true)
    setError(null)
    try {
      setResult(
        await api.commit(validation.import_id, validation.base_dataset_version),
      )
    } catch (cause) {
      setError(cause)
      if (cause instanceof ApiError && [409, 410].includes(cause.status))
        setValidation(null)
    } finally {
      pending.current = false
      setCommitting(false)
    }
  }
  const step = result ? 3 : validation ? 2 : 1
  return (
    <>
      <PageHeader title={t('importTitle')} description={t('importHint')} />
      <ol className="sh-stepper">
        {(['files', 'review', 'apply'] as const).map((key, index) => (
          <li key={key} aria-current={step === index + 1 ? 'step' : undefined}>
            <span>{index + 1}</span>
            {t(key)}
          </li>
        ))}
      </ol>
      <div className="sh-import-stack">
        {!result && (
          <Panel>
            <h2>{t('chooseFiles')}</h2>
            <form onSubmit={validate}>
              <fieldset disabled={validating || committing}>
                <div className="sh-file-grid">
                  {[
                    {
                      key: 'employees',
                      label: t('employeeFile'),
                      file: employees,
                      set: setEmployees,
                      accept: '.json,application/json',
                      format: 'employees.json',
                    },
                    {
                      key: 'history',
                      label: t('historyFile'),
                      file: history,
                      set: setHistory,
                      accept: '.csv,text/csv',
                      format: 'activity_history.csv',
                    },
                  ].map((field) => (
                    <div className="sh-file" key={field.key}>
                      <strong>{field.label}</strong>
                      <small className="sh-muted">{field.format}</small>
                      <label className="sh-file-control">
                        <input
                          type="file"
                          accept={field.accept}
                          required
                          aria-label={field.label}
                          onChange={(event) => {
                            field.set(event.target.files?.[0] || null)
                            reset()
                          }}
                        />
                        <span className="sh-button sh-secondary">
                          <Icon name="upload" />
                          {t('chooseFile')}
                        </span>
                      </label>
                      <span className="sh-file-name">
                        {field.file
                          ? `${field.file.name} · ${number(field.file.size / 1024)} KiB`
                          : t('noFile')}
                      </span>
                    </div>
                  ))}
                </div>
                <button
                  className="sh-button sh-primary"
                  disabled={!employees || !history || validating || committing}
                >
                  {t(validating ? 'validating' : 'validate')}
                </button>
              </fieldset>
              <p className="sh-muted sh-file-hint">{t('fileHint')}</p>
            </form>
          </Panel>
        )}
        {validation && (
          <section
            className="sh-panel sh-import-review"
            ref={reviewRef}
            tabIndex={-1}
          >
            <h2>{t('reviewTitle')}</h2>
            <div
              className={`sh-notice ${validation.valid ? 'sh-success' : 'sh-error'}`}
              role="status"
            >
              <p>
                {t(validation.valid ? 'validFiles' : 'invalidFiles')}
                {validation.valid && !result && ` ${t('notApplied')}`}
              </p>
            </div>
            <div className="sh-import-summary">
              {[
                ['newProfiles', validation.summary.new_employees],
                ['replacedProfiles', validation.summary.replaced_employees],
                ['newHistory', validation.summary.new_history],
                ['unchanged', validation.summary.unchanged_history],
              ].map(([key, value]) => (
                <div key={key}>
                  <strong className="sh-number">{value}</strong>
                  <span>{t(key as 'newProfiles')}</span>
                </div>
              ))}
            </div>
            {validation.errors.length > 0 && (
              <div className="sh-import-errors">
                {validation.errors.map((entry, index) => (
                  <div key={index}>
                    <strong>
                      {entry.file || '—'} · {entry.path}
                    </strong>
                    <p>{entry.message}</p>
                    <code>{entry.code}</code>
                  </div>
                ))}
              </div>
            )}
            {validation.valid && !result && (
              <>
                {validation.summary.replaced_employees > 0 && (
                  <div className="sh-notice sh-warning">
                    {t('replacementWarning')}
                  </div>
                )}
                {idsKnown && replacedIds.length > 0 && (
                  <Disclosure title={t('replacedIds')}>
                    <p className="sh-break-words">{replacedIds.join(', ')}</p>
                  </Disclosure>
                )}
                {!idsKnown && validation.summary.replaced_employees > 0 && (
                  <p>{t('idsUnavailable')}</p>
                )}
                {validation.expires_at && (
                  <p className="sh-muted">
                    {t('expires', { date: date(validation.expires_at, true) })}
                  </p>
                )}
                <button
                  className="sh-button sh-primary"
                  disabled={committing}
                  onClick={commit}
                >
                  {t(committing ? 'applying' : 'confirmImport')}
                </button>
              </>
            )}
          </section>
        )}
        {result && (
          <Panel>
            <div className="sh-notice sh-success" role="status">
              {t(result.applied ? 'imported' : 'alreadyImported')}{' '}
              {t('dataset', { version: result.dataset_version })}
            </div>
            <div className="sh-import-links">
              {newIds.length ? (
                newIds.map((id) => (
                  <Link
                    className="sh-button sh-secondary"
                    key={id}
                    to={`/employees/${id}`}
                  >
                    {t('openProfile', { id })}
                  </Link>
                ))
              ) : (
                <Link className="sh-button sh-secondary" to="/hr">
                  {t('employeeSearch')}
                </Link>
              )}
            </div>
          </Panel>
        )}
        {Boolean(error) && (
          <>
            <ErrorState error={error} />
            {!validation && <p>{t('checkAgain')}</p>}
          </>
        )}
      </div>
    </>
  )
}
