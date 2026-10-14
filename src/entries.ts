import { db, type CalTrackDB, type Entry, type MealIndex } from './db'

export interface Totals {
  kcal: number
  protein: number
  carbs: number
  fat: number
}

export const ZERO_TOTALS: Totals = { kcal: 0, protein: 0, carbs: 0, fat: 0 }

export function sumTotals(entries: Pick<Entry, keyof Totals>[]): Totals {
  return entries.reduce(
    (t, e) => ({
      kcal: t.kcal + e.kcal,
      protein: t.protein + e.protein,
      carbs: t.carbs + e.carbs,
      fat: t.fat + e.fat,
    }),
    { ...ZERO_TOTALS },
  )
}

/** Picks the meal you're most likely logging right now. */
export function mealForTime(d: Date = new Date()): MealIndex {
  const h = d.getHours()
  if (h >= 4 && h < 11) return 0
  if (h >= 11 && h < 15) return 1
  if (h >= 17 && h < 22) return 2
  return 3
}

/** Moves a YYYY-MM-DD date key by whole days. */
export function shiftDateKey(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number)
  const date = new Date(y, m - 1, d + days)
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${mm}-${dd}`
}

export interface QuickAddInput {
  name: string
  kcal: number | null
  protein: number | null
  carbs: number | null
  fat: number | null
}

/**
 * Turns a quick-add form into entry values. Calories are required unless
 * macros are given, in which case calories are worked out from them.
 * Returns null when there is nothing to log.
 */
export function quickAddValues(input: QuickAddInput): (Totals & { name: string }) | null {
  const protein = input.protein ?? 0
  const carbs = input.carbs ?? 0
  const fat = input.fat ?? 0
  const kcal = input.kcal ?? Math.round(protein * 4 + carbs * 4 + fat * 9)
  if (kcal <= 0) return null
  return { name: input.name.trim() || 'Quick add', kcal, protein, carbs, fat }
}

export async function addQuickEntry(
  date: string,
  meal: MealIndex,
  input: QuickAddInput,
  database: CalTrackDB = db,
): Promise<number | null> {
  const values = quickAddValues(input)
  if (!values) return null
  return database.entries.add({
    date,
    meal,
    name: values.name,
    amount: 1,
    unit: 'serving',
    kcal: values.kcal,
    protein: values.protein,
    carbs: values.carbs,
    fat: values.fat,
    createdAt: Date.now(),
  } as Entry)
}

export async function updateQuickEntry(
  id: number,
  meal: MealIndex,
  input: QuickAddInput,
  database: CalTrackDB = db,
): Promise<boolean> {
  const values = quickAddValues(input)
  if (!values) return false
  await database.entries.update(id, { meal, ...values })
  return true
}

export function entriesForDate(date: string, database: CalTrackDB = db): Promise<Entry[]> {
  return database.entries.where('date').equals(date).sortBy('createdAt')
}

/** Parses an optional non-negative number field; blank means null. */
export function parseOptional(input: string): number | null | 'invalid' {
  const s = input.trim().replace(',', '.')
  if (s === '') return null
  const n = Number(s)
  if (!Number.isFinite(n) || n < 0 || n > 20000) return 'invalid'
  return Math.round(n * 10) / 10
}

/** "Today", "Yesterday", "Tomorrow", or a short date like "Tue 12 Oct". */
export function dateLabel(key: string, today: string): string {
  if (key === today) return 'Today'
  if (key === shiftDateKey(today, -1)) return 'Yesterday'
  if (key === shiftDateKey(today, 1)) return 'Tomorrow'
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })
}
