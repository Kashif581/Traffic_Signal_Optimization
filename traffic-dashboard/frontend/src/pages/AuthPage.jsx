import { useMemo, useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth.jsx'
import Icon, { Logo } from '../components/Icon.jsx'
import ThemeToggle from '../components/ThemeToggle.jsx'

function strength(pw) {
  let s = 0
  if (pw.length >= 8) s++
  if (pw.length >= 12) s++
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++
  if (/\d/.test(pw)) s++
  if (/[^A-Za-z0-9]/.test(pw)) s++
  return Math.min(4, s)
}
const STRENGTH_LABELS = ['Too short', 'Weak', 'Okay', 'Good', 'Strong']

export default function AuthPage() {
  const { loading, hasAdmin, user, error: serverError, signUp, signIn } = useAuth()
  const navigate = useNavigate()
  const signingUp = !hasAdmin
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' })
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const score = useMemo(() => strength(form.password), [form.password])

  if (!loading && user) return <Navigate to="/app" replace />

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (signingUp) {
      if (form.password.length < 8) return setError('The password must have at least 8 characters.')
      if (form.password !== form.confirm) return setError('The two passwords do not match.')
    }
    setBusy(true)
    try {
      if (signingUp) await signUp({ name: form.name, email: form.email, password: form.password })
      else await signIn({ email: form.email, password: form.password })
      navigate('/app', { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth">
      <aside className="auth-brand">
        <Link to="/" className="brand light"><Logo /><span>Signal Lab</span></Link>
        <div className="auth-brand-copy">
          <h2>{signingUp ? 'Welcome! Let’s set up your dashboard.' : 'Welcome back.'}</h2>
          <p>{signingUp
            ? 'You are the first person here, so this account becomes the administrator. It stays on this computer.'
            : 'Sign in to compare fixed timing, Q-learning and DQN on your junction.'}</p>
          <ul className="auth-points">
            <li><Icon name="check" size={16} /> Three controllers, one synced timeline</li>
            <li><Icon name="check" size={16} /> Live charts and plain-language insights</li>
            <li><Icon name="check" size={16} /> Light and dark mode</li>
          </ul>
        </div>
        <small>Built with SUMO, TraCI and React</small>
      </aside>

      <main className="auth-main">
        <div className="auth-top">
          <Link to="/" className="btn btn-ghost btn-sm"><Icon name="home" size={16} /> Home</Link>
          <ThemeToggle />
        </div>

        <form className="auth-card card" onSubmit={submit} noValidate>
          <span className={`pill ${signingUp ? 'pill-accent' : ''}`}>{signingUp ? 'First-time setup' : 'Sign in'}</span>
          <h1>{signingUp ? 'Create the admin account' : 'Sign in to your account'}</h1>
          <p className="muted">{signingUp ? 'This only happens once.' : 'Use the email and password you signed up with.'}</p>

          {(error || serverError) && <div className="alert" role="alert"><Icon name="alert" size={16} /> {error || serverError}</div>}

          {signingUp && (
            <label className="field">
              <span>Full name</span>
              <input value={form.name} onChange={set('name')} autoComplete="name" placeholder="Your name" required autoFocus />
            </label>
          )}
          <label className="field">
            <span>Email</span>
            <input type="email" value={form.email} onChange={set('email')} autoComplete="email" placeholder="you@example.com" required autoFocus={!signingUp} />
          </label>
          <label className="field">
            <span>Password</span>
            <div className="pw">
              <input type={show ? 'text' : 'password'} value={form.password} onChange={set('password')}
                autoComplete={signingUp ? 'new-password' : 'current-password'} placeholder={signingUp ? 'At least 8 characters' : 'Your password'} required />
              <button type="button" className="pw-toggle" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'}>
                <Icon name={show ? 'eyeOff' : 'eye'} size={18} />
              </button>
            </div>
          </label>
          {signingUp && (
            <>
              <div className="meter" aria-hidden="true">
                {[0, 1, 2, 3].map((i) => <span key={i} className={i < score ? `on s${score}` : ''} />)}
                <em>{form.password ? STRENGTH_LABELS[score] : ''}</em>
              </div>
              <label className="field">
                <span>Confirm password</span>
                <input type={show ? 'text' : 'password'} value={form.confirm} onChange={set('confirm')} autoComplete="new-password" placeholder="Type it again" required />
              </label>
            </>
          )}

          <button className="btn btn-primary btn-block btn-lg" type="submit" disabled={busy || loading}>
            {busy ? 'Please wait…' : signingUp ? 'Create account and continue' : 'Sign in'}
          </button>
          {!signingUp && <p className="muted small center">Forgot the password? See the README: delete <code>data/users.json</code> and sign up again.</p>}
        </form>
      </main>
    </div>
  )
}
