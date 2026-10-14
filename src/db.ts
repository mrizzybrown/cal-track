import Dexie, { type EntityTable } from 'dexie'

export type FoodSource = 'usda' | 'off' | 'custom' | 'quick'

export interface ServingSize {
  label: string // e.g. "1 cup", "1 slice"
  grams: number
}

/** Nutrition values are stored per 100 g. */
export interface Food {
  id: number
  name: string
  brand?: string
  barcode?: string
  source: FoodSource
  sourceId?: string
  kcal: number
  protein: number
  carbs: number
  fat: number
  servings: ServingSize[]
  /** Custom food entered per serving without a weight: values are per serving, log in servings only. */
  servingOnly?: boolean
  favorite: 0 | 1
  lastUsed?: number
  useCount: number
  /** The amount and unit you last logged, used as the default next time. */
  lastAmount?: number
  lastUnit?: string
}

export type MealIndex = 0 | 1 | 2 | 3

/** A logged item. Nutrition is copied in at log time so later food edits never change history. */
export interface Entry {
  id: number
  date: string // YYYY-MM-DD, local time
  meal: MealIndex
  foodId?: number
  name: string
  amount: number
  unit: string
  grams?: number
  kcal: number
  protein: number
  carbs: number
  fat: number
  createdAt: number
}

/** One item inside a saved meal. Nutrition is stored as logged, so it re-logs exactly. */
export interface SavedMealItem {
  name: string
  foodId?: number
  amount: number
  unit: string
  grams?: number
  kcal: number
  protein: number
  carbs: number
  fat: number
}

/** A meal you eat often, logged again in one tap. */
export interface SavedMeal {
  id: number
  name: string
  items: SavedMealItem[]
  lastUsed?: number
  useCount: number
  createdAt: number
}

export interface Weight {
  date: string // YYYY-MM-DD, one per day
  kg: number
}

export type WeightUnit = 'kg' | 'lb'

export interface Settings {
  id: 'main'
  kcalTarget: number
  proteinTarget: number
  carbsTarget: number
  fatTarget: number
  weightUnit: WeightUnit
  mealNames: [string, string, string, string]
}

export const DEFAULT_SETTINGS: Settings = {
  id: 'main',
  kcalTarget: 2000,
  proteinTarget: 150,
  carbsTarget: 200,
  fatTarget: 65,
  weightUnit: 'kg',
  mealNames: ['Breakfast', 'Lunch', 'Dinner', 'Snacks'],
}

export class CalTrackDB extends Dexie {
  foods!: EntityTable<Food, 'id'>
  entries!: EntityTable<Entry, 'id'>
  savedMeals!: EntityTable<SavedMeal, 'id'>
  weights!: EntityTable<Weight, 'date'>
  settings!: EntityTable<Settings, 'id'>

  constructor(name = 'cal-track') {
    super(name)
    this.version(1).stores({
      foods: '++id, name, barcode, favorite, lastUsed, [source+sourceId]',
      entries: '++id, date, [date+meal], foodId',
      savedMeals: '++id, name',
      weights: 'date',
      settings: 'id',
    })
    // v2: saved meals store their items' nutrition directly and track use for sorting.
    this.version(2).stores({
      savedMeals: '++id, name, lastUsed, useCount',
    })
  }
}

export const db = new CalTrackDB()

export async function getSettings(database: CalTrackDB = db): Promise<Settings> {
  const saved = await database.settings.get('main')
  return { ...DEFAULT_SETTINGS, ...saved }
}

export async function saveSettings(
  patch: Partial<Omit<Settings, 'id'>>,
  database: CalTrackDB = db,
): Promise<Settings> {
  const next = { ...(await getSettings(database)), ...patch, id: 'main' as const }
  await database.settings.put(next)
  return next
}

/**
 * Ask Safari to keep our data even when storage is tight.
 * Home Screen web apps are more likely to be granted this.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false
  if (await navigator.storage.persisted()) return true
  return navigator.storage.persist()
}
