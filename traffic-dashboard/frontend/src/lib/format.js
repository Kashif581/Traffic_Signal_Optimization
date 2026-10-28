export const CONTROLLERS = ['fixed', 'ql', 'dqn']
export const colorOf = (key) => `var(--c-${key})`

export const PHASE_NAMES = ['Road B green', 'Yellow', 'All red', 'Road A green', 'Yellow', 'All red']
export const PHASE_COLORS = ['var(--green)', 'var(--yellow)', 'var(--red)', 'var(--green)', 'var(--yellow)', 'var(--red)']

export function num(n, digits = 1) {
  if (n === null || n === undefined || Number.isNaN(n)) return '–'
  return Number(n).toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits })
}
export const int = (n) => num(n, 0)

export function clock(seconds) {
  const s = Math.max(0, Math.round(seconds))
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

// How much smaller (+) or larger (-) is `value` than `base`, in percent.
export function reductionPct(value, base) {
  if (!base) return 0
  return ((base - value) / base) * 100
}

export function movingAverage(a, w) {
  const out = []
  let s = 0
  for (let i = 0; i < a.length; i++) {
    s += a[i]
    if (i >= w) s -= a[i - w]
    out.push(s / Math.min(i + 1, w))
  }
  return out
}

export function prefixMean(a) {
  const out = []
  let s = 0
  for (let i = 0; i < a.length; i++) { s += a[i]; out.push(s / (i + 1)) }
  return out
}

export function downloadText(filename, text, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
