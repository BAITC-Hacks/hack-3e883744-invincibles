import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom'
import { ApiError, api, errorText, isAbort } from './api'
import type { Auth, AvailableEvent, EventAction, HrOverview, ImportCommit, ImportValidation, Preview, Profile, RecommendationItem, RecommendationResult, SkillRow } from './types'

const label = (value: { ru: string | null; en: string }) => value.ru || value.en
const percent = (value: number | null) => value === null ? 'нет данных' : `${value.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}%`
const share = (value: number | null) => value === null ? 'нет данных' : percent(value * 100)
const eventType: Record<string, string> = { course: 'Курс', workshop: 'Практикум', mentoring: 'Наставничество' }
const historyStatus: Record<string, string> = { completed: 'Выполнено', skipped: 'Пропущено', declined: 'Отклонено' }
const fallbackReason: Record<string, string> = {
  timeout: 'AI не ответил вовремя', unavailable: 'AI недоступен', invalid_output: 'ответ AI не прошёл проверку',
  busy: 'AI занят', context_too_large: 'контекст превысил лимит', rate_limited: 'лимит запросов',
  call_limit: 'достигнут лимит обращений',
}
const emptyReason: Record<string, string> = {
  no_next_grade: 'Следующий грейд не задан. Доступные активности остаются в истории и каталоге.',
  target_met: 'Требования по навыкам покрыты. Повышение рассматривается отдельно.',
  incomplete_skills: 'Для рекомендации не хватает данных об уровнях навыков.',
  no_catalog_coverage: 'В каталоге нет активности, закрывающей текущий дефицит.',
  all_useful_completed: 'Все полезные активности уже выполнены.',
  audience_or_missing_skills: 'Подходящие активности недоступны для этого профиля или не хватает данных о навыках.',
  all_candidates_excluded: 'Все варианты скрыты в текущем просмотре. Сбросьте выбор, чтобы увидеть их снова.',
  no_eligible_events: 'Сейчас нет подходящего шага.',
}
const noStepReason: Record<string, string> = { ...emptyReason, no_catalog_coverage: 'Нет покрытия каталогом', all_useful_completed: 'Все полезные события выполнены', audience_or_missing_skills: 'Ограничения аудитории или данных', no_next_grade: 'Последний грейд', target_met: 'Требования покрыты', incomplete_skills: 'Неполные данные' }
const evidenceTitle: Record<string, string> = { GRADE_TARGET: 'Цель', SKILL_GAP: 'Навыки', HISTORY: 'История', PREFERENCE: 'Предпочтение' }

function Shell({ auth, onLogout, children }: { auth: Auth; onLogout: () => Promise<void>; children: ReactNode }) {
  return <div className="app-shell">
    <header className="topbar">
      <div className="topbar-inner">
        <Link className="brand" to={auth.role === 'hr' ? '/hr' : '/me'} aria-label="ШАГРА — главная">
          <span className="brand-mark">Ш</span><span>ШАГРА<small>следующий шаг виден заранее</small></span>
        </Link>
        <nav className="nav" aria-label="Главная навигация">
          {auth.role === 'hr' ? <>
            <Link to="/hr">Аналитика</Link><Link to="/hr/import">Импорт</Link>
          </> : <Link to="/me">Мой профиль</Link>}
        </nav>
        <div className="account"><span className="account-chip">{auth.role === 'hr' ? 'HR' : auth.employee_id}</span><button className="text-button on-dark" onClick={onLogout}>Выйти</button></div>
      </div>
    </header>
    <main className="page">{children}</main>
  </div>
}

function Login({ onLogin }: { onLogin: (auth: Auth) => void }) {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true); setError('')
    try {
      const auth = await api.login(username.trim(), password)
      onLogin(auth)
      navigate(auth.role === 'hr' ? '/hr' : '/me', { replace: true })
    } catch (cause) { setError(errorText(cause)) }
    finally { setBusy(false) }
  }
  return <main className="login-page">
    <div className="login-intro">
      <span className="eyebrow light">КАРЬЕРНЫЙ МАРШРУТ</span>
      <h1>Увидь, что изменит твой следующий шаг.</h1>
      <p>Проверь пользу активности, сравни варианты и реши, что делать дальше.</p>
      <div className="login-step"><span>01</span> Понять разрыв <span>→</span> <span>02</span> Примерить шаг <span>→</span> <span>03</span> Увидеть результат</div>
    </div>
    <form className="login-card" onSubmit={submit}>
      <span className="eyebrow">ВХОД В ШАГРУ</span>
      <h2>Продолжить развитие</h2>
      <p className="muted">Войдите под учётной записью сотрудника или HR.</p>
      <label>Логин<input autoComplete="username" required value={username} onChange={e => setUsername(e.target.value)} /></label>
      <label>Пароль<input type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} /></label>
      {error && <div className="notice error" role="alert">{error}</div>}
      <button className="button primary wide" type="submit" disabled={busy}>{busy ? 'Входим…' : 'Войти →'}</button>
      <p className="demo-note">Демонстрационные учётные записи, только синтетические данные: <strong>employee / demo-employee</strong> и <strong>hr / demo-hr</strong>.</p>
    </form>
  </main>
}

function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`card ${className}`}>{children}</section>
}
function SectionHead({ kicker, title, aside }: { kicker: string; title: string; aside?: ReactNode }) {
  return <div className="section-head"><div><span className="eyebrow">{kicker}</span><h2>{title}</h2></div>{aside}</div>
}
function Retry({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <div className="notice error" role="alert"><span>{message}</span><button className="text-button" onClick={onRetry}>Повторить</button></div>
}
function ProgressBar({ value }: { value: number | null }) {
  return <div className="progress-track" role="meter" aria-label="Покрытие требований навыками" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value ?? undefined} aria-valuetext={percent(value)}>
    <div className="progress-fill" style={{ width: `${Math.max(0, Math.min(value ?? 0, 100))}%` }} />
  </div>
}

function Trajectory({ profile }: { profile: Profile }) {
  const gaps = profile.skill_rows.filter(row => row.gap !== null && row.gap > 0)
  const unknown = profile.skill_rows.filter(row => row.current === null && row.target !== null)
  return <Card className="trajectory">
    <span className="eyebrow">ВАША ТРАЕКТОРИЯ</span>
    <div className="grade-line"><span className="grade-now">{profile.employee.grade}<small>сейчас</small></span><span className="grade-arrow">→</span><span className="grade-next">{profile.target_grade || 'Не задан'}<small>следующий грейд</small></span></div>
    {profile.target_grade ? <>
      <div className="coverage-line"><span>Соответствие навыков</span><strong>{percent(profile.coverage)}</strong></div>
      <ProgressBar value={profile.coverage} />
      <p className="microcopy">Соответствие навыков, не решение о повышении.</p>
      {profile.state === 'target_met' && <div className="notice success">Требования по навыкам покрыты. Повышение рассматривается отдельно.</div>}
      {unknown.length > 0 && <div className="notice warn"><strong>Не хватает сведений:</strong> {unknown.map(row => label(row.name)).join(', ')}. Неизвестный уровень не считается нулём.</div>}
      {gaps.length > 0 && <div className="gap-summary"><span className="gap-count">{gaps.length}</span><span>навыков требуют развития<small>Откройте таблицу ниже, чтобы увидеть каждый разрыв.</small></span></div>}
    </> : <div className="notice neutral">Следующий грейд не задан. Карьерная ступень не предполагается автоматически.</div>}
  </Card>
}

function SkillsHistory({ profile }: { profile: Profile }) {
  return <div className="detail-stack">
    <Card>
      <details className="disclosure"><summary><span><span className="eyebrow">ПОДРОБНОСТИ</span><strong>Навыки и требования</strong></span><span>{profile.skill_rows.length} навыков <b>⌄</b></span></summary>
        {profile.skill_rows.length ? <div className="table-scroll"><table><thead><tr><th>Навык</th><th>Сейчас</th><th>Нужно</th><th>Разрыв</th></tr></thead><tbody>{profile.skill_rows.map(row => <tr key={row.skill_id}><td>{label(row.name)}</td><td>{row.current ?? 'неизвестно'}</td><td>{row.target ?? '—'}</td><td>{row.gap === null ? 'неизвестно' : row.gap === 0 ? 'покрыто' : `+${row.gap}`}</td></tr>)}</tbody></table></div> : <p className="empty-inline">Навыки пока не добавлены.</p>}
      </details>
    </Card>
    <Card>
      <details className="disclosure"><summary><span><span className="eyebrow">ПРОЙДЕННЫЙ ПУТЬ</span><strong>История активностей</strong></span><span>{profile.history.length} записей <b>⌄</b></span></summary>
        {profile.history.length ? <div className="table-scroll"><table><thead><tr><th>Активность</th><th>Дата</th><th>Статус</th></tr></thead><tbody>{profile.history.map(row => <tr key={row.history_id}><td>{label(row.title)}</td><td>{new Date(row.occurred_at).toLocaleDateString('ru-RU')}</td><td>{historyStatus[row.status]}</td></tr>)}</tbody></table></div> : <p className="empty-inline">Истории участия пока нет. Это не влияет на возможность примерить активность.</p>}
      </details>
    </Card>
  </div>
}

function RecommendationCard({ item, source, rows, onPreview, onComplete, onExclude }: {
  item: RecommendationItem; source: RecommendationResult['source']
  rows: SkillRow[]
  onPreview: () => void; onComplete: () => void; onExclude: () => void
}) {
  return <Card className="recommendation">
    <div className="rec-top"><span className="rank">0{item.rank}</span><span className="pill">{eventType[item.type]}</span></div>
    <h3>{label(item.title)}</h3>
    <p className="rec-subtitle">Следующий шаг для развития навыков</p>
    <div className="gain-list">
      {item.preview.changes.length ? item.preview.changes.map(change => <div className="gain-row" key={change.skill_id}><span>{label(rows.find(row => row.skill_id === change.skill_id)?.name || { ru: null, en: change.skill_id })}</span><strong>{change.before} → {change.after}{change.delta > 0 && <em>+{change.delta}</em>}</strong></div>) : <p>Расчёт не показывает изменения навыков.</p>}
    </div>
    <div className="rec-evidence">
      <span className="eyebrow">ПОЧЕМУ ЭТОТ ШАГ</span>
      {item.evidence.map((entry, index) => <div className="evidence-row" key={index}><span className="evidence-dot" /><span><strong>{evidenceTitle[entry.kind] || entry.kind}</strong>{entry.text}</span></div>)}
      <details className="refs"><summary>Основания в данных</summary><ul>{item.evidence.flatMap(entry => entry.refs).map((ref, index) => <li key={index}>{ref}</li>)}</ul></details>
    </div>
    <div className="rec-foot">
      <span className={source === 'llm' ? 'source-tag ai' : 'source-tag fallback'}>{source === 'llm' ? 'Выбор AI' : 'Резервный расчёт'}</span>
      <div className="rec-actions"><button className="button amber" onClick={onPreview}>Примерить</button><button className="button outline" onClick={onComplete}>Выполнено</button></div>
    </div>
    <button className="quiet-link" onClick={onExclude}>Другой вариант →</button>
  </Card>
}

function useDialog(onClose: () => void) {
  const dialogRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    dialogRef.current?.focus()
    const listener = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'Tab' && dialogRef.current) {
        const nodes = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button, select, input, a[href], [tabindex]:not([tabindex="-1"])')).filter(node => !node.hasAttribute('disabled'))
        if (!nodes.length) return
        if (event.shiftKey && document.activeElement === nodes[0]) { event.preventDefault(); nodes[nodes.length - 1].focus() }
        if (!event.shiftKey && document.activeElement === nodes[nodes.length - 1]) { event.preventDefault(); nodes[0].focus() }
      }
    }
    document.addEventListener('keydown', listener)
    return () => { document.removeEventListener('keydown', listener); previous?.focus() }
  }, [onClose])
  return dialogRef
}

function PreviewDetails({ preview, rows }: { preview: Preview; rows: SkillRow[] }) {
  return <>
    <div className="before-after"><div><small>СЕЙЧАС</small><strong>{percent(preview.coverage_before)}</strong></div><span>→</span><div><small>ПОСЛЕ</small><strong>{percent(preview.coverage_after)}</strong></div></div>
    <p className="microcopy">Покрытие требований навыками после расчётного шага.</p>
    <div className="change-list">{preview.changes.map(change => <div className="change-row" key={change.skill_id}>
      <span>{label(rows.find(row => row.skill_id === change.skill_id)?.name || { ru: null, en: change.skill_id })}<small>{change.target === null ? 'цель не задана' : `требуется ${change.target}; остаётся ${change.remaining_gap ?? 'неизвестно'}`}</small></span>
      <strong>{change.before} <span>→</span> {change.after}</strong>
    </div>)}</div>
    {preview.target_gain === 0 && <div className="notice warn">Эта активность сейчас не закрывает целевой разрыв.</div>}
  </>
}

function PreviewDialog({ profile, item, onClose, onStale, onComplete }: {
  profile: Profile; item: RecommendationItem; onClose: () => void; onStale: () => void; onComplete: () => void
}) {
  const initial = item.comparison_event_id && item.comparison_event_id !== item.event_id
    ? item.comparison_event_id : profile.available_events.find(event => event.event_id !== item.event_id)?.event_id || ''
  const [alternativeId, setAlternativeId] = useState(initial)
  const [first, setFirst] = useState<Preview | null>(null)
  const [second, setSecond] = useState<Preview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const dialogRef = useDialog(onClose)
  useEffect(() => {
    const controller = new AbortController()
    const action = (event_id: string): EventAction => ({ event_id, employee_version: profile.employee_version, dataset_version: profile.dataset_version })
    setLoading(true); setError(''); setFirst(null); setSecond(null)
    Promise.all([
      api.preview(profile.employee.employee_id, action(item.event_id), controller.signal),
      alternativeId ? api.preview(profile.employee.employee_id, action(alternativeId), controller.signal) : Promise.resolve(null),
    ]).then(([a, b]) => {
      if (a.employee_version !== profile.employee_version || a.dataset_version !== profile.dataset_version ||
        (b && (b.employee_version !== profile.employee_version || b.dataset_version !== profile.dataset_version))) {
        onStale(); return
      }
      setFirst(a); setSecond(b)
    }).catch(cause => {
      if (isAbort(cause)) return
      if (cause instanceof ApiError && cause.code === 'STALE_CONTEXT') { onStale(); return }
      setError(errorText(cause))
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [profile, item.event_id, alternativeId, attempt, onStale])
  const alternative = profile.available_events.find(event => event.event_id === alternativeId)
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
    <div className="drawer" role="dialog" aria-modal="true" aria-labelledby="preview-title" tabIndex={-1} ref={dialogRef}>
      <div className="dialog-head"><div><span className="eyebrow">БЕЗ ЗАПИСИ В ПРОФИЛЬ</span><h2 id="preview-title">Примерка шага</h2></div><button className="icon-button" aria-label="Закрыть примерку" onClick={onClose}>×</button></div>
      <p className="muted">Оба варианта рассчитаны от одного текущего состояния. Их эффекты не складываются.</p>
      <div className="compare-grid">
        <section className="compare-card selected"><span className="eyebrow">ВАРИАНТ A · РЕКОМЕНДАЦИЯ</span><h3>{label(item.title)}</h3>{loading ? <div className="skeleton" /> : first && <PreviewDetails preview={first} rows={profile.skill_rows} />}</section>
        <section className="compare-card"><span className="eyebrow">ВАРИАНТ B · АЛЬТЕРНАТИВА</span>
          {profile.available_events.filter(event => event.event_id !== item.event_id).length ? <>
            <label className="select-label">Другая активность<select value={alternativeId} onChange={e => setAlternativeId(e.target.value)}>
              {profile.available_events.filter(event => event.event_id !== item.event_id).map(event => <option key={event.event_id} value={event.event_id}>{label(event.title)}</option>)}
            </select></label>
            <h3>{alternative ? label(alternative.title) : 'Выберите активность'}</h3>
            {loading ? <div className="skeleton" /> : second && <PreviewDetails preview={second} rows={profile.skill_rows} />}
          </> : <p className="empty-inline">Другой доступной активности пока нет.</p>}
        </section>
      </div>
      {error && <Retry message={error} onRetry={() => setAttempt(n => n + 1)} />}
      <div className="dialog-actions"><button className="button outline" onClick={onClose}>Вернуться</button><button className="button primary" onClick={onComplete} disabled={!first || loading}>Подтвердить выполнение →</button></div>
      <p className="microcopy">Примерка не меняет профиль и историю.</p>
    </div>
  </div>
}

function CompletionDialog({ item, preview, role, busy, error, onClose, onConfirm }: {
  item: RecommendationItem | AvailableEvent; preview: Preview | null; role: Auth['role']; busy: boolean; error: string
  onClose: () => void; onConfirm: () => void
}) {
  const dialogRef = useDialog(onClose)
  return <div className="modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose() }}>
    <div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-title" tabIndex={-1} ref={dialogRef}>
      <span className="eyebrow">ПОДТВЕРЖДЕНИЕ</span><h2 id="confirm-title">{role === 'hr' ? 'HR подтверждает выполнение' : 'Отметить выполнение?'}</h2>
      <p>Активность <strong>{label(item.title)}</strong> будет записана в историю. Навыки обновятся по расчёту сервера.</p>
      {preview && <div className="confirm-impact"><span>Ожидаемый эффект</span><strong>{preview.changes.length ? preview.changes.map(change => `${change.skill_id.replace(/^SK_/, '')} ${change.before}→${change.after}`).join(' · ') : 'Без изменения навыков'}</strong></div>}
      {error && <div className="notice error" role="alert">{error}</div>}
      <div className="dialog-actions"><button className="button outline" disabled={busy} onClick={onClose}>Отмена</button><button className="button primary" disabled={busy} onClick={onConfirm}>{busy ? 'Сохраняем…' : error ? 'Повторить с тем же запросом' : 'Да, выполнено'}</button></div>
    </div>
  </div>
}

function ProfilePage({ auth }: { auth: Auth }) {
  const params = useParams()
  const employeeId = auth.role === 'hr' ? params.id : auth.employee_id
  const [profile, setProfile] = useState<Profile | null>(null)
  const [profileError, setProfileError] = useState('')
  const [profileLoading, setProfileLoading] = useState(true)
  const [recommendations, setRecommendations] = useState<RecommendationResult | null>(null)
  const [recError, setRecError] = useState('')
  const [recLoading, setRecLoading] = useState(false)
  const [excluded, setExcluded] = useState<string[]>([])
  const [refresh, setRefresh] = useState(0)
  const [recAttempt, setRecAttempt] = useState(0)
  const [previewItem, setPreviewItem] = useState<RecommendationItem | null>(null)
  const [confirmItem, setConfirmItem] = useState<RecommendationItem | null>(null)
  const [confirmError, setConfirmError] = useState('')
  const [confirmBusy, setConfirmBusy] = useState(false)
  const [banner, setBanner] = useState('')
  const operationKeys = useRef(new Map<string, string>())
  useEffect(() => { setExcluded([]); setPreviewItem(null); setConfirmItem(null); setBanner('') }, [employeeId])
  useEffect(() => {
    if (!employeeId) return
    const controller = new AbortController()
    setProfileLoading(true); setProfileError(''); setProfile(null); setRecommendations(null)
    api.profile(employeeId, controller.signal).then(setProfile).catch(cause => { if (!isAbort(cause)) setProfileError(errorText(cause)) }).finally(() => { if (!controller.signal.aborted) setProfileLoading(false) })
    return () => controller.abort()
  }, [employeeId, refresh])
  useEffect(() => {
    if (!profile || !employeeId) return
    const controller = new AbortController()
    setRecLoading(true); setRecError(''); setRecommendations(null)
    api.recommendations(employeeId, profile, excluded, controller.signal).then(setRecommendations).catch(cause => {
      if (isAbort(cause)) return
      if (cause instanceof ApiError && cause.code === 'STALE_CONTEXT') { setBanner('Данные профиля изменились. Обновляем рекомендации.'); setRefresh(n => n + 1); return }
      setRecError(errorText(cause))
    }).finally(() => { if (!controller.signal.aborted) setRecLoading(false) })
    return () => controller.abort()
  }, [employeeId, profile, excluded, recAttempt])
  function stale() { setPreviewItem(null); setConfirmItem(null); setBanner('Версия профиля изменилась. Данные обновлены — примерите шаг ещё раз.'); setRefresh(n => n + 1) }
  function beginComplete(item: RecommendationItem) { setPreviewItem(null); setConfirmError(''); setConfirmItem(item) }
  async function confirm() {
    if (!profile || !employeeId || !confirmItem || confirmBusy) return
    const action: EventAction = { event_id: confirmItem.event_id, employee_version: profile.employee_version, dataset_version: profile.dataset_version }
    const operation = `${employeeId}:${action.event_id}:${action.employee_version}:${action.dataset_version}`
    let key = operationKeys.current.get(operation)
    if (!key) { key = crypto.randomUUID(); operationKeys.current.set(operation, key) }
    setConfirmBusy(true); setConfirmError('')
    try {
      await api.complete(employeeId, action, key)
      operationKeys.current.delete(operation)
      setConfirmItem(null); setPreviewItem(null); setExcluded([])
      setBanner('Выполнение записано. Профиль, история и рекомендации обновляются.')
      setRefresh(n => n + 1)
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) { stale() }
      else setConfirmError(`${errorText(cause)} Можно повторить тот же запрос без двойного начисления.`)
    } finally { setConfirmBusy(false) }
  }
  if (!employeeId) return <div className="notice error">Для этой учётной записи не указан профиль сотрудника.</div>
  return <div>
    {auth.role === 'hr' && <Link className="back-link" to="/hr">← Вернуться к аналитике</Link>}
    <div className="page-heading"><div><span className="eyebrow">{auth.role === 'hr' ? 'ПРОФИЛЬ СОТРУДНИКА' : 'ВАШ ПРОФИЛЬ'}</span><h1>{profile ? label(profile.role_name) : 'Карьерный маршрут'}</h1><p>Конкретные шаги к следующему уровню и их ожидаемый эффект.</p></div>{profile && <span className="identity-chip">ID {profile.employee.employee_id} · {profile.employee.grade}</span>}</div>
    {banner && <div className="notice success banner" role="status">{banner}<button className="notice-close" aria-label="Скрыть сообщение" onClick={() => setBanner('')}>×</button></div>}
    {profileLoading && <div className="profile-grid"><div className="skeleton tall" /><div className="skeleton tall" /></div>}
    {profileError && <Retry message={profileError} onRetry={() => setRefresh(n => n + 1)} />}
    {profile && <div className="profile-grid">
      <div className="profile-side"><Trajectory profile={profile} /><SkillsHistory profile={profile} /></div>
      <div className="recommendations-block">
        <SectionHead kicker="ПОДХОДЯЩИЕ АКТИВНОСТИ" title="Ваш следующий шаг" aside={excluded.length > 0 && <button className="text-button" onClick={() => setExcluded([])}>Сбросить выбор</button>} />
        {recLoading && <div aria-label="Загружаем рекомендации" className="rec-skeletons"><div className="skeleton rec" /><div className="skeleton rec" /></div>}
        {recError && <Retry message={recError} onRetry={() => setRecAttempt(n => n + 1)} />}
        {recommendations && <>
          {recommendations.source === 'deterministic_fallback' && <div className="notice warn" role="status">Резервный расчёт: {fallbackReason[recommendations.fallback_reason || ''] || 'AI сейчас недоступен'}. Карточки построены по проверяемым правилам каталога.</div>}
          {recommendations.status === 'ready' ? <div className="rec-grid">{recommendations.items.map(item => <RecommendationCard key={item.event_id} item={item} source={recommendations.source} rows={profile.skill_rows}
            onPreview={() => setPreviewItem(item)} onComplete={() => beginComplete(item)} onExclude={() => setExcluded(ids => [...ids, item.event_id])} />)}</div>
            : <Card className="empty-card"><span className="empty-symbol">↗</span><h3>Подходящего шага пока нет</h3><p>{emptyReason[recommendations.no_step_reason || recommendations.status] || emptyReason.no_eligible_events}</p>{recommendations.status === 'all_candidates_excluded' && <button className="button outline" onClick={() => setExcluded([])}>Показать варианты</button>}</Card>}
        </>}
      </div>
    </div>}
    {profile && previewItem && <PreviewDialog profile={profile} item={previewItem} onClose={() => setPreviewItem(null)} onStale={stale} onComplete={() => beginComplete(previewItem)} />}
    {confirmItem && <CompletionDialog item={confirmItem} preview={confirmItem.preview} role={auth.role} busy={confirmBusy} error={confirmError} onClose={() => { if (!confirmBusy) setConfirmItem(null) }} onConfirm={confirm} />}
  </div>
}

function HrPage() {
  const [overview, setOverview] = useState<HrOverview | null>(null)
  const [error, setError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Awaited<ReturnType<typeof api.employees>> | null>(null)
  const [searchError, setSearchError] = useState('')
  const [searching, setSearching] = useState(false)
  useEffect(() => { const controller = new AbortController(); setError(''); api.overview(controller.signal).then(setOverview).catch(cause => { if (!isAbort(cause)) setError(errorText(cause)) }); return () => controller.abort() }, [refresh])
  async function search(event: FormEvent) {
    event.preventDefault(); setSearching(true); setSearchError('')
    try { setResults(await api.employees(query.trim())) } catch (cause) { setSearchError(errorText(cause)) }
    finally { setSearching(false) }
  }
  return <div>
    <div className="page-heading"><div><span className="eyebrow">HR · ОБЗОР</span><h1>Где нужен следующий шаг</h1><p>Дефициты навыков, сотрудники без подходящей активности и участие в каталоге.</p></div><Link className="button primary" to="/hr/import">Импортировать данные →</Link></div>
    <Card className="search-card"><form onSubmit={search}><label htmlFor="employee-search">Найти сотрудника по ID</label><div className="search-row"><input id="employee-search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Например, E0001" /><button className="button primary" disabled={searching}>{searching ? 'Ищем…' : 'Найти'}</button></div></form>
      {searchError && <p className="error-text" role="alert">{searchError}</p>}
      {results && <div className="search-results">{results.items.length ? results.items.map(item => <Link key={item.employee_id} to={`/employees/${item.employee_id}`}>{item.employee_id}<span>{item.role_id} · {item.grade} →</span></Link>) : <p>Сотрудник не найден.</p>}{results.total > results.items.length && <small>Показаны первые {results.items.length} из {results.total}. Уточните ID для поиска.</small>}</div>}
    </Card>
    {error && <Retry message={error} onRetry={() => setRefresh(n => n + 1)} />}
    {!overview && !error && <div className="skeleton tall" />}
    {overview && <div className="hr-sections">
      <Card><SectionHead kicker="01 · ДЕФИЦИТЫ" title="Каких навыков не хватает" aside={<span className="subtle-stat">{overview.employees_total} сотрудников</span>} />
        <p className="table-caption">Доля среди сотрудников, у которых навык требуется и его уровень известен.</p>
        <div className="table-scroll"><table><thead><tr><th>Навык</th><th>С дефицитом</th><th>Оценено</th><th>Доля</th><th>Средний разрыв</th></tr></thead><tbody>{overview.skill_gaps.map(row => <tr key={row.skill_id}><td>{label(row.name)}</td><td>{row.affected_count}</td><td>{row.assessed_count}</td><td>{share(row.affected_share)}</td><td>{row.mean_gap === null ? 'нет данных' : row.mean_gap.toLocaleString('ru-RU', { maximumFractionDigits: 1 })}</td></tr>)}</tbody></table></div>
        {!overview.skill_gaps.length && <p className="empty-inline">Дефицитов пока нет.</p>}
      </Card>
      <Card><SectionHead kicker="02 · БЕЗ ШАГА" title="Кому каталог не помог" />
        <p className="table-caption">Последний грейд и покрытые требования показаны как отдельные причины, не как проблема сотрудника.</p>
        <div className="table-scroll"><table><thead><tr><th>ID</th><th>Роль</th><th>Причина</th><th /></tr></thead><tbody>{overview.no_step.map(row => <tr key={row.employee_id}><td>{row.employee_id}</td><td>{row.role_id}</td><td>{noStepReason[row.reason] || row.reason}</td><td><Link to={`/employees/${row.employee_id}`}>Открыть →</Link></td></tr>)}</tbody></table></div>
        {!overview.no_step.length && <p className="empty-inline">Для всех профилей есть подходящие шаги.</p>}
      </Card>
      <Card><SectionHead kicker="03 · УЧАСТИЕ" title="Как используют активности" />
        <p className="table-caption">Доля выполнений от суммы выполненных, пропущенных и отклонённых записей.</p>
        <div className="table-scroll"><table><thead><tr><th>Активность</th><th>Выполнено</th><th>Пропущено</th><th>Отклонено</th><th>Участников</th><th>Доля выполнений</th></tr></thead><tbody>{overview.participation.map(row => <tr key={row.event_id}><td>{label(row.title)}</td><td>{row.completed}</td><td>{row.skipped}</td><td>{row.declined}</td><td>{row.unique_participants}</td><td>{share(row.completion_share)}</td></tr>)}</tbody></table></div>
        {!overview.participation.length && <p className="empty-inline">Истории участия пока нет.</p>}
      </Card>
    </div>}
  </div>
}

async function importedIds(file: File): Promise<string[]> {
  try { const data: unknown = JSON.parse(await file.text()); return Array.isArray(data) ? data.map((item: unknown) => item && typeof item === 'object' && 'employee_id' in item ? String(item.employee_id) : '').filter(Boolean) : [] }
  catch { return [] }
}
async function existingIds(): Promise<Set<string>> {
  const first = await api.employees('', 0, 200)
  const ids = new Set(first.items.map(item => item.employee_id))
  for (let offset = 200; offset < first.total; offset += 200) {
    const page = await api.employees('', offset, 200)
    page.items.forEach(item => ids.add(item.employee_id))
  }
  return ids
}

function ImportPage() {
  const [employees, setEmployees] = useState<File | null>(null)
  const [history, setHistory] = useState<File | null>(null)
  const [validation, setValidation] = useState<ImportValidation | null>(null)
  const [result, setResult] = useState<ImportCommit | null>(null)
  const [newIds, setNewIds] = useState<string[]>([])
  const [replacedIds, setReplacedIds] = useState<string[]>([])
  const [idsKnown, setIdsKnown] = useState(false)
  const [validating, setValidating] = useState(false)
  const [committing, setCommitting] = useState(false)
  const [error, setError] = useState('')
  function reset() { setValidation(null); setResult(null); setNewIds([]); setReplacedIds([]); setIdsKnown(false); setError('') }
  async function validate(event: FormEvent) {
    event.preventDefault()
    if (!employees || !history) return
    setValidating(true); reset()
    try {
      const ids = await importedIds(employees)
      const [known, report] = await Promise.all([existingIds().catch(() => null), api.validate(employees, history)])
      setValidation(report)
      if (known) { setNewIds(ids.filter(id => !known.has(id))); setReplacedIds(ids.filter(id => known.has(id))); setIdsKnown(true) }
    } catch (cause) { setError(errorText(cause)) }
    finally { setValidating(false) }
  }
  async function commit() {
    if (!validation?.valid || !validation.import_id || committing) return
    setCommitting(true); setError('')
    try { setResult(await api.commit(validation.import_id, validation.base_dataset_version)) }
    catch (cause) {
      setError(errorText(cause))
      if (cause instanceof ApiError && (cause.status === 409 || cause.status === 410)) setValidation(null)
    } finally { setCommitting(false) }
  }
  return <div>
    <Link className="back-link" to="/hr">← Вернуться к аналитике</Link>
    <div className="page-heading"><div><span className="eyebrow">HR · ДАННЫЕ</span><h1>Импорт профилей и истории</h1><p>Сначала проверка двух файлов, затем отдельное применение.</p></div></div>
    <div className="import-layout"><Card className="import-form"><span className="eyebrow">ШАГ 01 / 02</span><h2>Выберите файлы</h2><p className="muted">Формат синтетического кита ШАГРА: employees.json и activity_history.csv.</p>
      <form onSubmit={validate}>
        <label className="file-field">Профили сотрудников · employees.json<input type="file" accept=".json,application/json" required onChange={e => { setEmployees(e.target.files?.[0] || null); reset() }} /><span>{employees?.name || 'Файл не выбран'}</span></label>
        <label className="file-field">История активностей · activity_history.csv<input type="file" accept=".csv,text/csv" required onChange={e => { setHistory(e.target.files?.[0] || null); reset() }} /><span>{history?.name || 'Файл не выбран'}</span></label>
        <button className="button primary wide" disabled={validating || !employees || !history}>{validating ? 'Проверяем…' : 'Проверить файлы →'}</button>
      </form>
      <p className="microcopy">Проверка ничего не записывает. Каждый файл до 5 MiB; ошибки покажем до применения.</p>
    </Card>
    <Card className="import-review"><span className="eyebrow">ШАГ 02 / 02</span><h2>Результат проверки</h2>
      {!validation && !result && <div className="empty-inline">Выберите два файла и запустите проверку, чтобы увидеть изменения.</div>}
      {validation && <><div className={validation.valid ? 'notice success' : 'notice error'} role="status">{validation.valid ? 'Файлы прошли проверку. Данные ещё не применены.' : 'Есть ошибки. Текущие данные сохранены.'}</div>
        <div className="summary-grid"><div><strong>{validation.summary.new_employees}</strong><span>новых профилей</span></div><div><strong>{validation.summary.replaced_employees}</strong><span>замен снимка</span></div><div><strong>{validation.summary.new_history}</strong><span>новых записей</span></div><div><strong>{validation.summary.unchanged_history}</strong><span>без изменений</span></div></div>
        {validation.errors.length > 0 && <div className="table-scroll"><table><thead><tr><th>Файл</th><th>Поле / строка</th><th>Код</th><th>Ошибка</th></tr></thead><tbody>{validation.errors.map((entry, index) => <tr key={index}><td>{entry.file || '—'}</td><td>{entry.path}</td><td>{entry.code}</td><td>{entry.message}</td></tr>)}</tbody></table></div>}
        {validation.valid && !result && <>
          {validation.summary.replaced_employees > 0 && <div className="notice warn"><strong>Полная замена снимка.</strong> Для совпавшего ID весь профиль, включая уровни навыков, будет заменён содержимым файла. Это может снизить ранее записанные уровни.</div>}
          {idsKnown && replacedIds.length > 0 && <p className="id-list"><strong>Заменяемые ID:</strong> {replacedIds.join(', ')}</p>}
          {!idsKnown && validation.summary.replaced_employees > 0 && <p className="microcopy">Список ID недоступен. Проверьте файл перед подтверждением.</p>}
          {validation.expires_at && <p className="microcopy">Проверка действует до {new Date(validation.expires_at).toLocaleString('ru-RU')}.</p>}
          <button className="button primary" onClick={commit} disabled={committing}>{committing ? 'Применяем…' : 'Подтвердить и применить'}</button>
        </>}
      </>}
      {result && <div className="notice success" role="status">{result.applied ? 'Импорт применён.' : 'Эти данные уже были применены.'} Версия набора: {result.dataset_version}.</div>}
      {result && <div className="import-links">{newIds.length > 0 ? newIds.map(id => <Link className="button outline" key={id} to={`/employees/${id}`}>Открыть профиль {id} →</Link>) : <Link className="button outline" to="/hr">Найти профиль →</Link>}</div>}
      {error && <div className="notice error" role="alert">{error}{!validation && <span> Проверьте файлы заново.</span>}</div>}
    </Card></div>
  </div>
}

export default function App() {
  const [auth, setAuth] = useState<Auth | null | undefined>(undefined)
  const [sessionError, setSessionError] = useState('')
  const navigate = useNavigate()
  useEffect(() => {
    const controller = new AbortController()
    api.me(controller.signal).then(setAuth).catch(cause => {
      if (isAbort(cause)) return
      if (cause instanceof ApiError && cause.status === 401) setAuth(null)
      else { setSessionError(errorText(cause)); setAuth(null) }
    })
    return () => controller.abort()
  }, [])
  async function logout() {
    try { await api.logout() } finally { setAuth(null); navigate('/login', { replace: true }) }
  }
  if (auth === undefined) return <div className="boot"><div className="brand-mark">Ш</div><p>Открываем ШАГРУ…</p></div>
  if (!auth) return <><Routes><Route path="*" element={<Login onLogin={setAuth} />} /></Routes>{sessionError && <div className="session-error" role="alert">{sessionError}</div>}</>
  return <Shell auth={auth} onLogout={logout}><Routes>
    <Route path="/" element={<Navigate to={auth.role === 'hr' ? '/hr' : '/me'} replace />} />
    <Route path="/login" element={<Navigate to={auth.role === 'hr' ? '/hr' : '/me'} replace />} />
    <Route path="/me" element={auth.role === 'employee' ? <ProfilePage auth={auth} /> : <Navigate to="/hr" replace />} />
    <Route path="/employees/:id" element={auth.role === 'hr' ? <ProfilePage auth={auth} /> : <Navigate to="/me" replace />} />
    <Route path="/hr" element={auth.role === 'hr' ? <HrPage /> : <Navigate to="/me" replace />} />
    <Route path="/hr/import" element={auth.role === 'hr' ? <ImportPage /> : <Navigate to="/me" replace />} />
    <Route path="*" element={<Navigate to={auth.role === 'hr' ? '/hr' : '/me'} replace />} />
  </Routes></Shell>
}
