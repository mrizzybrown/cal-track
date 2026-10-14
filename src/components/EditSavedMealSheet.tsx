import { useState } from 'react'
import { db, type SavedMeal } from '../db'
import { parseOptional } from '../entries'
import { mealTotals } from '../savedMeals'
import { Sheet } from './Sheet'

type FieldKey = 'kcal' | 'protein' | 'carbs' | 'fat'

const FIELDS: { key: FieldKey; label: string; unit: string }[] = [
  { key: 'kcal', label: 'Calories', unit: 'kcal' },
  { key: 'protein', label: 'Protein', unit: 'g' },
  { key: 'carbs', label: 'Carbs', unit: 'g' },
  { key: 'fat', label: 'Fat', unit: 'g' },
]

const fmt = (n: number) => Math.round(n).toLocaleString()

/** Rename, adjust or delete a saved meal. Macros are editable for one-item meals. */
export function EditSavedMealSheet({ meal, onClose }: { meal: SavedMeal; onClose: () => void }) {
  const single = meal.items.length === 1
  const item = meal.items[0]
  const [name, setName] = useState(meal.name)
  const [values, setValues] = useState<Record<FieldKey, string>>({
    kcal: String(item.kcal),
    protein: String(item.protein),
    carbs: String(item.carbs),
    fat: String(item.fat),
  })
  const [showErrors, setShowErrors] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const parsed = Object.fromEntries(FIELDS.map((f) => [f.key, parseOptional(values[f.key])])) as Record<
    FieldKey,
    ReturnType<typeof parseOptional>
  >
  const invalid = single
    ? FIELDS.filter((f) => typeof parsed[f.key] !== 'number' || (f.key === 'kcal' && parsed[f.key] === 0)).map(
        (f) => f.key,
      )
    : []
  const nameMissing = !name.trim()

  const save = async () => {
    if (invalid.length || nameMissing) {
      setShowErrors(true)
      return
    }
    const items = single
      ? [
          {
            ...item,
            name: name.trim(),
            kcal: parsed.kcal as number,
            protein: parsed.protein as number,
            carbs: parsed.carbs as number,
            fat: parsed.fat as number,
          },
        ]
      : meal.items
    await db.savedMeals.update(meal.id, { name: name.trim(), items })
    onClose()
  }

  const remove = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    await db.savedMeals.delete(meal.id)
    onClose()
  }

  const t = mealTotals(meal)

  return (
    <Sheet title="Edit meal" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <div className="card form inset">
          <div className="field">
            <label htmlFor="sm-name">Meal name</label>
            <input
              id="sm-name"
              value={name}
              maxLength={60}
              aria-invalid={showErrors && nameMissing}
              onChange={(e) => setName(e.target.value)}
            />
            {showErrors && nameMissing && <p className="field-error">Add a name.</p>}
          </div>
          {single &&
            FIELDS.map((f) => (
              <div key={f.key} className="field">
                <label htmlFor={`sm-${f.key}`}>{f.label}</label>
                <div className="input-wrap">
                  <input
                    id={`sm-${f.key}`}
                    inputMode="decimal"
                    value={values[f.key]}
                    aria-invalid={showErrors && invalid.includes(f.key)}
                    onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  />
                  <span className="unit">{f.unit}</span>
                </div>
                {showErrors && invalid.includes(f.key) && (
                  <p className="field-error">{f.key === 'kcal' ? 'Enter calories above 0.' : 'Enter a number, like 20.'}</p>
                )}
              </div>
            ))}
        </div>

        {!single && (
          <>
            <div className="card list inset">
              {meal.items.map((it, i) => (
                <div key={i} className="list-row static">
                  <span className="list-main">
                    <span className="entry-name">{it.name}</span>
                    <span className="entry-macros muted">
                      P {fmt(it.protein)} · C {fmt(it.carbs)} · F {fmt(it.fat)}
                    </span>
                  </span>
                  <span className="entry-kcal">{fmt(it.kcal)}</span>
                </div>
              ))}
            </div>
            <p className="hint">
              Total {fmt(t.kcal)} kcal. To change items, log the meal, edit them on Today, then save it again.
            </p>
          </>
        )}

        <button type="submit" className="primary-button">
          Save changes
        </button>
        <button type="button" className="danger-button" onClick={remove}>
          {confirmDelete ? `Tap again to delete “${meal.name}”` : 'Delete meal'}
        </button>
      </form>
    </Sheet>
  )
}
