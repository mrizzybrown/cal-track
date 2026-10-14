import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, type Entry, type Food, type MealIndex, type SavedMeal } from '../db'
import { dateLabel } from '../entries'
import { localDateKey } from '../units'
import {
  favoriteFoods,
  foodToCandidate,
  loadUsdaFoods,
  myFoods,
  recentFoods,
  relogFood,
  searchFoods,
  searchOpenFoodFacts,
  usualPortion,
  entryName,
  nutritionFor,
  type FoodCandidate,
} from '../foods'
import { copyMealFromDay, listSavedMeals, logSavedMeal, mealTotals, pastMeals, type PastMeal } from '../savedMeals'
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

type ListKey = 'recent' | 'favs' | 'meals' | 'past'
const LISTS: { key: ListKey; label: string }[] = [
  { key: 'recent', label: 'Recent' },
  { key: 'favs', label: 'Favourites' },
  { key: 'meals', label: 'My meals' },
  { key: 'past', label: 'Past days' },
]

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
  const recent = useLiveQuery(() => recentFoods(), [])
  const favorites = useLiveQuery(() => favoriteFoods(), [])
  const past = useLiveQuery(() => pastMeals(date, meal), [date, meal])
  const [chosenList, setList] = useState<ListKey | null>(null)
  // Items added with one tap while the sheet is open, so each can be undone.
  const [added, setAdded] = useState<Map<string, number[]>>(new Map())
  const today = localDateKey()
  const list: ListKey = chosenList ?? (recent?.length || !savedMeals?.length ? 'recent' : 'meals')

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

  const openSaved = (f: Food) => {
    const last = f.lastAmount && f.lastUnit ? { amount: f.lastAmount, unit: f.lastUnit } : undefined
    setView({ kind: 'serving', food: foodToCandidate(f), last })
  }

  const markAdded = (key: string, ids: number[]) => setAdded((m) => new Map(m).set(key, ids))

  const addFood = async (f: Food) => markAdded(`f${f.id}`, [await relogFood(f, date, meal)])

  const copyPast = async (p: PastMeal) => markAdded(`p${p.date}`, await copyMealFromDay(p.date, date, p.meal, db, meal))

  const undoAdd = async (key: string) => {
    const ids = added.get(key)
    if (ids) await db.entries.bulkDelete(ids)
    setAdded((m) => {
      const next = new Map(m)
      next.delete(key)
      return next
    })
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

              <div className="segmented four" role="tablist" aria-label="Lists">
                {LISTS.map((l) => (
                  <button
                    key={l.key}
                    type="button"
                    role="tab"
                    aria-selected={list === l.key}
                    className={list === l.key ? 'seg active' : 'seg'}
                    onClick={() => setList(l.key)}
                  >
                    {l.label}
                  </button>
                ))}
              </div>

              {list === 'recent' &&
                (recent?.length ? (
                  <div className="card list inset">
                    {recent.map((f) => (
                      <QuickFoodRow key={f.id} food={f} added={added.get(`f${f.id}`)} onOpen={openSaved} onAdd={addFood} onUndo={undoAdd} />
                    ))}
                  </div>
                ) : (
                  <p className="hint">Foods you log show here, ready to add again in one tap.</p>
                ))}

              {list === 'favs' &&
                (favorites?.length ? (
                  <div className="card list inset">
                    {favorites.map((f) => (
                      <QuickFoodRow key={f.id} food={f} added={added.get(`f${f.id}`)} onOpen={openSaved} onAdd={addFood} onUndo={undoAdd} />
                    ))}
                  </div>
                ) : (
                  <p className="hint">Tap the star on a food to keep it here.</p>
                ))}

              {list === 'meals' &&
                (savedMeals?.length ? (
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
                ) : (
                  <p className="hint">Save a meal you eat often from its card on Today, then log it here in one tap.</p>
                ))}

              {list === 'past' &&
                (past?.length ? (
                  <div className="card list inset">
                    {past.map((p) => {
                      const key = `p${p.date}`
                      const done = added.get(key)
                      return (
                        <div key={p.date} className="list-row">
                          <span className="list-main">
                            <span className="entry-name">{dateLabel(p.date, today)}</span>
                            <span className="entry-macros muted clamp">{p.entries.map((e) => e.name).join(', ')}</span>
                          </span>
                          <span className="entry-kcal">{fmt(p.totals.kcal)}</span>
                          {done ? (
                            <button type="button" className="undo-pill" onClick={() => undoAdd(key)}>
                              Undo
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="log-pill"
                              aria-label={`Copy ${dateLabel(p.date, today)}'s ${mealNames[p.meal]}`}
                              onClick={() => copyPast(p)}
                            >
                              Copy
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <p className="hint">No {mealNames[meal].toLowerCase()} logged in the last two weeks.</p>
                ))}

              {added.size > 0 && (
                <button type="button" className="primary-button" onClick={onClose}>
                  Done
                </button>
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

interface QuickFoodRowProps {
  food: Food
  added?: number[]
  onOpen: (f: Food) => void
  onAdd: (f: Food) => void
  onUndo: (key: string) => void
}

/** A saved food: tap the name to choose an amount, or Add to log your usual portion. */
function QuickFoodRow({ food, added, onOpen, onAdd, onUndo }: QuickFoodRowProps) {
  const portion = usualPortion(food)
  const n = nutritionFor(foodToCandidate(food), portion.amount, portion.unit)
  const amount = portion.unit === 'g' || portion.unit === 'oz' ? `${fmt(portion.amount)} ${portion.unit}` : `${portion.amount} × ${portion.unit}`
  return (
    <div className="list-row">
      <button type="button" className="row-open" onClick={() => onOpen(food)}>
        <span className="entry-name">
          {food.favorite ? <span className="star-mark" aria-label="Favourite">★ </span> : null}
          {entryName(food)}
        </span>
        <span className="entry-macros muted">
          {amount} · {fmt(n.kcal)} kcal
        </span>
      </button>
      {added ? (
        <button type="button" className="undo-pill" onClick={() => onUndo(`f${food.id}`)}>
          Undo
        </button>
      ) : (
        <button type="button" className="log-pill" aria-label={`Add ${amount} ${food.name}`} onClick={() => onAdd(food)}>
          Add
        </button>
      )}
    </div>
  )
}
