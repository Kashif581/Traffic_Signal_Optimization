import { Link } from 'react-router-dom'
import { useAuth } from '../auth.jsx'
import Icon, { Logo } from '../components/Icon.jsx'
import ThemeToggle from '../components/ThemeToggle.jsx'
import HeroArt from '../components/HeroArt.jsx'

const FEATURES = [
  { icon: 'video', title: 'Side-by-side replay', text: 'Fixed timing, Q-learning and a deep Q-network drive the same junction with the same traffic. Watch all three at once, perfectly in sync.' },
  { icon: 'activity', title: 'Charts that move with the video', text: 'Queue length and reward are drawn live as the video plays, and they follow you when you pause, scrub or change the speed.' },
  { icon: 'chart', title: 'Analytics and insights', text: 'Average and peak queues, congestion, throughput, signal timing and demand, with plain-language findings written for you.' },
  { icon: 'moon', title: 'Light and dark mode', text: 'Pick the look that suits the room. The dashboard remembers your choice and follows your system by default.' },
  { icon: 'lock', title: 'Private by default', text: 'The first person to sign up becomes the administrator. Everything stays on your computer, behind a sign-in.' },
  { icon: 'cpu', title: 'Built on your simulations', text: 'It reads the recordings your own SUMO and TraCI runs produce. No uploads, no cloud, no extra setup.' },
]

const STEPS = [
  { n: '1', title: 'Record', code: 'python traci9_record.py ql', text: 'Run each controller on the junction and save pictures and numbers.' },
  { n: '2', title: 'Build', code: 'python build_dashboard.py', text: 'Turn the pictures into one video per controller.' },
  { n: '3', title: 'Explore', code: 'python server.py', text: 'Open this dashboard, compare the controllers and read the insights.' },
]

const CONTROLLERS = [
  { key: 'fixed', name: 'Fixed timing', text: 'The classic signal. The same cycle all day, whatever the traffic does.' },
  { key: 'ql', name: 'Q-learning', text: 'A table of learned values decides when to keep or switch the phase.' },
  { key: 'dqn', name: 'Deep Q-learning', text: 'A small neural network generalises across the queue patterns it has seen.' },
]

export default function Landing() {
  const { user, hasAdmin, loading } = useAuth()
  const cta = user ? { to: '/app', label: 'Open the dashboard' }
    : hasAdmin ? { to: '/auth', label: 'Sign in' }
      : { to: '/auth', label: 'Create the admin account' }

  return (
    <div className="lp">
      <header className="lp-nav">
        <Link to="/" className="brand"><Logo /><span>Signal Lab</span></Link>
        <nav className="lp-links" aria-label="Sections">
          <a href="#features">Features</a>
          <a href="#how">How it works</a>
          <a href="#controllers">Controllers</a>
        </nav>
        <div className="lp-actions">
          <ThemeToggle />
          {!loading && <Link to={cta.to} className="btn btn-primary">{user ? 'Dashboard' : hasAdmin ? 'Sign in' : 'Get started'}</Link>}
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="hero-copy">
            <span className="pill"><Icon name="zap" size={14} /> SUMO · TraCI · Reinforcement learning</span>
            <h1>Watch AI learn to <span className="grad-text">run a traffic light.</span></h1>
            <p className="lead">Compare a classic fixed-time signal with Q-learning and a deep Q-network on the same junction, the same traffic and the same clock. See every queue, every switch and every result.</p>
            <div className="hero-cta">
              {!loading && <Link to={cta.to} className="btn btn-primary btn-lg">{cta.label} <Icon name="arrow" size={18} /></Link>}
              <a href="#how" className="btn btn-ghost btn-lg">See how it works</a>
            </div>
            {!loading && !hasAdmin && !user && (
              <p className="hint"><Icon name="shield" size={15} /> First time here? You will create the administrator account.</p>
            )}
          </div>
          <div className="hero-art"><HeroArt /></div>
        </section>

        <section id="features" className="section">
          <div className="section-head">
            <span className="eyebrow">Features</span>
            <h2>Everything you need to judge a signal controller</h2>
            <p>From the first frame of video to the last row of the results table.</p>
          </div>
          <div className="features">
            {FEATURES.map((f) => (
              <article className="feature card" key={f.title}>
                <div className="feature-icon"><Icon name={f.icon} size={22} /></div>
                <h3>{f.title}</h3>
                <p>{f.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="how" className="section alt">
          <div className="section-head">
            <span className="eyebrow">How it works</span>
            <h2>From simulation to insight in three steps</h2>
          </div>
          <ol className="steps">
            {STEPS.map((s) => (
              <li className="step card" key={s.n}>
                <span className="step-n">{s.n}</span>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
                <code>{s.code}</code>
              </li>
            ))}
          </ol>
        </section>

        <section id="controllers" className="section">
          <div className="section-head">
            <span className="eyebrow">The contenders</span>
            <h2>Three ways to run the same junction</h2>
          </div>
          <div className="ctrl-cards">
            {CONTROLLERS.map((c) => (
              <article className="ctrl card" key={c.key} style={{ '--accent-c': `var(--c-${c.key})` }}>
                <span className="ctrl-dot" />
                <h3>{c.name}</h3>
                <p>{c.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="cta-band">
          <h2>Ready to see which controller wins?</h2>
          <p>Your recordings are waiting.</p>
          {!loading && <Link to={cta.to} className="btn btn-light btn-lg">{cta.label} <Icon name="arrow" size={18} /></Link>}
        </section>
      </main>

      <footer className="lp-footer">
        <Link to="/" className="brand small"><Logo size={22} /><span>Signal Lab</span></Link>
        <span>Built with SUMO, TraCI and React. Runs entirely on your computer.</span>
      </footer>
    </div>
  )
}
