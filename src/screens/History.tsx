import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getSettings } from '../db'
import { dateLabel } from '../entries'
import { averages, dailyTotals } from '../history'
import { localDateKey } from '../units'
import { CalorieChart } from '../components/Charts'

type Range = 7 | 30 | 90
const RANGES: Range[] = [7, 30, 90]

const fmt = (n: number) => Math.round(n).toLocaleString()

export function HistoryScreen() {
  const today = localDateKey()
  const [range, setRange] = useState<Range>(7)
  const settings = useLiveQuery(() => getSettings(), [])
  const days = useLiveQuery(() => dailyTotals(today, range), [today, range])
  if (!settings || !days) return null

  const avg = averages(days)
  const macros = [
    { label: 'Protein', value: avg.protein, target: settings.proteinTarget },
    { label: 'Carbs', value: avg.carbs, target: settings.carbsTarget },
    { label: 'Fat', value: avg.fat, target: settings.fatTarget },
  ]
  const diff = avg.kcal - settings.kcalTarget

  return (
    <>
      <header className="screen-header">
        <h1>History</h1>
      </header>

      <div className="segmented three" role="radiogroup" aria-label="Period">
        {RANGES.map((r) => (
          <button
            key={r}
            type="button"
            role="radio"
            aria-checked={range === r}
            className={range === r ? 'seg active' : 'seg'}
            onClick={() => setRange(r)}
          >
            {r} days
          </button>
        ))}
      </div>

      {avg.daysLogged === 0 ? (
        <p className="empty-note">Nothing logged in the last {range} days yet.</p>
      ) : (
        <>
          <section className="card">
            <p className="muted small">Average per logged day</p>
            <p className="trend-value">
              {fmt(avg.kcal)} <span className="muted">kcal</span>
            </p>
            <p className="muted small">
              {Math.abs(diff) < 1
                ? 'On target'
                : `${fmt(Math.abs(diff))} kcal ${diff > 0 ? 'over' : 'under'} your ${fmt(settings.kcalTarget)} target`}{' '}
              · logged {avg.daysLogged} of {range} days
            </p>
            <div className="avg-macros">
              {macros.map((m) => (
                <div key={m.label}>
                  <span className="muted small">{m.label}</span>
                  <span>
                    <strong>{fmt(m.value)}</strong>
                    <span className="muted"> / {fmt(m.target)} g</span>
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="card chart-card">
            <CalorieChart days={days} target={settings.kcalTarget} />
            <p className="chart-key muted small">
              <span className="key-bar" /> Calories <span className="key-dash" /> Target
            </p>
          </section>

          <h2 className="section-title">Days</h2>
          <section className="card list">
            {[...days]
              .reverse()
              .filter((d) => d.logged)
              .map((d) => (
                <div key={d.date} className="list-row static">
                  <span className="list-main">
                    <span className="entry-name">{dateLabel(d.date, today)}</span>
                    <span className="entry-macros muted">
                      P {fmt(d.protein)} · C {fmt(d.carbs)} · F {fmt(d.fat)}
                    </span>
                  </span>
                  <span className={d.kcal > settings.kcalTarget ? 'entry-kcal over' : 'entry-kcal'}>{fmt(d.kcal)}</span>
                </div>
              ))}
          </section>
        </>
      )}
    </>
  )
}
