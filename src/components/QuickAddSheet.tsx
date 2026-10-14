import { useState } from 'react'
import { db, type Entry, type MealIndex } from '../db'
import { addQuickEntry, parseOptional, quickAddValues, updateQuickEntry, type QuickAddInput } from '../entries'
import { Sheet } from './Sheet'

type FieldKey = 'kcal' | 'protein' | 'carbs' | 'fat'

const FIELDS: { key: FieldKey; label: string; unit: string }[] = [
  { key: 'kcal', label: 'Calories', unit: 'kcal' },
  { key: 'protein', label: 'Protein', unit: 'g' },
  { key: 'carbs', label: 'Carbs', unit: 'g' },
  { key: 'fat', label: 'Fat', unit: 'g' },
]

interface Props {
  date: string
  meal: MealIndex
  mealNames: readonly string[]
  /** When set, the sheet edits this entry instead of adding a new one. */
  entry?: Entry
  onClose: () => void
}

export function QuickAddSheet({ date, meal: initialMeal, mealNames, entry, onClose }: Props) {
  const [meal, setMeal] = useState<MealIndex>(entry?.meal ?? initialMeal)
  const [name, setName] = useState(entry && entry.name !== 'Quick add' ? entry.name : '')
  const [values, setValues] = useState<Record<FieldKey, string>>({
    kcal: entry ? String(entry.kcal) : '',
    protein: entry?.protein ? String(entry.protein) : '',
    carbs: entry?.carbs ? String(entry.carbs) : '',
    fat: entry?.fat ? String(entry.fat) : '',
  })
  const [showErrors, setShowErrors] = useState(false)

  const parsed = Object.fromEntries(FIELDS.map((f) => [f.key, parseOptional(values[f.key])])) as Record<
    FieldKey,
    ReturnType<typeof parseOptional>
  >
  const invalid = FIELDS.filter((f) => parsed[f.key] === 'invalid').map((f) => f.key)
  const input: QuickAddInput = {
    name,
    kcal: parsed.kcal === 'invalid' ? null : parsed.kcal,
    protein: parsed.protein === 'invalid' ? null : parsed.protein,
    carbs: parsed.carbs === 'invalid' ? null : parsed.carbs,
    fat: parsed.fat === 'invalid' ? null : parsed.fat,
  }
  const preview = invalid.length ? null : quickAddValues(input)
  const kcalFromMacros = parsed.kcal === null && preview

  const save = async () => {
    if (invalid.length || !preview) {
      setShowErrors(true)
      return
    }
    if (entry) await updateQuickEntry(entry.id, meal, input)
    else await addQuickEntry(date, meal, input)
    onClose()
  }

  const remove = async () => {
    if (!entry) return
    await db.entries.delete(entry.id)
    onClose()
  }

  return (
    <Sheet title={entry ? 'Edit entry' : 'Quick add'} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <div className="meal-chips" role="radiogroup" aria-label="Meal">
          {mealNames.map((n, i) => (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={meal === i}
              className={meal === i ? 'chip active' : 'chip'}
              onClick={() => setMeal(i as MealIndex)}
            >
              {n}
            </button>
          ))}
        </div>

        <div className="card form inset">
          {FIELDS.map((f, i) => (
            <div key={f.key} className="field">
              <label htmlFor={`qa-${f.key}`}>
                {f.label}
                {f.key !== 'kcal' && <span className="optional"> optional</span>}
              </label>
              <div className="input-wrap">
                <input
                  id={`qa-${f.key}`}
                  inputMode="decimal"
                  autoFocus={i === 0 && !entry}
                  placeholder={f.key === 'kcal' && kcalFromMacros ? String(preview.kcal) : '0'}
                  value={values[f.key]}
                  aria-invalid={showErrors && invalid.includes(f.key)}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                />
                <span className="unit">{f.unit}</span>
              </div>
              {showErrors && invalid.includes(f.key) && <p className="field-error">Enter a number, like 120.</p>}
            </div>
          ))}
          <div className="field">
            <label htmlFor="qa-name">
              Name<span className="optional"> optional</span>
            </label>
            <input
              id="qa-name"
              placeholder="Quick add"
              maxLength={60}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
        </div>

        {kcalFromMacros && <p className="hint">Calories worked out from macros: {preview.kcal} kcal.</p>}
        {showErrors && !invalid.length && !preview && (
          <p className="hint error">Enter calories, or some protein, carbs or fat.</p>
        )}

        <button type="submit" className="primary-button">
          {entry ? 'Save changes' : `Add to ${mealNames[meal]}`}
        </button>
        {entry && (
          <button type="button" className="danger-button" onClick={remove}>
            Delete entry
          </button>
        )}
      </form>
    </Sheet>
  )
}
