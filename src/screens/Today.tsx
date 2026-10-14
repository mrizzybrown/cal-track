import { useCallback, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getSettings, type Entry, type MealIndex } from '../db'
import { dateLabel, entriesForDate, mealForTime, shiftDateKey, sumTotals } from '../entries'
import { copyMealFromDay } from '../savedMeals'
import { localDateKey } from '../units'
import { AddFoodSheet } from '../components/AddFoodSheet'
import { SaveMealSheet } from '../components/SaveMealSheet'
import { Toast, type ToastState } from '../components/Toast'

const MACROS = [
  { key: 'protein', target: 'proteinTarget', label: 'Protein' },
  { key: 'carbs', target: 'carbsTarget', label: 'Carbs' },
  { key: 'fat', target: 'fatTarget', label: 'Fat' },
] as const

type SheetState = { meal: MealIndex; entry?: Entry } | null

const fmt = (n: number) => Math.round(n).toLocaleString()

const previousHas = (entries: Entry[], meal: MealIndex) => entries.some((e) => e.meal === meal)

export function TodayScreen() {
  const today = localDateKey()
  const [date, setDate] = useState(today)
  const [sheet, setSheet] = useState<SheetState>(null)
  const [saveSheet, setSaveSheet] = useState<{ entries: Entry[]; name: string } | null>(null)
  const [toast, setToast] = useState<ToastState | null>(null)
  const clearToast = useCallback(() => setToast(null), [])

  const settings = useLiveQuery(() => getSettings(), [])
  const entries = useLiveQuery(() => entriesForDate(date), [date])
  const previousDay = shiftDateKey(date, -1)
  const previous = useLiveQuery(() => entriesForDate(previousDay), [previousDay])
  if (!settings || !entries || !previous) return null

  const onLogged = (ids: number[], label: string) =>
    setToast({ message: `Logged ${label}`, undo: () => db.entries.bulkDelete(ids) })

  const copyPrevious = async (meal: MealIndex, name: string) => {
    const ids = await copyMealFromDay(previousDay, date, meal)
    if (!ids.length) return
    setToast({
      message: `Copied ${name} from ${dateLabel(previousDay, today).toLowerCase()}`,
      undo: () => db.entries.bulkDelete(ids),
    })
  }

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
            {items.length > 0 ? (
              <div className="meal-actions">
                <button type="button" className="link-button" onClick={() => setSaveSheet({ entries: items, name })}>
                  Save {name.toLowerCase()} to My Meals
                </button>
              </div>
            ) : (
              previousHas(previous, meal) && (
                <div className="meal-actions">
                  <button type="button" className="link-button" onClick={() => copyPrevious(meal, name)}>
                    Copy {dateLabel(previousDay, today).toLowerCase()}'s {name.toLowerCase()} (
                    {fmt(sumTotals(previous.filter((p) => p.meal === meal)).kcal)} kcal)
                  </button>
                </div>
              )
            )}
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
        <AddFoodSheet
          date={date}
          meal={sheet.meal}
          entry={sheet.entry}
          mealNames={settings.mealNames}
          onClose={() => setSheet(null)}
          onLogged={onLogged}
        />
      )}

      {saveSheet && (
        <SaveMealSheet
          entries={saveSheet.entries}
          defaultName={saveSheet.name}
          onClose={() => setSaveSheet(null)}
          onSaved={(n) => setToast({ message: `Saved ${n} to My Meals` })}
        />
      )}

      {toast && <Toast toast={toast} onDone={clearToast} />}
    </>
  )
}
