import Icon from './Icon.jsx'

export function Loading() {
  return (
    <div className="center-block" role="status"><div className="spinner" /><p className="muted">Loading your recordings…</p></div>
  )
}

export function ErrorBox({ message }) {
  return (
    <div className="card empty"><Icon name="alert" size={28} /><h3>Something went wrong</h3><p className="muted">{message}</p></div>
  )
}

export function NoRecordings() {
  return (
    <div className="card empty">
      <Icon name="video" size={30} />
      <h3>No recordings found yet</h3>
      <p className="muted">Record at least one controller, build the videos, then reload this page.</p>
      <pre className="code-block">{`python traci9_record.py fixed
python traci9_record.py ql
python traci9_record.py dqn
python build_dashboard.py`}</pre>
    </div>
  )
}
