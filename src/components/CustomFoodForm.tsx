import { useState } from 'react'
import { db } from '../db'
import { parseOptional } from '../entries'
import { createCustomFood, foodToCandidate, type FoodCandidate } from '../foods'

type Key = 'servingGrams' | 'kcal' | 'protein' | 'carbs' | 'fat'

const NUMBER_FIELDS: { key: Key; label: string; unit: string; optional?: boolean }[] = [
  { key: 'servingGrams', label: 'Serving weight', unit: 'g', optional: true },
  { key: 'kcal', label: 'Calories per serving', unit: 'kcal' },
  { key: 'protein', label: 'Protein per serving', unit: 'g', optional: true },
  { key: 'carbs', label: 'Carbs per serving', unit: 'g', optional: true },
  { key: 'fat', label: 'Fat per serving', unit: 'g', optional: true },
]

/** Create a food from a nutrition label. Opens the serving picker for it when saved. */
export function CustomFoodForm({
  initialName,
  barcode,
  onCreated,
}: {
  initialName: string
  /** Set when creating a food for a scanned barcode that wasn't found, so the next scan finds it. */
  barcode?: string
  onCreated: (f: FoodCandidate) => void
}) {
  const [name, setName] = useState(initialName)
  const [brand, setBrand] = useState('')
  const [servingLabel, setServingLabel] = useState('1 serving')
  const [values, setValues] = useState<Record<Key, string>>({ servingGrams: '', kcal: '', protein: '', carbs: '', fat: '' })
  const [showErrors, setShowErrors] = useState(false)

  const parsed = Object.fromEntries(NUMBER_FIELDS.map((f) => [f.key, parseOptional(values[f.key])])) as Record<
    Key,
    ReturnType<typeof parseOptional>
  >
  const errors: Partial<Record<Key | 'name', string>> = {}
  if (!name.trim()) errors.name = 'Add a name.'
  for (const f of NUMBER_FIELDS) if (parsed[f.key] === 'invalid') errors[f.key] = 'Enter a number, like 12.'
  if (!errors.kcal && !(typeof parsed.kcal === 'number' && parsed.kcal > 0)) errors.kcal = 'Enter calories above 0.'

  const val = (k: Key) => (typeof parsed[k] === 'number' ? (parsed[k] as number) : 0)

  const save = async () => {
    if (Object.keys(errors).length) {
      setShowErrors(true)
      return
    }
    const id = await createCustomFood({
      name,
      brand,
      barcode,
      servingLabel,
      servingGrams: typeof parsed.servingGrams === 'number' ? parsed.servingGrams : null,
      kcal: val('kcal'),
      protein: val('protein'),
      carbs: val('carbs'),
      fat: val('fat'),
    })
    const food = await db.foods.get(id)
    if (food) onCreated(foodToCandidate(food))
  }

  const err = (k: Key | 'name') => showErrors && errors[k]

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      {barcode && (
        <p className="hint">
          Barcode {barcode} isn't in the database yet. Add it from the label and it'll be found next time you scan it.
        </p>
      )}
      <div className="card form inset">
        <div className="field">
          <label htmlFor="cf-name">Food name</label>
          <input id="cf-name" value={name} maxLength={60} aria-invalid={!!err('name')} onChange={(e) => setName(e.target.value)} />
          {err('name') && <p className="field-error">{errors.name}</p>}
        </div>
        <div className="field">
          <label htmlFor="cf-brand">
            Brand<span className="optional"> optional</span>
          </label>
          <input id="cf-brand" value={brand} maxLength={40} onChange={(e) => setBrand(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="cf-serving">Serving name</label>
          <input
            id="cf-serving"
            value={servingLabel}
            maxLength={30}
            placeholder="e.g. 1 bar, 1 scoop"
            onChange={(e) => setServingLabel(e.target.value)}
          />
        </div>
        {NUMBER_FIELDS.map((f) => (
          <div key={f.key} className="field">
            <label htmlFor={`cf-${f.key}`}>
              {f.label}
              {f.optional && <span className="optional"> optional</span>}
            </label>
            <div className="input-wrap">
              <input
                id={`cf-${f.key}`}
                inputMode="decimal"
                placeholder="0"
                value={values[f.key]}
                aria-invalid={!!err(f.key)}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              />
              <span className="unit">{f.unit}</span>
            </div>
            {err(f.key) && <p className="field-error">{errors[f.key]}</p>}
          </div>
        ))}
      </div>
      <p className="hint">Add the serving weight to also log this food in grams.</p>
      <button type="submit" className="primary-button">
        Save food
      </button>
    </form>
  )
}
