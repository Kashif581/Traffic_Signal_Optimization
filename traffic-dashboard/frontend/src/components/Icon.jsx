// Tiny inline icon set (24x24, stroke based) so the app needs no icon library.
const P = {
  play: <polygon points="7 4 20 12 7 20 7 4" fill="currentColor" stroke="none" />,
  pause: (<><rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none" /><rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor" stroke="none" /></>),
  sun: (<><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>),
  moon: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />,
  dashboard: (<><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>),
  chart: (<><path d="M3 3v18h18" /><path d="M7 15l4-4 3 3 5-6" /></>),
  video: (<><rect x="2" y="5" width="14" height="14" rx="2.5" /><path d="M16 10l6-3v10l-6-3z" /></>),
  logout: (<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="M16 17l5-5-5-5M21 12H9" /></>),
  eye: (<><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>),
  eyeOff: (<><path d="M17.9 17.9A10.1 10.1 0 0 1 12 19c-6.4 0-10-7-10-7a17.6 17.6 0 0 1 4.1-5.1M9.9 5.2A9.7 9.7 0 0 1 12 5c6.4 0 10 7 10 7a17.7 17.7 0 0 1-2.2 3.2" /><path d="M3 3l18 18M14.1 14.1A3 3 0 0 1 9.9 9.9" /></>),
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  check: <path d="M20 6L9 17l-5-5" />,
  shield: <path d="M12 3l8 3v6c0 5-3.4 8-8 9-4.6-1-8-4-8-9V6z" />,
  layers: (<><path d="M12 3l9 5-9 5-9-5z" /><path d="M3 13l9 5 9-5M3 17.5l9 5 9-5" opacity=".6" /></>),
  activity: <path d="M22 12h-4l-3 9L9 3l-3 9H2" />,
  clock: (<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
  download: (<><path d="M12 3v12M7 10l5 5 5-5" /><path d="M4 21h16" /></>),
  refresh: (<><path d="M21 12a9 9 0 1 1-3-6.7" /><path d="M21 4v5h-5" /></>),
  trophy: (<><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z" /><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4" /></>),
  zap: <polygon points="13 2 4 14 11 14 10 22 20 9 13 9 13 2" />,
  car: (<><path d="M5 17h14M3 13l2-6h14l2 6v4H3z" /><circle cx="7.5" cy="17" r="1.5" /><circle cx="16.5" cy="17" r="1.5" /></>),
  info: (<><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8v.01" /></>),
  alert: (<><path d="M12 3l10 18H2z" /><path d="M12 10v5M12 18v.01" /></>),
  home: <path d="M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10" />,
  cpu: (<><rect x="6" y="6" width="12" height="12" rx="2" /><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" /></>),
  lock: (<><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>),
  moonstars: (<><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></>),
}

export default function Icon({ name, size = 18, className = '', title }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}>
      {title ? <title>{title}</title> : null}
      {P[name] || null}
    </svg>
  )
}

export function Logo({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id="lg-logo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5b5ff5" /><stop offset="1" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>
      <rect x="8" y="1.5" width="16" height="29" rx="8" fill="url(#lg-logo)" />
      <circle cx="16" cy="9" r="3.2" fill="#ef4444" />
      <circle cx="16" cy="16" r="3.2" fill="#eab308" />
      <circle cx="16" cy="23" r="3.2" fill="#22c55e" />
    </svg>
  )
}
