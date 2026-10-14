const W = 340
const H = 180
const PAD = { top: 12, right: 8, bottom: 22, left: 40 }
const plotW = W - PAD.left - PAD.right
const plotH = H - PAD.top - PAD.bottom

const dayNumber = (key: string) => {
  const [y, m, d] = key.split('-').map(Number)
  return Date.UTC(y, m - 1, d) / 86_400_000
}

const shortDate = (key: string) => {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

/** Rounded axis ticks covering [min, max]. */
function ticks(min: number, max: number, count = 3): number[] {
  const span = max - min || 1
  const raw = span / count
  const mag = 10 ** Math.floor(Math.log10(raw))
  const step = [1, 2, 2.5, 5, 10].map((s) => s * mag).find((s) => s >= raw) ?? raw
  const out: number[] = []
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(Math.round(v * 100) / 100)
  return out
}

export interface WeightChartPoint {
  date: string
  value: number
  trend: number
}

/** Weigh-ins as dots with the smoothed trend as a line. */
export function WeightChart({ points, from, to, unit }: { points: WeightChartPoint[]; from: string; to: string; unit: string }) {
  const values = points.flatMap((p) => [p.value, p.trend])
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const padY = Math.max((hi - lo) * 0.15, 0.5)
  const yMin = lo - padY
  const yMax = hi + padY
  const x0 = dayNumber(from)
  const span = Math.max(dayNumber(to) - x0, 1)
  const x = (d: string) => PAD.left + ((dayNumber(d) - x0) / span) * plotW
  const y = (v: number) => PAD.top + (1 - (v - yMin) / (yMax - yMin)) * plotH
  const trendPath = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.trend).toFixed(1)}`).join(' ')

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Weight chart from ${shortDate(from)} to ${shortDate(to)}`}>
      {ticks(yMin, yMax).map((t) => (
        <g key={t}>
          <line className="grid" x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} />
          <text className="axis" x={PAD.left - 6} y={y(t) + 4} textAnchor="end">
            {t}
          </text>
        </g>
      ))}
      {points.map((p) => (
        <circle key={p.date} className="dot" cx={x(p.date)} cy={y(p.value)} r={2.5} />
      ))}
      <path className="trend-line" d={trendPath} />
      <text className="axis" x={PAD.left} y={H - 6}>
        {shortDate(from)}
      </text>
      <text className="axis" x={W - PAD.right} y={H - 6} textAnchor="end">
        {shortDate(to)}
      </text>
      <text className="axis" x={4} y={PAD.top + 4}>
        {unit}
      </text>
    </svg>
  )
}

export interface ProgressPoint {
  date: string
  value: number
  /** Drawn filled, e.g. a set that was a new personal best. */
  highlight?: boolean
}

/** A line through each point over time, highlighted points filled. */
export function ProgressChart({ points, unit, label }: { points: ProgressPoint[]; unit: string; label: string }) {
  const values = points.map((p) => p.value)
  const lo = Math.min(...values)
  const hi = Math.max(...values)
  const padY = Math.max((hi - lo) * 0.15, 2.5)
  const yMin = Math.max(0, lo - padY)
  const yMax = hi + padY
  const from = points[0].date
  const to = points.at(-1)!.date
  const x0 = dayNumber(from)
  const span = dayNumber(to) - x0
  // A single day's points sit in the middle instead of on the left edge.
  const x = (d: string) => (span ? PAD.left + ((dayNumber(d) - x0) / span) * plotW : PAD.left + plotW / 2)
  const y = (v: number) => PAD.top + (1 - (v - yMin) / (yMax - yMin)) * plotH
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.date).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label} from ${shortDate(from)} to ${shortDate(to)}`}>
      {ticks(yMin, yMax).map((t) => (
        <g key={t}>
          <line className="grid" x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} />
          <text className="axis" x={PAD.left - 6} y={y(t) + 4} textAnchor="end">
            {t}
          </text>
        </g>
      ))}
      <path className="trend-line" d={path} />
      {points.map((p) => (
        <circle key={p.date} className={p.highlight ? 'pb-dot' : 'set-dot'} cx={x(p.date)} cy={y(p.value)} r={p.highlight ? 4.5 : 3.5} />
      ))}
      <text className="axis" x={PAD.left} y={H - 6}>
        {shortDate(from)}
      </text>
      {span > 0 && (
        <text className="axis" x={W - PAD.right} y={H - 6} textAnchor="end">
          {shortDate(to)}
        </text>
      )}
      <text className="axis" x={4} y={PAD.top + 4}>
        {unit}
      </text>
    </svg>
  )
}

export interface CalorieChartDay {
  date: string
  kcal: number
}

/** Daily calories as bars, with the target as a dashed line. */
export function CalorieChart({ days, target }: { days: CalorieChartDay[]; target: number }) {
  const yMax = Math.max(target * 1.2, ...days.map((d) => d.kcal)) || 1
  const y = (v: number) => PAD.top + (1 - v / yMax) * plotH
  const slot = plotW / days.length
  const barW = Math.max(slot * 0.7, 1)
  const weekly = days.length <= 7
  const from = days[0]?.date
  const to = days.at(-1)?.date

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Daily calories, target ${target} kcal`}>
      {ticks(0, yMax).map((t) => (
        <g key={t}>
          <line className="grid" x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} />
          <text className="axis" x={PAD.left - 6} y={y(t) + 4} textAnchor="end">
            {t >= 1000 ? `${t / 1000}k` : t}
          </text>
        </g>
      ))}
      {days.map((d, i) =>
        d.kcal > 0 ? (
          <rect
            key={d.date}
            className={d.kcal > target ? 'cal-bar over' : 'cal-bar'}
            x={PAD.left + i * slot + (slot - barW) / 2}
            y={y(d.kcal)}
            width={barW}
            height={Math.max(y(0) - y(d.kcal), 1)}
            rx={Math.min(3, barW / 2)}
          />
        ) : null,
      )}
      <line className="target-line" x1={PAD.left} x2={W - PAD.right} y1={y(target)} y2={y(target)} />
      {weekly
        ? days.map((d, i) => (
            <text key={d.date} className="axis" x={PAD.left + i * slot + slot / 2} y={H - 6} textAnchor="middle">
              {new Date(dayNumber(d.date) * 86_400_000).toLocaleDateString('en-GB', { weekday: 'narrow', timeZone: 'UTC' })}
            </text>
          ))
        : from &&
          to && (
            <>
              <text className="axis" x={PAD.left} y={H - 6}>
                {shortDate(from)}
              </text>
              <text className="axis" x={W - PAD.right} y={H - 6} textAnchor="end">
                {shortDate(to)}
              </text>
            </>
          )}
    </svg>
  )
}

export { shortDate }
