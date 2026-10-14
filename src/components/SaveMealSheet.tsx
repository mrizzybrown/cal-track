import { useState } from 'react'
import type { Entry } from '../db'
import { sumTotals } from '../entries'
import { saveEntriesAsMeal } from '../savedMeals'
import { Sheet } from './Sheet'

const fmt = (n: number) => Math.round(n).toLocaleString()

/** Names and saves a whole logged meal (all its items) to My Meals. */
export function SaveMealSheet({
  entries,
  defaultName,
  onClose,
  onSaved,
}: {
  entries: Entry[]
  defaultName: string
  onClose: () => void
  onSaved: (name: string) => void
}) {
  const [name, setName] = useState(defaultName)
  const [showError, setShowError] = useState(false)
  const t = sumTotals(entries)

  const save = async () => {
    if (!name.trim()) {
      setShowError(true)
      return
    }
    await saveEntriesAsMeal(name, entries)
    onSaved(name.trim())
    onClose()
  }

  return (
    <Sheet title="Save to My Meals" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <div className="card form inset">
          <div className="field">
            <label htmlFor="save-meal-name">Meal name</label>
            <input
              id="save-meal-name"
              value={name}
              maxLength={60}
              aria-invalid={showError}
              onChange={(e) => {
                setName(e.target.value)
                setShowError(false)
              }}
            />
            {showError && <p className="field-error">Add a name so you can find it later.</p>}
          </div>
        </div>
        <div className="card list inset">
          {entries.map((e) => (
            <div key={e.id} className="list-row static">
              <span className="list-main">
                <span className="entry-name">{e.name}</span>
              </span>
              <span className="entry-kcal">{fmt(e.kcal)}</span>
            </div>
          ))}
        </div>
        <p className="hint">
          Total {fmt(t.kcal)} kcal · P {fmt(t.protein)} · C {fmt(t.carbs)} · F {fmt(t.fat)}
        </p>
        <button type="submit" className="primary-button">
          Save meal
        </button>
      </form>
    </Sheet>
  )
}
