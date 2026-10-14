import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Entry, type MealIndex, type SavedMeal } from '../db'
import { addQuickEntry, parseOptional, quickAddValues, updateQuickEntry, type QuickAddInput } from '../entries'
import { createSavedMeal, listSavedMeals, logSavedMeal, mealTotals, saveEntriesAsMeal } from '../savedMeals'
import { Sheet } from './Sheet'

type FieldKey = 'kcal' | 'protein' | 'carbs' | 'fat'

const FIELDS: { key: FieldKey; label: string; unit: string }[] = [
  { key: 'kcal', label: 'Calories', unit: 'kcal' },
  { key: 'protein', label: 'Protein', unit: 'g' },
  { key: 'carbs', label: 'Carbs', unit: 'g' },
  { key: 'fat', label: 'Fat', unit: 'g' },
]

const fmt = (n: number) => Math.round(n).toLocaleString()

interface Props {
  date: string
  meal: MealIndex
  mealNames: readonly string[]
  /** When set, the sheet edits this entry instead of adding a new one. */
  entry?: Entry
  onClose: () => void
  /** Called after something is logged, with the new entry ids, so the caller can offer undo. */
  onLogged?: (ids: number[], label: string) => void
}

export function QuickAddSheet({ date, meal: initialMeal, mealNames, entry, onClose, onLogged }: Props) {
  const [meal, setMeal] = useState<MealIndex>(entry?.meal ?? initialMeal)
  const [name, setName] = useState(entry && entry.name !== 'Quick add' ? entry.name : '')
  const [values, setValues] = useState<Record<FieldKey, string>>({
    kcal: entry ? String(entry.kcal) : '',
    protein: entry?.protein ? String(entry.protein) : '',
    carbs: entry?.carbs ? String(entry.carbs) : '',
    fat: entry?.fat ? String(entry.fat) : '',
  })
  const [saveToMyMeals, setSaveToMyMeals] = useState(false)
  const [showErrors, setShowErrors] = useState(false)
  const [savedNote, setSavedNote] = useState('')

  const savedMeals = useLiveQuery(() => (entry ? [] : listSavedMeals()), [entry])

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
  const needsName = saveToMyMeals && !name.trim()

  const save = async () => {
    if (invalid.length || !preview || needsName) {
      setShowErrors(true)
      return
    }
    if (entry) {
      await updateQuickEntry(entry.id, meal, input)
    } else {
      const id = await addQuickEntry(date, meal, input)
      if (saveToMyMeals) {
        await createSavedMeal(preview.name, [{ ...preview, amount: 1, unit: 'serving' }])
      }
      if (id !== null) onLogged?.([id], preview.name)
    }
    onClose()
  }

  const logMeal = async (m: SavedMeal) => {
    const ids = await logSavedMeal(m, date, meal)
    onLogged?.(ids, m.name)
    onClose()
  }

  const remove = async () => {
    if (!entry) return
    await db.entries.delete(entry.id)
    onClose()
  }

  const saveEntryToMyMeals = async () => {
    if (!entry) return
    await saveEntriesAsMeal(entry.name, [entry])
    setSavedNote(`Saved “${entry.name}” to My Meals.`)
  }

  return (
    <Sheet title={entry ? 'Edit entry' : 'Add food'} onClose={onClose}>
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

      {!entry && savedMeals && savedMeals.length > 0 && (
        <>
          <h3 className="sheet-section">My meals</h3>
          <div className="card list inset">
            {savedMeals.map((m) => {
              const t = mealTotals(m)
              return (
                <button key={m.id} type="button" className="list-row" onClick={() => logMeal(m)}>
                  <span className="list-main">
                    <span className="entry-name">{m.name}</span>
                    <span className="entry-macros muted">
                      P {fmt(t.protein)} · C {fmt(t.carbs)} · F {fmt(t.fat)}
                      {m.items.length > 1 ? ` · ${m.items.length} items` : ''}
                    </span>
                  </span>
                  <span className="entry-kcal">{fmt(t.kcal)}</span>
                  <span className="log-pill">Log</span>
                </button>
              )
            })}
          </div>
          <h3 className="sheet-section">Quick add</h3>
        </>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <div className="card form inset">
          {FIELDS.map((f) => (
            <div key={f.key} className="field">
              <label htmlFor={`qa-${f.key}`}>
                {f.label}
                {f.key !== 'kcal' && <span className="optional"> optional</span>}
              </label>
              <div className="input-wrap">
                <input
                  id={`qa-${f.key}`}
                  inputMode="decimal"
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
              Name{!saveToMyMeals && <span className="optional"> optional</span>}
            </label>
            <input
              id="qa-name"
              placeholder={saveToMyMeals ? 'e.g. Usual breakfast' : 'Quick add'}
              maxLength={60}
              value={name}
              aria-invalid={showErrors && needsName}
              onChange={(e) => setName(e.target.value)}
            />
            {showErrors && needsName && <p className="field-error">Add a name so you can find it in My Meals.</p>}
          </div>
        </div>

        {!entry && (
          <label className="check-row">
            <input type="checkbox" checked={saveToMyMeals} onChange={(e) => setSaveToMyMeals(e.target.checked)} />
            <span>Also save to My Meals</span>
          </label>
        )}

        {kcalFromMacros && <p className="hint">Calories worked out from macros: {preview.kcal} kcal.</p>}
        {showErrors && !invalid.length && !preview && (
          <p className="hint error">Enter calories, or some protein, carbs or fat.</p>
        )}

        <button type="submit" className="primary-button">
          {entry ? 'Save changes' : `Add to ${mealNames[meal]}`}
        </button>
        {entry && (
          <>
            <button type="button" className="secondary-button" onClick={saveEntryToMyMeals} disabled={!!savedNote}>
              {savedNote ? 'Saved to My Meals' : 'Save to My Meals'}
            </button>
            {savedNote && (
              <p className="hint center" role="status">
                {savedNote}
              </p>
            )}
            <button type="button" className="danger-button" onClick={remove}>
              Delete entry
            </button>
          </>
        )}
      </form>
    </Sheet>
  )
}
