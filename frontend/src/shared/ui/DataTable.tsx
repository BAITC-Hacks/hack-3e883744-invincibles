import { useSearchParams } from 'react-router-dom'
import type { ReactNode } from 'react'
import { usePreferences } from '../lib/preferences'
import { EmptyState, Icon } from '.'

export type Column<T> = {
  key: string
  label: string
  value: (row: T) => ReactNode
}
export function DataTable<T>({
  rows,
  columns,
  getId,
  searchText,
  firstLabel,
  prefix = '',
}: {
  rows: T[]
  columns: Column<T>[]
  getId: (row: T) => string
  searchText: (row: T) => string
  firstLabel: (row: T) => string
  prefix?: string
}) {
  const { t, language } = usePreferences()
  const [params, setParams] = useSearchParams()
  const query = params.get(`${prefix}q`) || ''
  const requestedSize = Number(params.get(`${prefix}size`))
  const size = [10, 25, 50].includes(requestedSize) ? requestedSize : 10
  const sorted = params.get(`${prefix}sort`) === 'name'
  const filtered = rows.filter((row) =>
    searchText(row)
      .toLocaleLowerCase(language)
      .includes(query.toLocaleLowerCase(language)),
  )
  if (sorted)
    filtered.sort((a, b) =>
      firstLabel(a).localeCompare(firstLabel(b), language),
    )
  const pages = Math.max(1, Math.ceil(filtered.length / size))
  const page = Math.min(
    pages,
    Math.max(1, Number(params.get(`${prefix}page`)) || 1),
  )
  const visible = filtered.slice((page - 1) * size, page * size)
  function update(key: string, value: string, reset = true) {
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        value ? next.set(prefix + key, value) : next.delete(prefix + key)
        if (reset) next.delete(prefix + 'page')
        return next
      },
      { replace: true, preventScrollReset: true },
    )
  }
  return (
    <div className="sh-data-table">
      <div className="sh-table-tools">
        <label className="sh-search-field">
          <Icon name="search" />
          <input
            type="search"
            aria-label={t('tableSearch')}
            placeholder={t('tableSearch')}
            value={query}
            onChange={(event) => update('q', event.target.value)}
          />
        </label>
        <label className="sh-sort">
          <span>{t('sort')}</span>
          <select
            aria-label={t('sort')}
            value={sorted ? 'name' : 'priority'}
            onChange={(event) => update('sort', event.target.value)}
          >
            <option value="priority">{t('byPriority')}</option>
            <option value="name">{t('byName')}</option>
          </select>
        </label>
      </div>
      {visible.length ? (
        <>
          <div className="sh-desktop-table sh-table-scroll">
            <table>
              <thead>
                <tr>
                  {columns.map((column) => (
                    <th key={column.key} scope="col">
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr key={getId(row)}>
                    {columns.map((column) => (
                      <td key={column.key}>{column.value(row)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="sh-mobile-table">
            {visible.map((row) => (
              <details key={getId(row)}>
                <summary>
                  <span>{firstLabel(row)}</span>
                  <Icon name="down" />
                </summary>
                <dl>
                  {columns.slice(1).map((column) => (
                    <div key={column.key}>
                      <dt>{column.label}</dt>
                      <dd>{column.value(row)}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            ))}
          </div>
        </>
      ) : (
        <EmptyState title={t('noResults')} description={t('changeSearch')} />
      )}
      <div className="sh-pagination">
        <label>
          {t('rows')}
          <select
            value={size}
            onChange={(event) => update('size', event.target.value)}
          >
            {[10, 25, 50].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <span>
          {t('pageRange', {
            from: filtered.length ? (page - 1) * size + 1 : 0,
            to: Math.min(page * size, filtered.length),
            total: filtered.length,
          })}
        </span>
        <div>
          <button
            className="sh-icon-button sh-previous"
            disabled={page === 1}
            aria-label={t('previous')}
            onClick={() => update('page', String(page - 1), false)}
          >
            <Icon name="chevron" />
          </button>
          <button
            className="sh-icon-button"
            disabled={page === pages}
            aria-label={t('next')}
            onClick={() => update('page', String(page + 1), false)}
          >
            <Icon name="chevron" />
          </button>
        </div>
      </div>
    </div>
  )
}
