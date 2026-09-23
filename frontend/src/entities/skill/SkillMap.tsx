import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { SkillRow } from '../../shared/api/types'
import { usePreferences } from '../../shared/lib/preferences'
import { Icon, Panel } from '../../shared/ui'
import { state } from './Skills'

export function SkillMap({ rows, skillsLink }: { rows: SkillRow[]; skillsLink: string }) {
  const { t, label } = usePreferences()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = rows.find(row => row.skill_id === selectedId)
  const gaps = rows.filter(row => row.gap !== null && row.gap > 0)
    .sort((a, b) => (b.gap ?? 0) - (a.gap ?? 0) || (a.name.ru || a.name.en).localeCompare(b.name.ru || b.name.en, 'ru'))
    .slice(0, 5)
  return <Panel className="sh-skill-map">
    <div className="sh-skill-map-head"><h2>{t('skillMap')}</h2><Link to={skillsLink} className="sh-text-button">{t('allSkills')} <Icon name="chevron" /></Link></div>
    {rows.length ? <div className="sh-skill-map-content"><div><div className="sh-matrix" aria-label={t('skillMap')}>{rows.map(row => <button type="button" key={row.skill_id} aria-label={`${label(row.name)}: ${t(state(row))}`} aria-pressed={selectedId === row.skill_id} onClick={() => setSelectedId(row.skill_id)}><span className={`sh-cell-mark sh-cell-${state(row)}`} /></button>)}</div><div className="sh-skill-legend">{(['covered', 'gaps', 'unknown', 'unrequired'] as const).map(value => <span key={value}><i className={`sh-cell-mark sh-cell-${value}`} />{t(value)}</span>)}</div>{selected && <div className="sh-selected-skill" role="status"><strong>{label(selected.name)}</strong><span>{t('current')}: {selected.current === null ? t('unknown') : selected.current} · {t('required')}: {selected.target === null ? t('unrequired') : selected.target} · {t('gap')}: {selected.gap === null ? t('noData') : selected.gap}</span></div>}</div><div className="sh-top-gaps"><h3>{t('deficits')}</h3>{gaps.length ? gaps.map(row => <div key={row.skill_id} className="sh-gap-row"><div><span>{label(row.name)}</span><span className="sh-number">{row.current} / {row.target}</span></div><div className="sh-level" aria-hidden="true"><span className="sh-level-target" style={{ width: `${(row.target ?? 0) * 20}%` }} /><span className="sh-level-current" style={{ width: `${(row.current ?? 0) * 20}%` }} /></div></div>) : <p className="sh-muted">{t('noKnownGaps')}</p>}</div></div> : <p className="sh-muted">{t('noData')}</p>}
  </Panel>
}
