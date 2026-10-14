import { db, type CalTrackDB, type Entry, type MealIndex, type SavedMeal, type SavedMealItem } from './db'
import { sumTotals, type Totals } from './entries'

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

/** Copies one meal slot from another day (e.g. yesterday's breakfast) into a date. */
export async function copyMealFromDay(
  fromDate: string,
  toDate: string,
  slot: MealIndex,
  database: CalTrackDB = db,
): Promise<number> {
  const source = await database.entries.where('[date+meal]').equals([fromDate, slot]).sortBy('createdAt')
  const now = Date.now()
  await database.entries.bulkAdd(
    source.map(({ id: _id, ...rest }, i) => ({ ...rest, date: toDate, createdAt: now + i }) as Entry),
  )
  return source.length
}
