import { useEffect, useId, useMemo, useRef, useState } from 'react'

// ---------------------------------------------------------------------------------------------
// useSize: width of an element in pixels (updates when the window changes)
// ---------------------------------------------------------------------------------------------
export function useSize(fallback = 640) {
  const ref = useRef(null)
  const [width, setWidth] = useState(fallback)
  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const measure = () => {
      const w = el.getBoundingClientRect().width
      if (w > 0) setWidth(Math.round(w))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width]
}

const niceStep = (range, ticks) => {
  const raw = range / ticks
  const mag = Math.pow(10, Math.floor(Math.log10(raw || 1)))
  const f = raw / mag
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * mag
}

function niceDomain(lo, hi, ticks = 4) {
  if (!(hi > lo)) hi = lo + 1
  const step = niceStep(hi - lo, ticks)
  const start = Math.floor(lo / step) * step
  const end = Math.ceil(hi / step) * step
  const list = []
  for (let v = start; v <= end + step / 2; v += step) list.push(Number(v.toFixed(6)))
  return { lo: start, hi: end, ticks: list }
}

const compact = (v) => (Math.abs(v) >= 10000 ? `${Math.round(v / 1000)}k` : Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v * 10) / 10))

// ---------------------------------------------------------------------------------------------
// LineChart
//   series: [{ key, label, data:[numbers], color, width?, opacity? }]
//   idx   : when given, the lines are drawn only up to this index (a live chart that follows a video)
// ---------------------------------------------------------------------------------------------
export function LineChart({ series, idx = null, xCount, xLabel, height = 190, yMin, yMax, yFormat = compact,
  fromZero = true, area = false, ariaLabel = 'Line chart' }) {
  const [ref, width] = useSize()
  const uid = useId().replace(/:/g, '')
  const [hover, setHover] = useState(null)
  const n = xCount || Math.max(1, ...series.map((s) => s.data.length))
  const pad = { l: 44, r: 12, t: 10, b: 24 }
  const innerW = Math.max(40, width - pad.l - pad.r)
  const innerH = height - pad.t - pad.b

  const dom = useMemo(() => {
    let lo = Infinity
    let hi = -Infinity
    series.forEach((s) => s.data.forEach((v) => { if (v < lo) lo = v; if (v > hi) hi = v }))
    if (!Number.isFinite(lo)) { lo = 0; hi = 1 }
    if (yMin !== undefined) lo = yMin
    else if (fromZero && lo > 0) lo = 0
    if (yMax !== undefined) hi = yMax
    return niceDomain(lo, hi)
  }, [series, yMin, yMax, fromZero])

  const X = (i) => pad.l + (innerW * i) / Math.max(1, n - 1)
  const Y = (v) => pad.t + innerH * (1 - (v - dom.lo) / (dom.hi - dom.lo))

  const paths = useMemo(() => {
    const stride = Math.max(1, Math.floor(n / (innerW * 0.8)))
    return series.map((s) => {
      let d = ''
      const last = s.data.length - 1
      for (let i = 0; i <= last; i += stride) d += `${d ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(s.data[i]).toFixed(1)}`
      if ((last % stride) !== 0) d += `L${X(last).toFixed(1)} ${Y(s.data[last]).toFixed(1)}`
      return d
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, width, dom, n])

  const shown = idx === null ? null : Math.max(0, Math.min(n - 1, idx))
  const live = shown !== null
  const hi = hover === null ? null : hover
  const cursor = live ? shown : hi

  const onMove = (e) => {
    if (live) return
    const r = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - r.left
    const i = Math.round(((x - pad.l) / innerW) * (n - 1))
    setHover(i < 0 || i > n - 1 ? null : i)
  }

  const xTicks = [0, 1, 2, 3, 4].map((k) => Math.round(((n - 1) * k) / 4))
  const baseY = Y(Math.max(dom.lo, 0))

  return (
    <div className="lc" ref={ref} style={{ height }}>
      <svg width={width} height={height} role="img" aria-label={ariaLabel} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        <defs>
          {live && (
            <clipPath id={`clip-${uid}`}>
              <rect x={pad.l} y="0" width={Math.max(0, X(shown) - pad.l)} height={height} />
            </clipPath>
          )}
          {series.map((s, i) => (
            <linearGradient key={i} id={`area-${uid}-${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={s.color} stopOpacity="0.28" /><stop offset="1" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>
        {dom.ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={width - pad.r} y1={Y(t)} y2={Y(t)} className="lc-grid" />
            <text x={pad.l - 8} y={Y(t) + 4} textAnchor="end" className="lc-tick">{yFormat(t)}</text>
          </g>
        ))}
        {xTicks.map((i) => (
          <text key={i} x={X(i)} y={height - 6} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} className="lc-tick">
            {xLabel ? xLabel(i) : i}
          </text>
        ))}
        <g clipPath={live ? `url(#clip-${uid})` : undefined}>
          {area && series.map((s, i) => paths[i] && (
            <path key={`a${i}`} d={`${paths[i]}L${X(s.data.length - 1).toFixed(1)} ${baseY}L${X(0)} ${baseY}Z`} fill={`url(#area-${uid}-${i})`} />
          ))}
          {series.map((s, i) => (
            <path key={s.key} d={paths[i]} fill="none" stroke={s.color} strokeWidth={s.width || 2} strokeOpacity={s.opacity || 1}
              strokeLinejoin="round" strokeLinecap="round" strokeDasharray={s.dashed ? '5 4' : undefined} />
          ))}
        </g>
        {cursor !== null && (
          <g>
            <line x1={X(cursor)} x2={X(cursor)} y1={pad.t} y2={height - pad.b} className="lc-cursor" />
            {series.filter((s) => !s.hideDot && s.data[cursor] !== undefined).map((s) => (
              <circle key={s.key} cx={X(cursor)} cy={Y(s.data[cursor])} r="3.5" fill={s.color} stroke="var(--surface)" strokeWidth="1.5" />
            ))}
          </g>
        )}
      </svg>
      {!live && hi !== null && (
        <div className="lc-tip" style={{ left: Math.min(width - 150, Math.max(0, X(hi) + 10)), top: 8 }}>
          <div className="lc-tip-title">{xLabel ? xLabel(hi) : hi}</div>
          {series.filter((s) => !s.hideDot && s.data[hi] !== undefined).map((s) => (
            <div key={s.key} className="lc-tip-row"><i style={{ background: s.color }} />{s.label || s.key}<b>{yFormat(s.data[hi])}</b></div>
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------------------------
// Bars: horizontal bars made of divs (always sharp, always responsive)
// ---------------------------------------------------------------------------------------------
export function Bars({ items, format = (v) => v, max, suffix }) {
  const top = max || Math.max(...items.map((i) => i.value), 1)
  return (
    <div className="bars">
      {items.map((it) => (
        <div className="bar-row" key={it.label}>
          <div className="bar-label"><i style={{ background: it.color }} />{it.label}</div>
          <div className="bar-track">
            <div className="bar-fill" style={{ width: `${Math.max(1.5, (it.value / top) * 100)}%`, background: it.color }} />
          </div>
          <div className="bar-value">{format(it.value)}{suffix}{it.note ? <span className={`bar-note ${it.noteTone || ''}`}>{it.note}</span> : null}</div>
        </div>
      ))}
    </div>
  )
}

// Columns grouped by category (for the "how long was the queue this long" histogram)
export function GroupedColumns({ labels, series, format = (v) => `${v}%` }) {
  const top = Math.max(...series.flatMap((s) => s.values), 1)
  return (
    <div className="gcols" role="img" aria-label="Grouped column chart">
      <div className="gcols-plot">
        {labels.map((label, li) => (
          <div className="gcols-group" key={label}>
            <div className="gcols-bars">
              {series.map((s) => (
                <div key={s.key} className="gcols-col" title={`${s.label}: ${format(s.values[li])}`}
                  style={{ height: `${Math.max(1, (s.values[li] / top) * 100)}%`, background: s.color }} />
              ))}
            </div>
            <div className="gcols-label">{label}</div>
          </div>
        ))}
      </div>
      <Legend items={series.map((s) => ({ label: s.label, color: s.color }))} />
    </div>
  )
}

export function StackedBars({ rows, format = (v) => `${v}%` }) {
  return (
    <div className="stack">
      {rows.map((row) => (
        <div className="stack-row" key={row.label}>
          <div className="stack-label">{row.label}</div>
          <div className="stack-track">
            {row.segments.map((s) => (
              <div key={s.key} className="stack-seg" title={`${s.label}: ${format(s.value)}`}
                style={{ width: `${s.value}%`, background: s.color }}>
                {s.value >= 9 ? format(s.value) : ''}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

export function Legend({ items }) {
  return (
    <div className="legend">
      {items.map((it) => (<span key={it.label}><i style={{ background: it.color }} />{it.label}</span>))}
    </div>
  )
}

export function Donut({ segments, centerTop, centerBottom, size = 168 }) {
  const total = segments.reduce((a, s) => a + s.value, 0) || 1
  let offset = 25
  return (
    <div className="donut-wrap">
      <svg viewBox="0 0 42 42" width={size} height={size} role="img" aria-label="Donut chart">
        <circle cx="21" cy="21" r="15.9155" fill="none" stroke="var(--surface2)" strokeWidth="5.5" />
        {segments.map((s) => {
          const pct = (s.value / total) * 100
          const el = (
            <circle key={s.label} cx="21" cy="21" r="15.9155" fill="none" stroke={s.color} strokeWidth="5.5"
              strokeDasharray={`${Math.max(0, pct - 0.6)} ${100 - Math.max(0, pct - 0.6)}`} strokeDashoffset={offset} />
          )
          offset -= pct
          return el
        })}
        <text x="21" y="20.5" textAnchor="middle" className="donut-big">{centerTop}</text>
        <text x="21" y="26" textAnchor="middle" className="donut-small">{centerBottom}</text>
      </svg>
      <ul className="donut-legend">
        {segments.map((s) => (
          <li key={s.label}><i style={{ background: s.color }} />{s.label}<b>{Math.round((s.value / total) * 100)}%</b></li>
        ))}
      </ul>
    </div>
  )
}
