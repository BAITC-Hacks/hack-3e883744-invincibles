import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { Link, NavLink, useLocation, useNavigationType } from 'react-router-dom'
import type { Auth } from '../shared/api/types'
import { usePreferences } from '../shared/lib/preferences'
import {
  BrandMark,
  Dialog,
  ErrorState,
  Icon,
  PreferencesControls,
} from '../shared/ui'

export function AppShell({
  auth,
  onLogout,
  children,
}: {
  auth: Auth
  onLogout: () => Promise<void>
  children: ReactNode
}) {
  const { t } = usePreferences()
  const [account, setAccount] = useState(false)
  const [mobileMenu, setMobileMenu] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const location = useLocation()
  const navigation = useNavigationType()
  const positions = useRef(new Map<string, number>())
  const key = location.pathname + location.search
  useEffect(() => setMobileMenu(false), [location.pathname])
  useLayoutEffect(() => {
    window.scrollTo(
      0,
      navigation === 'POP' ? positions.current.get(key) || 0 : 0,
    )
  }, [location.pathname]) // Query filtering preserves scroll.
  useEffect(() => {
    const capture = () => positions.current.set(key, window.scrollY)
    window.addEventListener('scroll', capture)
    return () => window.removeEventListener('scroll', capture)
  }, [key])
  const links =
    auth.role === 'hr'
      ? [
          { to: '/hr', label: t('overview'), icon: 'home' as const },
          { to: '/hr/import', label: t('import'), icon: 'upload' as const },
        ]
      : [
          { to: '/me', label: t('overview'), icon: 'home' as const },
          { to: '/me/skills', label: t('skills'), icon: 'skills' as const },
          { to: '/me/history', label: t('history'), icon: 'history' as const },
        ]
  const items = links.map((link) => (
    <NavLink
      key={link.to}
      to={link.to}
      end
      className={({ isActive }) =>
        isActive ? 'sh-nav-link sh-active' : 'sh-nav-link'
      }
    >
      <Icon name={link.icon} />
      <span>{link.label}</span>
    </NavLink>
  ))
  async function logout() {
    setBusy(true)
    setError(null)
    try {
      await onLogout()
    } catch (cause) {
      setError(cause)
    } finally {
      setBusy(false)
    }
  }
  return (
    <>
      <div id="sh-shell">
        <a className="sh-skip" href="#main-content">
          {t('skipContent')}
        </a>
        <aside className="sh-sidebar">
          <Link className="sh-brand" to={auth.role === 'hr' ? '/hr' : '/me'}>
            <BrandMark />
            <span>Шагра</span>
          </Link>
          <nav aria-label={t('nav')}>{items}</nav>
          <button
            className="sh-sidebar-account"
            onClick={(event) => {
              event.currentTarget.focus()
              setAccount(true)
            }}
          >
            <Icon name="user" />
            <span>
              {auth.role === 'hr' ? 'HR' : auth.employee_id}
              <small>{t('account')}</small>
            </span>
          </button>
        </aside>
        <div className="sh-workspace">
          <header className="sh-topbar">
            <Link
              className="sh-mobile-brand sh-brand"
              to={auth.role === 'hr' ? '/hr' : '/me'}
            >
              <BrandMark />
              <span>Шагра</span>
            </Link>
            <span className="sh-topbar-title">
              {auth.role === 'hr' ? 'HR' : t('myGrowth')}
            </span>
            <PreferencesControls />
            <button
              className="sh-icon-button sh-mobile-menu-button"
              type="button"
              aria-label={t('settings')}
              aria-expanded={mobileMenu}
              aria-controls="mobile-settings-menu"
              onClick={() => setMobileMenu((open) => !open)}
            >
              <Icon name={mobileMenu ? 'close' : 'menu'} />
            </button>
            <button
              className="sh-icon-button sh-mobile-account"
              aria-label={t('account')}
              onClick={(event) => {
                event.currentTarget.focus()
                setAccount(true)
              }}
            >
              <Icon name="user" />
            </button>
          </header>
          {mobileMenu && (
            <div
              className="sh-mobile-menu-layer"
              onClick={() => setMobileMenu(false)}
            >
              <section
                id="mobile-settings-menu"
                className="sh-mobile-menu"
                aria-label={t('settings')}
                onClick={(event) => event.stopPropagation()}
              >
                <strong>{t('settings')}</strong>
                <PreferencesControls />
              </section>
            </div>
          )}
          <main id="main-content" className="sh-main" tabIndex={-1}>
            {children}
          </main>
        </div>
        <nav className="sh-bottomnav" aria-label={t('nav')}>
          {items}
        </nav>
      </div>
      {account &&
        createPortal(
          <Dialog
            title={t('account')}
            compact
            onClose={() => setAccount(false)}
            busy={busy}
            footer={
              <button
                className="sh-button sh-primary"
                disabled={busy}
                onClick={logout}
              >
                {busy ? t('loading') : t('logout')}
              </button>
            }
          >
            <p>{auth.role === 'hr' ? 'HR' : auth.employee_id}</p>
            {Boolean(error) && <ErrorState error={error} />}
          </Dialog>,
          document.body,
        )}
    </>
  )
}
