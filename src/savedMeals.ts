import { db, type CalTrackDB, type Entry, type MealIndex, type SavedMeal, type SavedMealItem } from './db'
import { shiftDateKey, sumTotals, type Totals } from './entries'

export function mealTotals(meal: Pick<SavedMeal, 'items'>): Totals {
  return sumTotals(meal.items)
}

/** Most used first, then most recently used, then newest. */
export function listSavedMeals(database: CalTrackDB = db): Promise<SavedMeal[]> {
  return database.savedMeals.toArray().then((meals) =>
    meals.sort(
      (a, b) =>
        b.useCount - a.useCount || (b.lastUsed ?? 0) - (a.lastUsed ?? 0) || b.createdAt - a.createdAt,
    ),
  )
}

export function itemFromEntry(e: Entry): SavedMealItem {
  return {
    name: e.name,
    foodId: e.foodId,
    amount: e.amount,
    unit: e.unit,
    grams: e.grams,
    kcal: e.kcal,
    protein: e.protein,
    carbs: e.carbs,
    fat: e.fat,
  }
}

export async function createSavedMeal(
  name: string,
  items: SavedMealItem[],
  database: CalTrackDB = db,
): Promise<number | null> {
  const trimmed = name.trim()
  if (!trimmed || items.length === 0) return null
  return database.savedMeals.add({ name: trimmed, items, useCount: 0, createdAt: Date.now() } as SavedMeal)
}

/** Saves one or more logged entries as a reusable meal. */
export function saveEntriesAsMeal(name: string, entries: Entry[], database: CalTrackDB = db) {
  return createSavedMeal(name, entries.map(itemFromEntry), database)
}

/**
 * Logs every item of a saved meal into a day's meal slot.
 * A one-item meal logs under the saved meal's name; multi-item meals keep each item's name.
 */
export async function logSavedMeal(
  meal: SavedMeal,
  date: string,
  slot: MealIndex,
  database: CalTrackDB = db,
): Promise<number[]> {
  const now = Date.now()
  const single = meal.items.length === 1
  const rows = meal.items.map(
    (item, i) =>
      ({
        date,
        meal: slot,
        foodId: item.foodId,
        name: single ? meal.name : item.name,
        amount: item.amount,
        unit: item.unit,
        grams: item.grams,
        kcal: item.kcal,
        protein: item.protein,
        carbs: item.carbs,
        fat: item.fat,
        createdAt: now + i,
      }) as Entry,
  )
  return database.transaction('rw', database.entries, database.savedMeals, async () => {
    const ids = (await database.entries.bulkAdd(rows, { allKeys: true })) as number[]
    await database.savedMeals.update(meal.id, { lastUsed: now, useCount: meal.useCount + 1 })
    return ids
  })
}

/** Copies one meal slot from another day (e.g. yesterday's breakfast) into a date, optionally into a different meal. */
export async function copyMealFromDay(
  fromDate: string,
  toDate: string,
  slot: MealIndex,
  database: CalTrackDB = db,
  toSlot: MealIndex = slot,
): Promise<number[]> {
  const source = await database.entries.where('[date+meal]').equals([fromDate, slot]).sortBy('createdAt')
  const now = Date.now()
  return (await database.entries.bulkAdd(
    source.map(({ id: _id, ...rest }, i) => ({ ...rest, date: toDate, meal: toSlot, createdAt: now + i }) as Entry),
    { allKeys: true },
  )) as number[]
}

export interface PastMeal {
  date: string
  meal: MealIndex
  entries: Entry[]
  totals: Totals
}

/**
 * Meals you logged in this slot on earlier days, newest first, for copying. Repeats of the same
 * meal (same foods and amounts) show once, as the most recent.
 */
export async function pastMeals(
  beforeDate: string,
  slot: MealIndex,
  days = 14,
  database: CalTrackDB = db,
): Promise<PastMeal[]> {
  const from = shiftDateKey(beforeDate, -days)
  const rows = await database.entries.where('date').between(from, beforeDate, true, false).toArray()
  const byDate = new Map<string, Entry[]>()
  for (const e of rows) if (e.meal === slot) byDate.set(e.date, [...(byDate.get(e.date) ?? []), e])
  const seen = new Set<string>()
  const out: PastMeal[] = []
  for (const date of [...byDate.keys()].sort().reverse()) {
    const entries = byDate.get(date)!.sort((a, b) => a.createdAt - b.createdAt)
    const sig = entries.map((e) => `${e.name}|${e.amount}|${e.unit}`).sort().join(';')
    if (seen.has(sig)) continue
    seen.add(sig)
    out.push({ date, meal: slot, entries, totals: sumTotals(entries) })
  }
  return out
}
