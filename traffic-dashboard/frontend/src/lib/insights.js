import { num, int, reductionPct } from './format.js'

const byKey = (runs) => Object.fromEntries(runs.map((r) => [r.key, r]))

// Turns the numbers from the server into short plain-language findings.
export function buildInsights(data) {
  const runs = data.runs
  if (!runs.length) return []
  const by = byKey(runs)
  const base = by.fixed
  const secPerFrame = data.frameEvery * data.stepLength
  const out = []

  const sorted = [...runs].sort((a, b) => a.stats.avgQueue - b.stats.avgQueue)
  const best = sorted[0]

  if (base && best.key !== 'fixed') {
    const pct = reductionPct(best.stats.avgQueue, base.stats.avgQueue)
    out.push({
      tone: 'good', icon: 'trophy', title: `${best.name} kept the queues shortest`,
      text: `On average ${num(best.stats.avgQueue)} vehicles were waiting at the stop lines, ${num(Math.abs(pct))}% ${pct >= 0 ? 'fewer' : 'more'} than with fixed timing (${num(base.stats.avgQueue)}).`,
    })
  } else if (base && best.key === 'fixed' && runs.length > 1) {
    out.push({
      tone: 'warn', icon: 'alert', title: 'Fixed timing had the shortest queues',
      text: `The learned controllers did not beat the baseline in this run (${num(base.stats.avgQueue)} vehicles on average). They probably need more training.`,
    })
  } else {
    out.push({ tone: 'info', icon: 'info', title: `${best.name}: ${num(best.stats.avgQueue)} vehicles on average`,
      text: 'Record the other controllers to see a comparison.' })
  }

  // throughput
  const topFlow = [...runs].sort((a, b) => b.stats.throughput - a.stats.throughput)[0]
  if (base && topFlow.key !== 'fixed') {
    const diff = topFlow.stats.throughput - base.stats.throughput
    if (diff !== 0) {
      out.push({ tone: diff > 0 ? 'good' : 'warn', icon: 'car', title: `${topFlow.name} moved the most vehicles through`,
        text: `${int(topFlow.stats.throughput)} vehicles finished their trip, ${int(Math.abs(diff))} ${diff > 0 ? 'more' : 'fewer'} than fixed timing.` })
    }
  }

  // congestion
  const calm = [...runs].sort((a, b) => a.stats.congestedPct - b.stats.congestedPct)[0]
  out.push({ tone: 'info', icon: 'activity', title: `${calm.name} spent the least time congested`,
    text: `${calm.name} spent ${num(calm.stats.congestedPct)}% of the time with 10 or more vehicles at the stop lines${base && calm.key !== 'fixed' ? ` (fixed timing: ${num(base.stats.congestedPct)}%)` : ''}.` })

  // peak queue and when it happened
  const worst = [...runs].sort((a, b) => b.stats.peakQueue - a.stats.peakQueue)[0]
  const at = worst.queue.indexOf(Math.max(...worst.queue)) * secPerFrame
  out.push({ tone: 'info', icon: 'clock', title: `Longest queue: ${worst.stats.peakQueue} vehicles`,
    text: `It happened with ${worst.name} at about ${int(at)} s into the run.` })

  // signal behaviour
  const learned = runs.filter((r) => r.key !== 'fixed')
  if (base && learned.length) {
    const l = learned[learned.length - 1]
    out.push({ tone: 'info', icon: 'zap', title: 'How the signal behaved',
      text: `${l.name} switched ${int(l.stats.switches)} times and held green for ${num(l.stats.avgGreen)} s on average. Fixed timing holds green for ${num(base.stats.avgGreen)} s no matter how many cars are waiting.` })
  }

  // stopped share
  out.push({ tone: 'info', icon: 'car', title: `${num(best.stats.stoppedShare, 0)}% of the vehicles at the stop lines were stopped`,
    text: `This is the share for ${best.name}. The rest were still rolling in or out of the detector area.` })

  // demand
  const d = data.demand
  if (d) {
    const total = d.total
    const a = (d.roads.A / total) * 100
    const left = (d.turns.left / total) * 100
    out.push({ tone: 'info', icon: 'layers', title: Math.abs(a - 50) > 10 ? 'Demand is uneven between the two roads' : 'Demand is balanced between the two roads',
      text: `Road A carries ${num(a, 0)}% of the ${int(total)} vehicles per hour that enter the junction and road B ${num(100 - a, 0)}%. Left turns are ${num(left, 0)}% of all movements.` })
  }

  const seed = data.seed
  out.push({ tone: 'info', icon: 'info', title: 'One run is only a first answer',
    text: `These numbers come from a single run of ${int(runs[0].stats.seconds)} s (seed ${seed}). Repeat the recording with other seeds before drawing strong conclusions.` })
  return out
}

export function statsToCsv(data) {
  const rows = [
    ['Controller', 'Average queue', 'Peak queue', '95th percentile queue', 'Congested time (%)', 'Stopped share (%)',
      'Vehicles finished', 'Signal switches', 'Average green (s)', 'Final cumulative reward'],
    ...data.runs.map((r) => [r.name, r.stats.avgQueue, r.stats.peakQueue, r.stats.p95Queue, r.stats.congestedPct,
      r.stats.stoppedShare, r.stats.throughput, r.stats.switches, r.stats.avgGreen, r.stats.finalReward]),
  ]
  return rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
}
