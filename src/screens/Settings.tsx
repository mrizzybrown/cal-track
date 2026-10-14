import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { getSettings, saveSettings, type Settings, type WeightUnit } from '../db'
import { kcalFromMacros, parseTarget } from '../units'

type TargetKey = 'kcalTarget' | 'proteinTarget' | 'carbsTarget' | 'fatTarget'

const TARGET_FIELDS: { key: TargetKey; label: string; unit: string }[] = [
  { key: 'kcalTarget', label: 'Calories', unit: 'kcal' },
  { key: 'proteinTarget', label: 'Protein', unit: 'g' },
  { key: 'carbsTarget', label: 'Carbs', unit: 'g' },
  { key: 'fatTarget', label: 'Fat', unit: 'g' },
]

export function SettingsScreen() {
  const settings = useLiveQuery(() => getSettings(), [])
  const [persisted, setPersisted] = useState<boolean | null>(null)

  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted).catch(() => setPersisted(null))
  }, [])

  if (!settings) return null

  const macroKcal = kcalFromMacros(settings.proteinTarget, settings.carbsTarget, settings.fatTarget)

  return (
    <>
      <header className="screen-header">
        <h1>Settings</h1>
      </header>

      <h2 className="section-title">Daily targets</h2>
      <section className="card form">
        {TARGET_FIELDS.map((f) => (
          <TargetField key={f.key} field={f} settings={settings} />
        ))}
      </section>
      <p className="hint">
        Your protein, carbs and fat add up to {macroKcal.toLocaleString()} kcal
        {Math.abs(macroKcal - settings.kcalTarget) > 50 ? `, vs a ${settings.kcalTarget.toLocaleString()} kcal target.` : '.'}
      </p>

      <h2 className="section-title">Weight unit</h2>
      <section className="card">
        <div className="segmented" role="radiogroup" aria-label="Weight unit">
          {(['kg', 'lb'] as WeightUnit[]).map((u) => (
            <button
              key={u}
              type="button"
              role="radio"
              aria-checked={settings.weightUnit === u}
              className={settings.weightUnit === u ? 'seg active' : 'seg'}
              onClick={() => saveSettings({ weightUnit: u })}
            >
              {u}
            </button>
          ))}
        </div>
      </section>

      <h2 className="section-title">Meal names</h2>
      <section className="card form">
        {settings.mealNames.map((name, i) => (
          <MealNameField key={i} index={i} value={name} settings={settings} />
        ))}
      </section>

      <h2 className="section-title">Your data</h2>
      <section className="card">
        <p>Everything is stored on this iPhone only.</p>
        <p className="muted small">
          {persisted === true
            ? 'Protected storage is on, so iOS will not clear it to free space.'
            : 'Protected storage is not on yet. It usually turns on once Cal Track is opened from the Home Screen.'}
        </p>
        <p className="muted small">Backup export and import come in a later update.</p>
      </section>
    </>
  )
}

function TargetField({
  field,
  settings,
}: {
  field: (typeof TARGET_FIELDS)[number]
  settings: Settings
}) {
  const saved = settings[field.key]
  const [value, setValue] = useState(String(saved))
  const [error, setError] = useState(false)

  useEffect(() => setValue(String(saved)), [saved])

  const commit = () => {
    const n = parseTarget(value)
    if (n === null) {
      setError(true)
      return
    }
    setError(false)
    if (n !== saved) saveSettings({ [field.key]: n })
  }

  const id = `target-${field.key}`
  return (
    <div className="field">
      <label htmlFor={id}>{field.label}</label>
      <div className="input-wrap">
        <input
          id={id}
          inputMode="numeric"
          pattern="[0-9]*"
          value={value}
          aria-invalid={error}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(e) => {
            setValue(e.target.value)
            if (error) setError(false)
          }}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
        <span className="unit">{field.unit}</span>
      </div>
      {error && (
        <p id={`${id}-error`} className="field-error">
          Enter a number above 0.
        </p>
      )}
    </div>
  )
}

function MealNameField({ index, value, settings }: { index: number; value: string; settings: Settings }) {
  const [text, setText] = useState(value)
  useEffect(() => setText(value), [value])

  const commit = () => {
    const trimmed = text.trim()
    if (!trimmed) {
      setText(value)
      return
    }
    if (trimmed === value) return
    const names = [...settings.mealNames] as Settings['mealNames']
    names[index] = trimmed
    saveSettings({ mealNames: names })
  }

  const id = `meal-${index}`
  return (
    <div className="field">
      <label htmlFor={id}>Meal {index + 1}</label>
      <input
        id={id}
        value={text}
        maxLength={24}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
    </div>
  )
}
