import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import Icon from '../components/Icon.jsx'
import { LineChart } from '../components/Charts.jsx'
import { ErrorBox, Loading, NoRecordings } from '../components/EmptyState.jsx'
import { PHASE_COLORS, PHASE_NAMES, clock, colorOf, int, movingAverage, num, prefixMean } from '../lib/format.js'

const SPEEDS = [0.5, 1, 2, 4]
const TABS = [
  { key: 'queueSm', label: 'Vehicles at stop lines', hint: '20 s average' },
  { key: 'haltSm', label: 'Stopped vehicles', hint: '20 s average' },
  { key: 'cum', label: 'Cumulative reward', hint: 'higher is better' },
  { key: 'arrived', label: 'Vehicles finished', hint: 'trip completed' },
]

export default function Dashboard() {
  const { loading, error, data } = useOutletContext()
  if (loading && !data) return <Loading />
  if (error) return <ErrorBox message={error} />
  if (!data || !data.runs.length) return <NoRecordings />
  return <Player data={data} />
}

function Player({ data }) {
  const fps = data.fps
  const secPerFrame = data.frameEvery * data.stepLength
  const smooth = Math.max(1, Math.round(20 / secPerFrame))

  // Per-run series prepared once
  const runs = useMemo(() => data.runs.map((r) => ({
    ...r,
    queueSm: movingAverage(r.queue, smooth),
    haltSm: movingAverage(r.halting, smooth),
    avgQ: prefixMean(r.queue),
  })), [data, smooth])

  const nFrames = useMemo(() => Math.min(...runs.map((r) => r.queue.length)), [runs])
  const duration = nFrames / fps
  const hasVideo = runs.some((r) => r.video)

  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [idx, setIdx] = useState(0)
  const [tab, setTab] = useState('queueSm')
  const tRef = useRef(0)
  const videos = useRef({})

  const allVideos = useCallback(() => Object.values(videos.current).filter(Boolean), [])

  const seekTo = useCallback((frame) => {
    const f = Math.max(0, Math.min(nFrames - 1, frame))
    tRef.current = f / fps
    allVideos().forEach((v) => { try { v.currentTime = tRef.current } catch { /* not ready */ } })
    setIdx(f)
  }, [allVideos, fps, nFrames])

  const play = useCallback(() => {
    if (tRef.current >= duration - 0.08) seekTo(0)
    setPlaying(true)
    allVideos().forEach((v) => { v.playbackRate = speed; const p = v.play(); if (p && p.catch) p.catch(() => {}) })
  }, [allVideos, duration, seekTo, speed])

  const pause = useCallback(() => {
    setPlaying(false)
    allVideos().forEach((v) => v.pause())
  }, [allVideos])

  useEffect(() => { allVideos().forEach((v) => { v.playbackRate = speed }) }, [speed, allVideos])

  // The clock: the first video is the master; the others follow it. Without videos a timer is used.
  useEffect(() => {
    let raf
    let last = performance.now()
    const tick = (now) => {
      const dt = (now - last) / 1000
      last = now
      if (playing) {
        const vs = allVideos().filter((v) => v.getAttribute('src'))
        if (vs.length) {
          tRef.current = vs[0].currentTime
          for (let i = 1; i < vs.length; i++) {
            if (Math.abs(vs[i].currentTime - tRef.current) > 0.25) vs[i].currentTime = tRef.current
          }
        } else {
          tRef.current += dt * speed
        }
        if (tRef.current >= duration - 0.06) { tRef.current = duration; pause() }
      }
      const i = Math.max(0, Math.min(nFrames - 1, Math.floor(tRef.current * fps)))
      setIdx((p) => (p === i ? p : i))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, speed, duration, nFrames, fps, allVideos, pause])

  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return
      if (e.code === 'Space') { e.preventDefault(); playing ? pause() : play() }
      if (e.code === 'ArrowRight') seekTo(idx + 5 * fps)
      if (e.code === 'ArrowLeft') seekTo(idx - 5 * fps)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [playing, play, pause, seekTo, idx, fps])

  // Shared y range so the three small charts are comparable
  const ranges = useMemo(() => ({
    queue: Math.max(...runs.map((r) => Math.max(...r.queue))),
    cumLow: Math.min(...runs.map((r) => Math.min(...r.cum))),
  }), [runs])

  // Live ranking by "average so far"
  const ranking = useMemo(() => [...runs].sort((a, b) => a.avgQ[idx] - b.avgQ[idx]).map((r) => r.key), [runs, idx])
  const worstAvg = Math.max(...runs.map((r) => r.avgQ[idx]), 0.001)

  const tabSeries = runs.map((r) => ({
    key: r.key, label: r.name, color: colorOf(r.key), data: r[tab], width: 2.4,
  }))
  const tabMeta = TABS.find((t) => t.key === tab)
  const xLabel = (i) => clock(i * secPerFrame)

  return (
    <div className="dash">
      <section className="controls card" aria-label="Playback controls">
        <button type="button" className="play-btn" onClick={playing ? pause : play} aria-label={playing ? 'Pause' : 'Play'}>
          <Icon name={playing ? 'pause' : 'play'} size={22} />
        </button>
        <div className="seek-wrap">
          <input type="range" className="seek" min="0" max={nFrames - 1} value={idx} aria-label="Seek"
            style={{ '--pct': `${(idx / Math.max(1, nFrames - 1)) * 100}%` }}
            onChange={(e) => seekTo(Number(e.target.value))} />
          <div className="seek-times"><span>{clock(idx * secPerFrame)}</span><span>{clock(nFrames * secPerFrame)}</span></div>
        </div>
        <div className="time-chip" title="Simulated time">
          <Icon name="clock" size={16} /> t = {int(idx * secPerFrame)} s
        </div>
        <div className="segmented" role="group" aria-label="Playback speed">
          {SPEEDS.map((s) => (
            <button key={s} type="button" className={speed === s ? 'on' : ''} onClick={() => setSpeed(s)} aria-pressed={speed === s}>{s}x</button>
          ))}
        </div>
      </section>

      <section className="runs-grid">
        {runs.map((r) => {
          const rank = ranking.indexOf(r.key) + 1
          const phase = r.phase[idx]
          return (
            <article className="run-card card" key={r.key} style={{ '--accent-c': colorOf(r.key) }} data-testid={`run-${r.key}`}>
              <header className="run-head">
                <h2><span className="dot" />{r.name}</h2>
                {runs.length > 1 && idx > 0 && (
                  <span className={`rank ${rank === 1 ? 'first' : ''}`}>{rank === 1 ? 'Shortest queue so far' : `#${rank} so far`}</span>
                )}
              </header>

              <div className="video-wrap">
                {r.video ? (
                  <video ref={(el) => { videos.current[r.key] = el }} src={r.video} muted playsInline preload="auto"
                    onClick={() => (playing ? pause() : play())} aria-label={`${r.name} simulation video`} />
                ) : (
                  <div className="video-missing"><Icon name="video" size={26} /><p>No video yet</p><code>python build_dashboard.py</code></div>
                )}
                <div className="signal-badge" title="Current signal state">
                  <i style={{ background: PHASE_COLORS[phase] }} />{PHASE_NAMES[phase]}
                </div>
              </div>

              <div className="kpis">
                <div className="kpi"><span>Vehicles now</span><b data-testid={`q-${r.key}`}>{r.queue[idx]}</b></div>
                <div className="kpi"><span>Average so far</span><b data-testid={`avg-${r.key}`}>{num(r.avgQ[idx])}</b></div>
                <div className="kpi"><span>Reward</span><b data-testid={`cum-${r.key}`}>{int(r.cum[idx])}</b></div>
                <div className="kpi"><span>Finished trips</span><b>{int(r.arrived[idx])}</b></div>
              </div>

              <div className="mini">
                <div className="mini-title">Vehicles at stop lines</div>
                <LineChart height={128} idx={idx} xCount={nFrames} xLabel={xLabel} yMin={0} yMax={ranges.queue}
                  ariaLabel={`${r.name}: vehicles at the stop lines over time`}
                  series={[
                    { key: 'raw', label: 'Now', color: colorOf(r.key), data: r.queue, width: 1.2, opacity: 0.35, hideDot: true },
                    { key: 'avg', label: '20 s average', color: colorOf(r.key), data: r.queueSm, width: 2.4 },
                  ]} />
              </div>
              <div className="mini">
                <div className="mini-title">Cumulative reward</div>
                <LineChart height={110} idx={idx} xCount={nFrames} xLabel={xLabel} yMin={Math.min(0, ranges.cumLow)} yMax={0} fromZero={false}
                  ariaLabel={`${r.name}: cumulative reward over time`}
                  series={[{ key: 'cum', label: 'Reward', color: colorOf(r.key), data: r.cum, width: 2.2 }]} />
              </div>
            </article>
          )
        })}
      </section>

      <section className="h2h">
        <article className="card h2h-chart">
          <header className="h2h-head">
            <div>
              <h2>Head to head</h2>
              <p className="muted small">{tabMeta.label} · {tabMeta.hint}</p>
            </div>
            <div className="segmented wrap" role="tablist" aria-label="Chart metric">
              {TABS.map((t) => (
                <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} className={tab === t.key ? 'on' : ''}
                  onClick={() => setTab(t.key)}>{t.label}</button>
              ))}
            </div>
          </header>
          <LineChart height={280} idx={idx} xCount={nFrames} xLabel={xLabel} series={tabSeries} fromZero={tab !== 'cum'}
            ariaLabel="All controllers compared over time" />
          <div className="legend">
            {runs.map((r) => (<span key={r.key}><i style={{ background: colorOf(r.key) }} />{r.name}</span>))}
          </div>
        </article>

        <article className="card leader">
          <h2>Leaderboard</h2>
          <p className="muted small">Average vehicles at the stop lines so far. Lower is better.</p>
          <ol>
            {ranking.map((key, pos) => {
              const r = runs.find((x) => x.key === key)
              return (
                <li key={key} className={pos === 0 && idx > 0 ? 'is-first' : ''}>
                  <span className="pos">{pos + 1}</span>
                  <div className="leader-body">
                    <div className="leader-row"><strong>{r.name}</strong><b>{num(r.avgQ[idx])}</b></div>
                    <div className="bar-track"><div className="bar-fill" style={{ width: `${(r.avgQ[idx] / worstAvg) * 100}%`, background: colorOf(key) }} /></div>
                  </div>
                </li>
              )
            })}
          </ol>
          {!hasVideo && <p className="note"><Icon name="info" size={14} /> No videos were found, so a timer drives the charts. Run <code>python build_dashboard.py</code>.</p>}
        </article>
      </section>
    </div>
  )
}
