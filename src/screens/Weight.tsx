import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getSettings, type Weight } from '../db'
import { dateLabel, parseOptional, shiftDateKey } from '../entries'
import { fromKg, localDateKey, toKg } from '../units'
import { deleteWeight, listWeights, saveWeight, trendChange, withTrend } from '../weights'
import { WeightChart } from '../components/Charts'

type Range = 30 | 90 | 365 | 0
const RANGES: { days: Range; label: string }[] = [
  { days: 30, label: '1M' },
  { days: 90, label: '3M' },
  { days: 365, label: '1Y' },
  { days: 0, label: 'All' },
]

const one = (n: number) => (Math.round(n * 10) / 10).toFixed(1)

export function WeightScreen() {
  const today = localDateKey()
  const settings = useLiveQuery(() => getSettings(), [])
  const weights = useLiveQuery(() => listWeights(), [])
  const [range, setRange] = useState<Range>(30)
  const [editing, setEditing] = useState<string | null>(null)
  const [showAll, setShowAll] = useState(false)

  const points = useMemo(() => withTrend(weights ?? []), [weights])
  if (!settings || !weights) return null

  const unit = settings.weightUnit
  const show = (kg: number) => one(fromKg(kg, unit))
  const latest = points.at(-1)
  const from = range ? shiftDateKey(today, -range) : (points[0]?.date ?? today)
  const visible = points.filter((p) => p.date >= from)
  const change = (days: number) => {
    const c = trendChange(points, days)
    if (c === null) return '–'
    const v = fromKg(c, unit)
    return `${v > 0 ? '+' : v < 0 ? '−' : '±'}${one(Math.abs(v))} ${unit}`
  }

  const formDate = editing ?? today
  const existing = weights.find((w) => w.date === formDate)

  return (
    <>
      <header className="screen-header">
        <h1>Weight</h1>
      </header>

      <WeightForm
        key={`${formDate}-${existing?.kg ?? ''}-${unit}`}
        date={formDate}
        today={today}
        existing={existing}
        unit={unit}
        onDate={(d) => setEditing(d === today ? null : d)}
        onDone={() => setEditing(null)}
      />

      {latest ? (
        <>
          <section className="card trend-card">
            <div>
              <p className="muted small">Trend weight</p>
              <p className="trend-value">
                {show(latest.trend)} <span className="muted">{unit}</span>
              </p>
            </div>
            <div className="trend-changes">
              <p>
                <span className="muted small">7 days</span> {change(7)}
              </p>
              <p>
                <span className="muted small">30 days</span> {change(30)}
              </p>
            </div>
          </section>

          <div className="segmented four" role="radiogroup" aria-label="Chart range">
            {RANGES.map((r) => (
              <button
                key={r.label}
                type="button"
                role="radio"
                aria-checked={range === r.days}
                className={range === r.days ? 'seg active' : 'seg'}
                onClick={() => setRange(r.days)}
              >
                {r.label}
              </button>
            ))}
          </div>

          <section className="card chart-card">
            {visible.length ? (
              <WeightChart
                points={visible.map((p) => ({ date: p.date, value: fromKg(p.kg, unit), trend: fromKg(p.trend, unit) }))}
                from={from < (visible[0]?.date ?? from) && range ? from : visible[0].date}
                to={today > visible.at(-1)!.date ? today : visible.at(-1)!.date}
                unit={unit}
              />
            ) : (
              <p className="muted center">No weigh-ins in this range.</p>
            )}
            <p className="chart-key muted small">
              <span className="key-dot" /> Weigh-ins <span className="key-line" /> Trend
            </p>
          </section>
          <p className="hint">The trend smooths out day-to-day water swings. Watch it, not single weigh-ins.</p>

          <h2 className="section-title">Weigh-ins</h2>
          <section className="card list">
            {[...weights].reverse().slice(0, showAll ? undefined : 10).map((w) => (
              <button key={w.date} type="button" className="list-row" onClick={() => setEditing(w.date)}>
                <span className="list-main">
                  <span className="entry-name">{dateLabel(w.date, today)}</span>
                </span>
                <span className="entry-kcal">
                  {show(w.kg)} {unit}
                </span>
              </button>
            ))}
          </section>
          {!showAll && weights.length > 10 && (
            <button type="button" className="link-button center-block" onClick={() => setShowAll(true)}>
              Show all {weights.length} weigh-ins
            </button>
          )}
        </>
      ) : (
        <p className="empty-note">Weigh in each morning, after the loo and before eating, for the steadiest trend.</p>
      )}
    </>
  )
}

function WeightForm({
  date,
  today,
  existing,
  unit,
  onDate,
  onDone,
}: {
  date: string
  today: string
  existing?: Weight
  unit: 'kg' | 'lb'
  onDate: (date: string) => void
  onDone: () => void
}) {
  const day = date
  const [text, setText] = useState(existing ? one(fromKg(existing.kg, unit)) : '')
  const [error, setError] = useState(false)
  const [saved, setSaved] = useState(false)
  const parsed = parseOptional(text)
  const value = typeof parsed === 'number' && parsed >= 20 && parsed <= 700 ? parsed : null

  return (
    <form
      className="card form"
      onSubmit={async (e) => {
        e.preventDefault()
        if (value === null) return setError(true)
        await saveWeight(day, toKg(value, unit))
        setSaved(true)
        ;(document.activeElement as HTMLElement | null)?.blur()
        onDone()
      }}
    >
      <div className="field">
        <label htmlFor="weight-value">{day === today ? "Today's weight" : `Weight on ${dateLabel(day, today)}`}</label>
        <div className="input-wrap">
          <input
            id="weight-value"
            inputMode="decimal"
            placeholder="0.0"
            value={text}
            aria-invalid={error}
            onChange={(e) => {
              setText(e.target.value)
              setError(false)
              setSaved(false)
            }}
          />
          <span className="unit">{unit}</span>
        </div>
        {error && <p className="field-error">Enter your weight, like {unit === 'kg' ? '72.4' : '160.2'}.</p>}
      </div>
      <div className="field">
        <label htmlFor="weight-date">Date</label>
        <input id="weight-date" type="date" value={day} max={today} onChange={(e) => e.target.value && e.target.value <= today && onDate(e.target.value)} />
      </div>
      <button type="submit" className="primary-button">
        {saved ? 'Saved' : existing ? 'Update' : 'Save'}
      </button>
      {existing && (
        <button
          type="button"
          className="danger-button"
          onClick={async () => {
            await deleteWeight(existing.date)
            onDone()
          }}
        >
          Delete this weigh-in
        </button>
      )}
    </form>
  )
}
