import { useEffect, useState } from 'react'
import { db, type Entry, type MealIndex } from '../db'
import { parseOptional } from '../entries'
import {
  defaultPortion,
  entryName,
  logFood,
  nutritionFor,
  setFavorite,
  unitsFor,
  updateFoodEntry,
  type FoodCandidate,
} from '../foods'
import { saveEntriesAsMeal } from '../savedMeals'

const fmt = (n: number) => Math.round(n).toLocaleString()

interface Props {
  food: FoodCandidate
  date: string
  meal: MealIndex
  mealName: string
  /** When set, edits this logged entry instead of adding a new one. */
  entry?: Entry
  /** Last amount used for this food, if any. */
  last?: { amount: number; unit: string }
  onDone: () => void
  onLogged?: (ids: number[], label: string) => void
}

/** Choose how much of a food you had, with a live calorie and macro preview. */
export function ServingPicker({ food, date, meal, mealName, entry, last, onDone, onLogged }: Props) {
  const start = entry ? { amount: entry.amount, unit: entry.unit } : defaultPortion(food, last)
  const units = unitsFor(food)
  const [amountText, setAmountText] = useState(String(start.amount))
  const [unit, setUnit] = useState(units.includes(start.unit) ? start.unit : units[0])
  const [showError, setShowError] = useState(false)
  const [savedNote, setSavedNote] = useState('')
  const [favorite, setFav] = useState(false)

  useEffect(() => {
    const lookup =
      food.id !== undefined
        ? db.foods.get(food.id)
        : food.sourceId
          ? db.foods.where('[source+sourceId]').equals([food.source, food.sourceId]).first()
          : Promise.resolve(undefined)
    lookup.then((f) => setFav(f?.favorite === 1))
  }, [food])

  const toggleFavorite = async () => {
    const next = !favorite
    setFav(next)
    await setFavorite(food, next)
  }

  const parsed = parseOptional(amountText)
  const amount = typeof parsed === 'number' && parsed > 0 ? parsed : null
  const n = nutritionFor(food, amount ?? 0, unit)

  const save = async () => {
    if (amount === null) {
      setShowError(true)
      return
    }
    if (entry) {
      await updateFoodEntry(entry, food, amount, unit, meal)
    } else {
      const id = await logFood(food, amount, unit, date, meal)
      onLogged?.([id], food.name)
    }
    onDone()
  }

  const remove = async () => {
    if (!entry) return
    await db.entries.delete(entry.id)
    onDone()
  }

  const saveToMyMeals = async () => {
    if (!entry) return
    await saveEntriesAsMeal(entry.name, [entry])
    setSavedNote(`Saved “${entry.name}” to My Meals.`)
  }

  const showGrams = unit !== 'g' && !food.servingOnly

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      <div className="card food-head inset">
        <div className="food-title-row">
          <p className="food-title">{entryName(food)}</p>
          <button
            type="button"
            className={favorite ? 'star-button on' : 'star-button'}
            aria-pressed={favorite}
            aria-label={favorite ? 'Remove from favourites' : 'Add to favourites'}
            onClick={toggleFavorite}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 3.5l2.6 5.3 5.9.9-4.25 4.1 1 5.85L12 16.9l-5.25 2.75 1-5.85L3.5 9.7l5.9-.9z" />
            </svg>
          </button>
        </div>
        <p className="muted small">
          {food.servingOnly
            ? `Per ${food.servings[0]?.label ?? 'serving'}: ${fmt(food.kcal)} kcal`
            : `Per 100 g: ${fmt(food.kcal)} kcal · P ${food.protein} · C ${food.carbs} · F ${food.fat}`}
          {food.source === 'usda' && ' · USDA'}
          {food.source === 'off' && ' · Open Food Facts'}
        </p>
      </div>

      <div className="card form inset">
        <div className="field">
          <label htmlFor="sp-amount">Amount</label>
          <input
            id="sp-amount"
            inputMode="decimal"
            value={amountText}
            aria-invalid={showError && amount === null}
            onFocus={(e) => e.target.select()}
            onChange={(e) => {
              setAmountText(e.target.value)
              setShowError(false)
            }}
          />
          {showError && amount === null && <p className="field-error">Enter an amount above 0.</p>}
        </div>
        <div className="unit-chips" role="radiogroup" aria-label="Unit">
          {units.map((u) => (
            <button
              key={u}
              type="button"
              role="radio"
              aria-checked={unit === u}
              className={unit === u ? 'chip active' : 'chip'}
              onClick={() => setUnit(u)}
            >
              {u}
            </button>
          ))}
        </div>
      </div>

      <div className="card preview inset" aria-live="polite">
        <div className="preview-kcal">
          <span className="preview-number">{fmt(n.kcal)}</span>
          <span className="muted">kcal{showGrams && amount ? ` · ${fmt(n.grams)} g` : ''}</span>
        </div>
        <div className="preview-macros">
          <span>
            <strong>{n.protein}</strong> g protein
          </span>
          <span>
            <strong>{n.carbs}</strong> g carbs
          </span>
          <span>
            <strong>{n.fat}</strong> g fat
          </span>
        </div>
      </div>

      <button type="submit" className="primary-button">
        {entry ? 'Save changes' : `Add to ${mealName}`}
      </button>
      {entry && (
        <>
          <button type="button" className="secondary-button" onClick={saveToMyMeals} disabled={!!savedNote}>
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
  )
}
