import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getSettings, type Entry, type MealIndex } from '../db'
import { entriesForDate, mealForTime, shiftDateKey, sumTotals } from '../entries'
import { localDateKey } from '../units'
import { QuickAddSheet } from '../components/QuickAddSheet'

const MACROS = [
  { key: 'protein', target: 'proteinTarget', label: 'Protein' },
  { key: 'carbs', target: 'carbsTarget', label: 'Carbs' },
  { key: 'fat', target: 'fatTarget', label: 'Fat' },
] as const

type SheetState = { meal: MealIndex; entry?: Entry } | null

function dateLabel(key: string, today: string): string {
  if (key === today) return 'Today'
  if (key === shiftDateKey(today, -1)) return 'Yesterday'
  if (key === shiftDateKey(today, 1)) return 'Tomorrow'
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
}

const fmt = (n: number) => Math.round(n).toLocaleString()

export function TodayScreen() {
  const today = localDateKey()
  const [date, setDate] = useState(today)
  const [sheet, setSheet] = useState<SheetState>(null)

  const settings = useLiveQuery(() => getSettings(), [])
  const entries = useLiveQuery(() => entriesForDate(date), [date])
  if (!settings || !entries) return null

  const totals = sumTotals(entries)
  const left = settings.kcalTarget - totals.kcal
  const kcalPct = Math.min(100, (totals.kcal / settings.kcalTarget) * 100)

  return (
    <>
      <header className="screen-header day-header">
        <button type="button" className="icon-button" aria-label="Previous day" onClick={() => setDate(shiftDateKey(date, -1))}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
        <button type="button" className="day-title" onClick={() => setDate(today)} aria-label="Go to today">
          <h1>{dateLabel(date, today)}</h1>
        </button>
        <button type="button" className="icon-button" aria-label="Next day" onClick={() => setDate(shiftDateKey(date, 1))}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </header>

      <section className="card summary">
        <p className="big-number">{fmt(Math.abs(left))}</p>
        <p className="muted">
          {left >= 0 ? 'calories left' : 'calories over'} · {fmt(totals.kcal)} of {fmt(settings.kcalTarget)} eaten
        </p>
        <div className="bar kcal-bar" aria-hidden="true">
          <div className="bar-fill" style={{ width: `${kcalPct}%` }} />
        </div>
        <div className="macros">
          {MACROS.map((m) => {
            const eaten = totals[m.key]
            const target = settings[m.target]
            return (
              <div key={m.key} className="macro">
                <div className="macro-row">
                  <span>{m.label}</span>
                  <span className="muted">
                    {fmt(eaten)} / {target} g
                  </span>
                </div>
                <div className="bar" role="progressbar" aria-label={m.label} aria-valuemin={0} aria-valuemax={target} aria-valuenow={Math.round(eaten)}>
                  <div className="bar-fill" style={{ width: `${Math.min(100, (eaten / target) * 100)}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {settings.mealNames.map((name, i) => {
        const meal = i as MealIndex
        const items = entries.filter((e) => e.meal === meal)
        const mealKcal = sumTotals(items).kcal
        return (
          <section key={i} className="card meal">
            <div className="meal-head">
              <h2>{name}</h2>
              <span className="muted">{fmt(mealKcal)} kcal</span>
              <button type="button" className="add-button" aria-label={`Add to ${name}`} onClick={() => setSheet({ meal })}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </button>
            </div>
            {items.map((e) => (
              <button key={e.id} type="button" className="entry-row" onClick={() => setSheet({ meal, entry: e })}>
                <span className="entry-name">{e.name}</span>
                <span className="entry-macros muted">
                  P {fmt(e.protein)} · C {fmt(e.carbs)} · F {fmt(e.fat)}
                </span>
                <span className="entry-kcal">{fmt(e.kcal)}</span>
              </button>
            ))}
          </section>
        )
      })}

      <button
        type="button"
        className="fab"
        aria-label="Quick add"
        onClick={() => setSheet({ meal: date === today ? mealForTime() : 3 })}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>

      {sheet && (
        <QuickAddSheet
          date={date}
          meal={sheet.meal}
          entry={sheet.entry}
          mealNames={settings.mealNames}
          onClose={() => setSheet(null)}
        />
      )}
    </>
  )
}
