import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Entry, type MealIndex, type SavedMeal } from '../db'
import { foodToCandidate, loadUsdaFoods, myFoods, searchFoods, searchOpenFoodFacts, type FoodCandidate } from '../foods'
import { listSavedMeals, logSavedMeal, mealTotals } from '../savedMeals'
import { CustomFoodForm } from './CustomFoodForm'
import { QuickAddForm } from './QuickAddForm'
import { ServingPicker } from './ServingPicker'
import { Sheet } from './Sheet'

const fmt = (n: number) => Math.round(n).toLocaleString()

type View =
  | { kind: 'home' }
  | { kind: 'quick' }
  | { kind: 'custom' }
  | { kind: 'serving'; food: FoodCandidate; last?: { amount: number; unit: string } }

interface Props {
  date: string
  meal: MealIndex
  mealNames: readonly string[]
  /** When set, edits this logged entry. */
  entry?: Entry
  onClose: () => void
  onLogged?: (ids: number[], label: string) => void
}

const MIN_ONLINE_QUERY = 3
const onlineCache = new Map<string, FoodCandidate[]>()

type OnlineState = { status: 'idle' } | { status: 'loading' } | { status: 'done'; results: FoodCandidate[] } | { status: 'error' }

export function AddFoodSheet({ date, meal: initialMeal, mealNames, entry, onClose, onLogged }: Props) {
  const [meal, setMeal] = useState<MealIndex>(entry?.meal ?? initialMeal)
  const [view, setView] = useState<View>(entry ? { kind: entry.foodId ? 'home' : 'quick' } : { kind: 'home' })
  const [query, setQuery] = useState('')
  const [online, setOnline] = useState<OnlineState>({ status: 'idle' })
  const [usda, setUsda] = useState<FoodCandidate[] | null>(null)
  const [usdaError, setUsdaError] = useState(false)
  const onlineAbort = useRef<AbortController | null>(null)

  const savedMeals = useLiveQuery(() => listSavedMeals(), [])
  const mine = useLiveQuery(() => myFoods(), [])

  // Editing a logged food: open its serving picker once the food loads.
  useEffect(() => {
    if (!entry?.foodId) return
    db.foods.get(entry.foodId).then((f) => {
      if (f) setView({ kind: 'serving', food: foodToCandidate(f) })
      else setView({ kind: 'quick' })
    })
  }, [entry])

  // Load the bundled USDA list the first time you search.
  useEffect(() => {
    if (!query.trim() || usda || usdaError) return
    loadUsdaFoods().then(setUsda, () => setUsdaError(true))
  }, [query, usda, usdaError])

  // Search UK supermarket products as you type, once you pause. Results are kept per search.
  useEffect(() => {
    onlineAbort.current?.abort()
    const q = query.trim().toLowerCase()
    if (q.length < MIN_ONLINE_QUERY) {
      setOnline({ status: 'idle' })
      return
    }
    const cached = onlineCache.get(q)
    if (cached) {
      setOnline({ status: 'done', results: cached })
      return
    }
    setOnline({ status: 'loading' })
    const timer = setTimeout(() => searchOnline(q), 700)
    return () => clearTimeout(timer)
  }, [query])

  const results = useMemo(
    () => (query.trim() && mine ? searchFoods(query, mine, usda ?? [], 40) : []),
    [query, mine, usda],
  )
  const yours = results.filter((f) => f.id !== undefined)
  const generic = results.filter((f) => f.id === undefined).slice(0, 15)
  // Hide supermarket products you've already saved; they show under "Your foods".
  const savedOff = new Set((mine ?? []).filter((f) => f.source === 'off').map((f) => f.sourceId))
  const products = online.status === 'done' ? online.results.filter((f) => !savedOff.has(f.sourceId)) : []

  const openFood = async (food: FoodCandidate) => {
    const saved =
      food.id !== undefined
        ? await db.foods.get(food.id)
        : food.sourceId
          ? await db.foods.where('[source+sourceId]').equals([food.source, food.sourceId]).first()
          : undefined
    const last = saved?.lastAmount && saved.lastUnit ? { amount: saved.lastAmount, unit: saved.lastUnit } : undefined
    setView({ kind: 'serving', food: saved ? foodToCandidate(saved) : food, last })
  }

  async function searchOnline(q: string) {
    const controller = new AbortController()
    onlineAbort.current = controller
    setOnline({ status: 'loading' })
    try {
      const found = await searchOpenFoodFacts(q, controller.signal)
      onlineCache.set(q, found)
      if (!controller.signal.aborted) setOnline({ status: 'done', results: found })
    } catch {
      if (!controller.signal.aborted) setOnline({ status: 'error' })
    }
  }

  const logMeal = async (m: SavedMeal) => {
    const ids = await logSavedMeal(m, date, meal)
    onLogged?.(ids, m.name)
    onClose()
  }

  const titles: Record<View['kind'], string> = {
    home: 'Add food',
    quick: entry ? 'Edit entry' : 'Quick add',
    custom: 'New food',
    serving: entry ? 'Edit entry' : 'How much?',
  }
  const back = !entry && view.kind !== 'home' ? () => setView({ kind: 'home' }) : undefined

  return (
    <Sheet title={titles[view.kind]} onClose={onClose} onBack={back}>
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

      {view.kind === 'quick' && (
        <QuickAddForm date={date} meal={meal} mealName={mealNames[meal]} entry={entry} onDone={onClose} onLogged={onLogged} />
      )}

      {view.kind === 'serving' && (
        <ServingPicker
          key={view.food.key}
          food={view.food}
          last={view.last}
          date={date}
          meal={meal}
          mealName={mealNames[meal]}
          entry={entry}
          onDone={onClose}
          onLogged={onLogged}
        />
      )}

      {view.kind === 'custom' && (
        <CustomFoodForm initialName={query.trim()} onCreated={(food) => setView({ kind: 'serving', food })} />
      )}

      {view.kind === 'home' && !entry && (
        <>
          <div className="search-wrap">
            <label htmlFor="food-search" className="visually-hidden">
              Search foods
            </label>
            <input
              id="food-search"
              type="search"
              className="search-input"
              placeholder="Search foods"
              autoComplete="off"
              autoCorrect="off"
              enterKeyHint="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          {!query.trim() && (
            <>
              <div className="action-row">
                <button type="button" className="action-tile" onClick={() => setView({ kind: 'quick' })}>
                  Quick add
                  <span className="muted small">Type calories</span>
                </button>
                <button type="button" className="action-tile" onClick={() => setView({ kind: 'custom' })}>
                  New food
                  <span className="muted small">From a label</span>
                </button>
              </div>

              {savedMeals && savedMeals.length > 0 && (
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
                </>
              )}
            </>
          )}

          {query.trim() && (
            <>
              {yours.length > 0 && (
                <>
                  <h3 className="sheet-section">Your foods</h3>
                  <div className="card list inset">
                    {yours.map((f) => (
                      <FoodRow key={f.key} food={f} onPick={openFood} />
                    ))}
                  </div>
                </>
              )}

              <h3 className="sheet-section">UK supermarkets</h3>
              {online.status === 'idle' && <p className="hint">Keep typing to search UK supermarket products.</p>}
              {online.status === 'loading' && <p className="hint">Searching UK products…</p>}
              {online.status === 'error' && (
                <>
                  <p className="hint error">Couldn't search UK products. You may be offline, or the database is busy.</p>
                  <button type="button" className="secondary-button" onClick={() => searchOnline(query.trim().toLowerCase())}>
                    Try again
                  </button>
                </>
              )}
              {online.status === 'done' &&
                (products.length ? (
                  <div className="card list inset">
                    {products.map((f) => (
                      <FoodRow key={f.key} food={f} onPick={openFood} />
                    ))}
                  </div>
                ) : (
                  <p className="hint">No UK products found. Try the brand or shop name, like “tesco hummus”.</p>
                ))}

              <h3 className="sheet-section">Fresh &amp; basic foods</h3>
              {usdaError && <p className="hint error">Couldn't load the food list. Check your connection and try again.</p>}
              {generic.length > 0 ? (
                <div className="card list inset">
                  {generic.map((f) => (
                    <FoodRow key={f.key} food={f} onPick={openFood} />
                  ))}
                </div>
              ) : (
                usda && <p className="hint">No matches.</p>
              )}

              <button type="button" className="link-button center-block" onClick={() => setView({ kind: 'custom' })}>
                Can't find it? Create “{query.trim()}”
              </button>
            </>
          )}
        </>
      )}
    </Sheet>
  )
}

function FoodRow({ food, onPick }: { food: FoodCandidate; onPick: (f: FoodCandidate) => void }) {
  const tag = food.source === 'custom' ? 'My food' : food.id !== undefined ? 'Used before' : null
  const basis = food.servingOnly
    ? `per ${food.servings[0]?.label ?? 'serving'}`
    : food.servings[0] && !/^[\d.]+\s*g$/i.test(food.servings[0].label)
      ? `per 100 g · ${food.servings[0].label} = ${fmt(food.servings[0].grams)} g`
      : 'per 100 g'
  return (
    <button type="button" className="list-row" onClick={() => onPick(food)}>
      <span className="list-main">
        <span className="entry-name">{food.name}</span>
        <span className="entry-macros muted">
          {food.brand ? `${food.brand} · ` : ''}
          {food.stores ? `${food.stores.join(', ')} · ` : ''}
          {fmt(food.kcal)} kcal {basis}
          {tag ? ` · ${tag}` : ''}
        </span>
      </span>
    </button>
  )
}
