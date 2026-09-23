import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { api, ApiError, isAbort } from '../shared/api/client'
import type { Auth } from '../shared/api/types'
import { usePreferences } from '../shared/lib/preferences'
import { ErrorState } from '../shared/ui'
import { AppShell } from './AppShell'
import { LoginPage } from '../pages/LoginPage'
import { ProfilePage } from '../pages/ProfilePage'
import { HrPage } from '../pages/HrPage'
import { ImportPage } from '../pages/ImportPage'

export default function App() {
  const { t } = usePreferences()
  const [auth, setAuth] = useState<Auth | null | undefined>(undefined),
    [error, setError] = useState<unknown>(null),
    [attempt, setAttempt] = useState(0)
  const navigate = useNavigate()
  useEffect(() => {
    const controller = new AbortController()
    setError(null)
    api
      .me(controller.signal)
      .then(setAuth)
      .catch((cause) => {
        if (isAbort(cause)) return
        if (cause instanceof ApiError && cause.status === 401) setAuth(null)
        else setError(cause)
      })
    return () => controller.abort()
  }, [attempt])
  async function logout() {
    await api.logout()
    setAuth(null)
    navigate('/login', { replace: true })
  }
  if (auth === undefined)
    return (
      <main className="sh-boot">
        <span className="sh-brand-mark">ш</span>
        {error ? (
          <ErrorState
            error={error}
            onRetry={() => setAttempt((value) => value + 1)}
          />
        ) : (
          <p role="status">{t('loading')}</p>
        )}
      </main>
    )
  if (!auth) return <LoginPage onLogin={setAuth} />
  const home = auth.role === 'hr' ? '/hr' : '/me'
  return (
    <AppShell auth={auth} onLogout={logout}>
      <Routes>
        <Route
          path="/me/*"
          element={
            auth.role === 'employee' ? (
              <ProfilePage auth={auth} />
            ) : (
              <Navigate to="/hr" replace />
            )
          }
        />
        <Route
          path="/employees/:id"
          element={
            auth.role === 'hr' ? (
              <ProfilePage auth={auth} />
            ) : (
              <Navigate to="/me" replace />
            )
          }
        />
        <Route
          path="/hr"
          element={
            auth.role === 'hr' ? <HrPage /> : <Navigate to="/me" replace />
          }
        />
        <Route
          path="/hr/import"
          element={
            auth.role === 'hr' ? <ImportPage /> : <Navigate to="/me" replace />
          }
        />
        <Route path="*" element={<Navigate to={home} replace />} />
      </Routes>
    </AppShell>
  )
}
