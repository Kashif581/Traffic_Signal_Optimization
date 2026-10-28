// Animated top-down junction for the landing page: cars drive along the two roads while the lights change.
export default function HeroArt() {
  return (
    <svg className="hero-svg" viewBox="0 0 420 420" role="img" aria-label="Animated illustration of cars at a junction with traffic lights">
      <defs>
        <linearGradient id="ha-road" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--road-a)" /><stop offset="1" stopColor="var(--road-b)" />
        </linearGradient>
        <clipPath id="ha-clip"><rect x="12" y="12" width="396" height="396" rx="36" /></clipPath>
        <radialGradient id="ha-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#8b5cf6" stopOpacity="0.35" /><stop offset="1" stopColor="#8b5cf6" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="210" cy="210" r="200" fill="url(#ha-glow)" />
      <rect x="12" y="12" width="396" height="396" rx="36" className="ha-ground" />
      {/* the two roads, crossing like an X (clipped to the rounded card) */}
      <g clipPath="url(#ha-clip)">
      <g transform="rotate(-24 210 210)"><rect x="-40" y="170" width="500" height="80" rx="6" fill="url(#ha-road)" /></g>
      <g transform="rotate(38 210 210)"><rect x="-40" y="172" width="500" height="76" rx="6" fill="url(#ha-road)" /></g>
      <g transform="rotate(-24 210 210)"><line x1="-20" y1="210" x2="440" y2="210" className="ha-dash" /></g>
      <g transform="rotate(38 210 210)"><line x1="-20" y1="210" x2="440" y2="210" className="ha-dash" /></g>
      <circle cx="210" cy="210" r="46" fill="var(--road-b)" opacity="0.9" />

      {/* cars */}
      <g className="ha-cars">
        <g transform="rotate(-24 210 210)">
          <rect className="car c1" x="0" y="191" width="22" height="11" rx="4" />
          <rect className="car c2" x="0" y="191" width="22" height="11" rx="4" style={{ animationDelay: '-3s' }} />
          <rect className="car c3 rev" x="0" y="219" width="22" height="11" rx="4" style={{ animationDelay: '-1.5s' }} />
          <rect className="car c4 rev" x="0" y="219" width="22" height="11" rx="4" style={{ animationDelay: '-5s' }} />
        </g>
        <g transform="rotate(38 210 210)">
          <rect className="car c5 slow" x="0" y="191" width="22" height="11" rx="4" style={{ animationDelay: '-2s' }} />
          <rect className="car c6 slow rev" x="0" y="219" width="22" height="11" rx="4" style={{ animationDelay: '-6s' }} />
        </g>
      </g>
      </g>

      {/* traffic light poles: the two lights are always in opposite states */}
      {[[84, 88], [338, 334]].map(([x, y], i) => (
        <g key={i} transform={`translate(${x} ${y})`}>
          <rect x="-9" y="-24" width="18" height="48" rx="9" className="ha-pole" />
          <circle cx="0" cy="-14" r="5" className={`lamp red ${i ? 'b' : 'a'}`} />
          <circle cx="0" cy="0" r="5" className="lamp amber" />
          <circle cx="0" cy="14" r="5" className={`lamp green ${i ? 'a' : 'b'}`} />
        </g>
      ))}
    </svg>
  )
}
