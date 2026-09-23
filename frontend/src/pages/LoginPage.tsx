import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../shared/api/client'
import type { Auth } from '../shared/api/types'
import { usePreferences } from '../shared/lib/preferences'
import { Disclosure, ErrorState, Icon, PreferencesControls } from '../shared/ui'
export function LoginPage({ onLogin }: { onLogin: (auth: Auth) => void }) {
  const { t } = usePreferences()
  const navigate = useNavigate()
  const [username, setUsername] = useState(''),
    [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(null)
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const auth = await api.login(username.trim(), password)
      onLogin(auth)
      navigate(auth.role === 'hr' ? '/hr' : '/me', { replace: true })
    } catch (cause) {
      setError(cause)
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="sh-login-page">
      <header className="sh-login-top">
        <span className="sh-brand">
          <span className="sh-brand-mark">ш</span>Шагра
        </span>
        <PreferencesControls />
      </header>
      <main className="sh-login-main">
        <div className="sh-login-intro">
          <h1>{t('loginTitle')}</h1>
          <p className="sh-muted">{t('loginIntro')}</p>
        </div>
        <section className="sh-panel sh-login-card">
          <h2>{t('signIn')}</h2>
          <form onSubmit={submit}>
            <label className="sh-field">
              {t('username')}
              <input
                autoComplete="username"
                required
                value={username}
                onChange={(event) => setUsername(event.target.value)}
              />
            </label>
            <label className="sh-field">
              {t('password')}
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            {Boolean(error) && <ErrorState error={error} />}
            <button className="sh-button sh-primary sh-wide" disabled={busy}>
              {t(busy ? 'signingIn' : 'signIn')}
              <Icon name="arrow" />
            </button>
          </form>
          <Disclosure title={t('demo')}>
            <p className="sh-muted">{t('demoHint')}</p>
            {(['employee', 'hr'] as const).map((role) => (
              <div className="sh-demo-account" key={role}>
                <strong>{role === 'hr' ? 'HR' : t('employee')}</strong>
                <dl>
                  <div>
                    <dt>{t('username')}</dt>
                    <dd>{role}</dd>
                  </div>
                  <div>
                    <dt>{t('password')}</dt>
                    <dd>demo-{role}</dd>
                  </div>
                </dl>
                <button
                  className="sh-button sh-secondary sh-wide"
                  onClick={() => {
                    setUsername(role)
                    setPassword(`demo-${role}`)
                  }}
                >
                  {t(role === 'hr' ? 'fillHr' : 'fillEmployee')}
                </button>
              </div>
            ))}
          </Disclosure>
        </section>
      </main>
    </div>
  )
}
