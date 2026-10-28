import { useCallback, useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { api } from '../api.js'
import { useAuth } from '../auth.jsx'
import Icon, { Logo } from './Icon.jsx'
import ThemeToggle from './ThemeToggle.jsx'

const TITLES = { '/app': 'Live comparison', '/app/analytics': 'Analytics' }

export default function AppShell() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [state, setState] = useState({ loading: true, error: null, data: null })

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const data = await api.runs()
      setState({ loading: false, error: null, data })
    } catch (e) {
      if (e.status === 401) { await signOut(); navigate('/auth', { replace: true }); return }
      setState({ loading: false, error: e.message, data: null })
    }
  }, [navigate, signOut])

  useEffect(() => { load() }, [load])

  const initial = (user?.name || '?').trim().charAt(0).toUpperCase()
  const logout = async () => { await signOut(); navigate('/', { replace: true }) }

  return (
    <div className="shell">
      <aside className="sidebar">
        <NavLink to="/" className="brand"><Logo /><span>Signal Lab</span></NavLink>
        <nav className="side-nav" aria-label="Main">
          <NavLink to="/app" end className={({ isActive }) => `side-link ${isActive ? 'active' : ''}`}><Icon name="dashboard" /> Dashboard</NavLink>
          <NavLink to="/app/analytics" className={({ isActive }) => `side-link ${isActive ? 'active' : ''}`}><Icon name="chart" /> Analytics</NavLink>
        </nav>
        <div className="side-foot">
          <div className="user-card">
            <span className="avatar" aria-hidden="true">{initial}</span>
            <div className="user-meta">
              <strong title={user?.name}>{user?.name}</strong>
              <span className="role">{user?.role === 'admin' ? 'Administrator' : user?.role}</span>
            </div>
          </div>
          <button type="button" className="btn btn-ghost btn-block" onClick={logout}><Icon name="logout" size={16} /> Sign out</button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div>
            <h1>{TITLES[pathname] || 'Dashboard'}</h1>
            <p className="muted small">Same junction, same traffic, three signal controllers</p>
          </div>
          <div className="topbar-actions">
            <button type="button" className="icon-btn" onClick={load} aria-label="Reload data" title="Reload data">
              <Icon name="refresh" size={18} className={state.loading ? 'spin' : ''} />
            </button>
            <ThemeToggle />
            <span className="avatar sm" title={user?.email}>{initial}</span>
          </div>
        </header>
        <div className="content">
          <Outlet context={state} />
        </div>
      </div>
    </div>
  )
}
