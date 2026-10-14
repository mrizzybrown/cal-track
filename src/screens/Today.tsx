import { useLiveQuery } from 'dexie-react-hooks'
import { getSettings } from '../db'

const MACROS = [
  { key: 'proteinTarget', label: 'Protein' },
  { key: 'carbsTarget', label: 'Carbs' },
  { key: 'fatTarget', label: 'Fat' },
] as const

export function TodayScreen() {
  const settings = useLiveQuery(() => getSettings(), [])
  if (!settings) return null

  const dateLabel = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  return (
    <>
      <header className="screen-header">
        <p className="eyebrow">{dateLabel}</p>
        <h1>Today</h1>
      </header>

      <section className="card summary">
        <p className="big-number">{settings.kcalTarget.toLocaleString()}</p>
        <p className="muted">calories left of {settings.kcalTarget.toLocaleString()}</p>
        <div className="macros">
          {MACROS.map((m) => (
            <div key={m.key} className="macro">
              <div className="macro-row">
                <span>{m.label}</span>
                <span className="muted">0 / {settings[m.key]} g</span>
              </div>
              <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={settings[m.key]} aria-valuenow={0}>
                <div className="bar-fill" style={{ width: '0%' }} />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="card meals">
        {settings.mealNames.map((name, i) => (
          <div key={i} className="meal-row">
            <span>{name}</span>
            <span className="muted">0 kcal</span>
          </div>
        ))}
      </section>

      <p className="empty-note">Food logging comes in the next update.</p>
    </>
  )
}
