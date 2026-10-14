import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, getSettings, type Lift, type LiftSet } from '../db'
import { dateLabel, parseOptional } from '../entries'
import { fromKg, localDateKey, toKg } from '../units'
import {
  addLift,
  bestPerDay,
  deleteLift,
  deleteSet,
  ensureStarterLifts,
  estimatedOneRepMax,
  logSet,
  pbSetIds,
  personalBest,
  renameLift,
} from '../lifts'
import { ProgressChart } from '../components/Charts'

type Unit = 'kg' | 'lb'
type Metric = 'top' | 'e1rm'

/** Weights to the nearest 0.25, without trailing zeros: 100, 102.5, 61.25. */
const num = (n: number) => String(Math.round(n * 4) / 4)
const weight = (kg: number, unit: Unit) => `${num(fromKg(kg, unit))} ${unit}`
const setLabel = (s: LiftSet, unit: Unit) => `${weight(s.kg, unit)} × ${s.reps}`

export function LiftsScreen() {
  const [openId, setOpenId] = useState<number | null>(null)
  const settings = useLiveQuery(() => getSettings(), [])
  const lifts = useLiveQuery(() => db.lifts.orderBy('id').toArray(), [])
  const sets = useLiveQuery(() => db.liftSets.toArray(), [])

  useEffect(() => {
    ensureStarterLifts().catch(() => {})
  }, [])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [openId])

  if (!settings || !lifts || !sets) return null
  const unit = settings.weightUnit
  const open = lifts.find((l) => l.id === openId)

  if (open) {
    return <LiftDetail lift={open} sets={sets.filter((s) => s.liftId === open.id)} unit={unit} onBack={() => setOpenId(null)} />
  }

  return (
    <>
      <header className="screen-header">
        <h1>Lifts</h1>
      </header>
      <h2 className="section-title">Personal bests</h2>
      <section className="card list">
        {lifts.map((l) => {
          const mine = sets.filter((s) => s.liftId === l.id)
          const pb = personalBest(mine)
          return (
            <button key={l.id} type="button" className="list-row" onClick={() => setOpenId(l.id)}>
              <span className="list-main">
                <span className="entry-name">{l.name}</span>
                <span className="entry-macros">{pb ? `PB ${dateLabel(pb.date, localDateKey())}` : 'No sets yet'}</span>
              </span>
              {pb && <span className="entry-kcal pb-value">{setLabel(pb, unit)}</span>}
              <svg className="row-chevron" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M9 5l7 7-7 7" />
              </svg>
            </button>
          )
        })}
      </section>
      <AddLiftForm />
      <p className="hint">Tap a lift to log a set and see its progress graph.</p>
    </>
  )
}

function AddLiftForm() {
  const [name, setName] = useState('')
  return (
    <form
      className="inline-form"
      onSubmit={async (e) => {
        e.preventDefault()
        if (await addLift(name)) setName('')
      }}
    >
      <input aria-label="New lift name" placeholder="Add a lift, like Barbell row" value={name} onChange={(e) => setName(e.target.value)} />
      <button type="submit" className="secondary-button" disabled={!name.trim()}>
        Add
      </button>
    </form>
  )
}

function LiftDetail({ lift, sets, unit, onBack }: { lift: Lift; sets: LiftSet[]; unit: Unit; onBack: () => void }) {
  const today = localDateKey()
  const [metric, setMetric] = useState<Metric>('top')
  const [showAll, setShowAll] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const pb = personalBest(sets)
  const pbIds = useMemo(() => pbSetIds(sets), [sets])
  const days = useMemo(() => bestPerDay(sets), [sets])
  const newestFirst = useMemo(
    () => [...sets].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt),
    [sets],
  )
  const points = days.map((s) => {
    // Est. 1RM uses the day's best estimate, which may come from a lighter set with more reps.
    const value =
      metric === 'top'
        ? s.kg
        : Math.max(...sets.filter((x) => x.date === s.date).map((x) => estimatedOneRepMax(x.kg, x.reps)))
    return { date: s.date, value: fromKg(value, unit), highlight: pbIds.has(s.id) }
  })

  return (
    <>
      <header className="screen-header lift-header">
        <button type="button" className="icon-button" aria-label="Back to lifts" onClick={onBack}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
        {renaming ? (
          <RenameForm lift={lift} onDone={() => setRenaming(false)} />
        ) : (
          <h1 className="lift-title">{lift.name}</h1>
        )}
      </header>

      {pb ? (
        <section className="card trend-card">
          <div>
            <p className="muted small">Personal best</p>
            <p className="trend-value">{setLabel(pb, unit)}</p>
            <p className="muted small">{dateLabel(pb.date, today)}</p>
          </div>
          <div className="trend-changes">
            <p>
              <span className="muted small">Est. 1RM</span> {weight(estimatedOneRepMax(pb.kg, pb.reps), unit)}
            </p>
            <p>
              <span className="muted small">Sets logged</span> {sets.length}
            </p>
          </div>
        </section>
      ) : (
        <p className="empty-note">Log your first set below. Your best set becomes your PB.</p>
      )}

      <SetForm key={`${lift.id}-${unit}`} liftId={lift.id} pb={pb} unit={unit} today={today} />

      {days.length > 0 && (
        <>
          <h2 className="section-title">Progress</h2>
          <div className="segmented" role="radiogroup" aria-label="Graph shows">
            {(
              [
                ['top', 'Top weight'],
                ['e1rm', 'Est. 1RM'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={metric === id}
                className={metric === id ? 'seg active' : 'seg'}
                onClick={() => setMetric(id)}
              >
                {label}
              </button>
            ))}
          </div>
          <section className="card chart-card">
            <ProgressChart points={points} unit={unit} label={`${lift.name} ${metric === 'top' ? 'top weight' : 'estimated 1RM'}`} />
            <p className="chart-key muted small">
              <span className="key-dot pb" /> New PB <span className="key-dot set" /> Best set that day
            </p>
          </section>
          {metric === 'e1rm' && <p className="hint">Est. 1RM guesses your one-rep max from weight × reps, so sets of 5 and singles compare fairly.</p>}

          <h2 className="section-title">Sets</h2>
          <section className="card list">
            {newestFirst.slice(0, showAll ? undefined : 15).map((s) => (
              <div key={s.id} className="list-row static">
                <span className="list-main">
                  <span className="entry-name">
                    {setLabel(s, unit)}
                    {pbIds.has(s.id) && (
                      <span className="pb-badge" aria-label="Personal best at the time">
                        PB
                      </span>
                    )}
                  </span>
                  <span className="entry-macros">{dateLabel(s.date, today)}</span>
                </span>
                <button type="button" className="link-button danger-link" aria-label={`Delete ${setLabel(s, unit)} on ${dateLabel(s.date, today)}`} onClick={() => deleteSet(s.id)}>
                  Delete
                </button>
              </div>
            ))}
          </section>
          {!showAll && sets.length > 15 && (
            <button type="button" className="link-button center-block" onClick={() => setShowAll(true)}>
              Show all {sets.length} sets
            </button>
          )}
        </>
      )}

      <div className="lift-actions">
        {!renaming && (
          <button type="button" className="secondary-button" onClick={() => setRenaming(true)}>
            Rename lift
          </button>
        )}
        {confirmDelete ? (
          <div className="confirm-box">
            <p>
              Delete {lift.name} and its {sets.length} {sets.length === 1 ? 'set' : 'sets'}?
            </p>
            <button
              type="button"
              className="danger-button"
              onClick={async () => {
                await deleteLift(lift.id)
                onBack()
              }}
            >
              Delete lift
            </button>
            <button type="button" className="secondary-button" onClick={() => setConfirmDelete(false)}>
              Cancel
            </button>
          </div>
        ) : (
          <button type="button" className="danger-button" onClick={() => setConfirmDelete(true)}>
            Delete lift
          </button>
        )}
      </div>
    </>
  )
}

function RenameForm({ lift, onDone }: { lift: Lift; onDone: () => void }) {
  const [name, setName] = useState(lift.name)
  return (
    <form
      className="inline-form rename"
      onSubmit={async (e) => {
        e.preventDefault()
        await renameLift(lift.id, name)
        onDone()
      }}
    >
      <input aria-label="Lift name" value={name} autoFocus onChange={(e) => setName(e.target.value)} />
      <button type="submit" className="secondary-button" disabled={!name.trim()}>
        Save
      </button>
    </form>
  )
}

function SetForm({ liftId, pb, unit, today }: { liftId: number; pb?: LiftSet; unit: Unit; today: string }) {
  const [kgText, setKgText] = useState('')
  const [repsText, setRepsText] = useState('')
  const [date, setDate] = useState(today)
  const [error, setError] = useState(false)
  const [result, setResult] = useState<'pb' | 'saved' | null>(null)

  const w = parseOptional(kgText)
  const r = parseOptional(repsText)
  const kg = typeof w === 'number' && w > 0 && w <= 1000 ? toKg(w, unit) : null
  const reps = typeof r === 'number' && r >= 1 && r <= 100 && Number.isInteger(r) ? r : null

  return (
    <form
      className="card form lift-form"
      onSubmit={async (e) => {
        e.preventDefault()
        if (kg === null || reps === null) return setError(true)
        const isPb = !pb || kg > pb.kg || (kg === pb.kg && reps > pb.reps)
        await logSet(liftId, date, kg, reps)
        setResult(isPb ? 'pb' : 'saved')
        setRepsText('')
        ;(document.activeElement as HTMLElement | null)?.blur()
      }}
    >
      <div className="field-row">
        <div className="field">
          <label htmlFor="set-weight">Weight</label>
          <div className="input-wrap">
            <input
              id="set-weight"
              inputMode="decimal"
              placeholder="0"
              value={kgText}
              aria-invalid={error && kg === null}
              onChange={(e) => {
                setKgText(e.target.value)
                setError(false)
                setResult(null)
              }}
            />
            <span className="unit">{unit}</span>
          </div>
        </div>
        <div className="field">
          <label htmlFor="set-reps">Reps</label>
          <input
            id="set-reps"
            inputMode="numeric"
            placeholder="0"
            value={repsText}
            aria-invalid={error && reps === null}
            onChange={(e) => {
              setRepsText(e.target.value)
              setError(false)
              setResult(null)
            }}
          />
        </div>
      </div>
      {error && <p className="field-error">Enter the weight and a whole number of reps.</p>}
      <div className="field">
        <label htmlFor="set-date">Date</label>
        <input id="set-date" type="date" value={date} max={today} onChange={(e) => e.target.value && e.target.value <= today && setDate(e.target.value)} />
      </div>
      <button type="submit" className="primary-button">
        Log set
      </button>
      {result && (
        <p className={result === 'pb' ? 'set-result pb' : 'set-result'} role="status">
          {result === 'pb' ? 'New personal best!' : 'Set logged.'}
        </p>
      )}
    </form>
  )
}
