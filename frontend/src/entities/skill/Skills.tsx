import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { SkillRow } from '../../shared/api/types'
import { usePreferences } from '../../shared/lib/preferences'
import { Disclosure, EmptyState, Icon, Panel } from '../../shared/ui'
export const state = (row: SkillRow) =>
  row.target === null
      ? 'unrequired'
    : row.current === null || row.gap === null
      ? 'unknown'
      : (row.gap || 0) > 0
        ? 'gaps'
        : 'covered'
export function Skills({ rows }: { rows: SkillRow[] }) {
  const { t, label, language } = usePreferences()
  const [params, setParams] = useSearchParams()
  const query = params.get('q') || '',
    filter = params.get('filter') || 'all'
  const [selected, setSelected] = useState(rows[0]?.skill_id)
  const current = rows.find((row) => row.skill_id === selected)
  const filtered = rows
    .filter(
      (row) =>
        (filter === 'all' || state(row) === filter) &&
        label(row.name)
          .toLocaleLowerCase(language)
          .includes(query.toLocaleLowerCase(language)),
    )
    .sort(
      (a, b) =>
        (b.gap || 0) - (a.gap || 0) ||
        label(a.name).localeCompare(label(b.name), language),
    )
  function update(key: string, value: string) {
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        next.set(key, value)
        return next
      },
      { replace: true },
    )
  }
  return (
    <Panel>
      <div className="sh-skills-tools">
        <label className="sh-search-field">
          <Icon name="search" />
          <input
            type="search"
            value={query}
            placeholder={t('skillSearch')}
            aria-label={t('skillSearch')}
            onChange={(event) => update('q', event.target.value)}
          />
        </label>
        <select
          aria-label={t('skills')}
          value={filter}
          onChange={(event) => update('filter', event.target.value)}
        >
          {(['all', 'gaps', 'covered', 'unknown', 'unrequired'] as const).map(
            (key) => (
              <option key={key} value={key}>
                {t(key)}
              </option>
            ),
          )}
        </select>
      </div>
      <div className="sh-skill-list">
        {filtered.map((row) => (
          <div key={row.skill_id} className="sh-skill-row">
            <div className="sh-skill-heading">
              <h3>{label(row.name)}</h3>
              <span className="sh-tag">{t(state(row))}</span>
            </div>
            <div className="sh-skill-numbers">
              <span>
                {t('current')}: <strong>{row.current ?? t('unknown')}</strong>
              </span>
              <span>
                {t('required')}: <strong>{row.target ?? '—'}</strong>
              </span>
              {row.gap !== null && row.gap > 0 && (
                <span>
                  {t('gap')}: {row.gap}
                </span>
              )}
            </div>
            <div className="sh-level" aria-hidden="true">
              {row.target !== null && <span className="sh-level-target" style={{ width: `${row.target * 20}%` }} />}
              {row.current !== null && <span className="sh-level-current" style={{ width: `${row.current * 20}%` }} />}
            </div>
          </div>
        ))}
      </div>
      {!filtered.length && (
        <EmptyState title={t('noResults')} description={t('changeSearch')} />
      )}
      <Disclosure title={t('allSkills')}>
        <div className="sh-matrix">
          {rows.map((row) => (
            <button
              key={row.skill_id}
              aria-label={`${label(row.name)}: ${t(state(row))}`}
              aria-pressed={row.skill_id === selected}
              onClick={() => setSelected(row.skill_id)}
            >
              <span className={`sh-cell-mark sh-cell-${state(row)}`} />
            </button>
          ))}
        </div>
        {current && (
          <p aria-live="polite">
            {label(current.name)} · {t('current')}:{' '}
            {current.current ?? t('unknown')} · {t('required')}:{' '}
            {current.target ?? '—'}
          </p>
        )}
      </Disclosure>
    </Panel>
  )
}
