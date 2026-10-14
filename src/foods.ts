import { db, type CalTrackDB, type Entry, type Food, type MealIndex, type ServingSize } from './db'
import type { Totals } from './entries'

/** A food as shown in search results. Not stored until you log it. */
export interface FoodCandidate {
  key: string
  name: string
  brand?: string
  barcode?: string
  source: Food['source']
  sourceId?: string
  kcal: number
  protein: number
  carbs: number
  fat: number
  servings: ServingSize[]
  /** Custom foods entered per serving with no weight can only be logged in servings. */
  servingOnly?: boolean
  /** Main UK supermarkets that sell this product (Open Food Facts only). */
  stores?: string[]
  /** Set when this candidate is already in your foods table. */
  id?: number
}

export const GRAMS_PER_OZ = 28.3495

// ---------- Units and nutrition ----------

/** Units you can log a food in: grams and ounces (unless serving-only), then its own servings. */
export function unitsFor(food: Pick<FoodCandidate, 'servings' | 'servingOnly'>): string[] {
  const own = food.servings.map((s) => s.label)
  return food.servingOnly ? own : [...own, 'g', 'oz']
}

export function gramsFor(food: Pick<FoodCandidate, 'servings'>, amount: number, unit: string): number {
  if (unit === 'g') return amount
  if (unit === 'oz') return amount * GRAMS_PER_OZ
  const serving = food.servings.find((s) => s.label === unit)
  return amount * (serving?.grams ?? 100)
}

const r1 = (n: number) => Math.round(n * 10) / 10

/** Nutrition for an amount of a food. Food values are per 100 g. */
export function nutritionFor(
  food: Pick<FoodCandidate, 'kcal' | 'protein' | 'carbs' | 'fat' | 'servings'>,
  amount: number,
  unit: string,
): Totals & { grams: number } {
  const grams = gramsFor(food, amount, unit)
  const k = grams / 100
  return {
    grams: r1(grams),
    kcal: Math.round(food.kcal * k),
    protein: r1(food.protein * k),
    carbs: r1(food.carbs * k),
    fat: r1(food.fat * k),
  }
}

/** The amount and unit to start the serving picker with. */
export function defaultPortion(food: FoodCandidate, last?: { amount: number; unit: string }) {
  if (last && unitsFor(food).includes(last.unit)) return last
  if (food.servings.length) return { amount: 1, unit: food.servings[0].label }
  return { amount: 100, unit: 'g' }
}

// ---------- USDA (bundled) ----------

type UsdaRow = [name: string, kcal: number, protein: number, carbs: number, fat: number]

let usdaCache: Promise<FoodCandidate[]> | null = null

/** Loads the bundled USDA list once. It is cached offline by the service worker. */
export function loadUsdaFoods(): Promise<FoodCandidate[]> {
  usdaCache ??= fetch(`${import.meta.env.BASE_URL}usda-foods.json`)
    .then((r) => {
      if (!r.ok) throw new Error(`USDA list: HTTP ${r.status}`)
      return r.json() as Promise<UsdaRow[]>
    })
    .then((rows) => rows.map(usdaToCandidate))
    .catch((e) => {
      usdaCache = null
      throw e
    })
  return usdaCache
}

export function usdaToCandidate([name, kcal, protein, carbs, fat]: UsdaRow): FoodCandidate {
  const sourceId = `${name}|${kcal}`
  return { key: `usda:${sourceId}`, name, source: 'usda', sourceId, kcal, protein, carbs, fat, servings: [] }
}

export function foodToCandidate(f: Food): FoodCandidate {
  return {
    key: `food:${f.id}`,
    id: f.id,
    name: f.name,
    brand: f.brand,
    barcode: f.barcode,
    source: f.source,
    sourceId: f.sourceId,
    kcal: f.kcal,
    protein: f.protein,
    carbs: f.carbs,
    fat: f.fat,
    servings: f.servings,
    servingOnly: f.servingOnly,
  }
}

// ---------- Search ----------

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

const words = (s: string) => normalize(s).split(/[^a-z0-9%]+/).filter(Boolean)

/**
 * Scores how well a name matches a query. Every query word must be the start of some word in the name.
 * Lower is better; null means no match.
 */
export function matchScore(name: string, query: string): number | null {
  const q = words(query)
  if (!q.length) return null
  const n = words(name)
  let score = 0
  for (const term of q) {
    const idx = n.findIndex((w) => w.startsWith(term))
    if (idx === -1) return null
    score += idx + (n[idx] === term ? 0 : 0.5)
  }
  // Prefer short, plain names ("Bananas, raw") over long prepared variants.
  return score + n.length * 0.3
}

/**
 * Searches your own foods first, then the bundled USDA list, skipping USDA rows you already saved.
 */
export function searchFoods(query: string, mine: FoodCandidate[], usda: FoodCandidate[], limit = 25): FoodCandidate[] {
  const rank = (list: FoodCandidate[]) =>
    list
      .map((f) => ({ f, s: matchScore(`${f.name} ${f.brand ?? ''}`, query) }))
      .filter((x): x is { f: FoodCandidate; s: number } => x.s !== null)
      .sort((a, b) => a.s - b.s)
      .map((x) => x.f)

  const own = rank(mine)
  const savedUsda = new Set(mine.filter((f) => f.source === 'usda').map((f) => f.sourceId))
  const general = rank(usda.filter((f) => !savedUsda.has(f.sourceId)))
  return [...own, ...general].slice(0, limit)
}

// ---------- Open Food Facts (online, UK) ----------

interface OffProduct {
  code?: string
  product_name?: string
  product_name_en?: string
  brands?: string
  stores?: string
  countries_tags?: string[]
  serving_size?: string
  serving_quantity?: number | string
  nutriments?: Record<string, number | string | undefined>
}

const num = (v: unknown): number | undefined => {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined
}

/** Main UK supermarkets, as they are usually written in Open Food Facts store lists. */
export const UK_SUPERMARKETS: [name: string, match: RegExp][] = [
  ['Tesco', /tesco/i],
  ["Sainsbury's", /sainsbury/i],
  ['Asda', /asda/i],
  ['Aldi', /aldi/i],
  ['Lidl', /lidl/i],
  ['Morrisons', /morrison/i],
  ['M&S', /m\s*&\s*s|marks\s*(&|and)\s*spencer/i],
  ['Waitrose', /waitrose/i],
  ['Co-op', /co-?op\b/i],
  ['Iceland', /iceland/i],
  ['Ocado', /ocado/i],
]

/** The main UK supermarkets named in a product's store list, e.g. "Tesco, Aldi". */
export function ukStores(stores?: string): string[] {
  if (!stores) return []
  return UK_SUPERMARKETS.filter(([, re]) => re.test(stores)).map(([name]) => name)
}

/** Converts an Open Food Facts product to a candidate, or null if it lacks calories or isn't sold in the UK. */
export function offToCandidate(p: OffProduct): FoodCandidate | null {
  if (p.countries_tags && !p.countries_tags.includes('en:united-kingdom')) return null
  const n = p.nutriments ?? {}
  const kcal = num(n['energy-kcal_100g']) ?? (num(n['energy_100g']) !== undefined ? num(n['energy_100g'])! / 4.184 : undefined)
  const name = (p.product_name_en || p.product_name)?.trim()
  if (!name || kcal === undefined || !p.code) return null
  const servingGrams = num(p.serving_quantity)
  const servings: ServingSize[] =
    servingGrams && servingGrams > 0 ? [{ label: p.serving_size?.trim() || 'serving', grams: servingGrams }] : []
  const stores = ukStores(p.stores)
  return {
    key: `off:${p.code}`,
    name,
    brand: p.brands?.split(',')[0]?.trim() || undefined,
    barcode: p.code,
    source: 'off',
    sourceId: p.code,
    kcal: Math.round(kcal),
    protein: r1(num(n['proteins_100g']) ?? 0),
    carbs: r1(num(n['carbohydrates_100g']) ?? 0),
    fat: r1(num(n['fat_100g']) ?? 0),
    servings,
    stores: stores.length ? stores : undefined,
  }
}

/** Puts products from the main UK supermarkets first, keeping Open Food Facts' popularity order otherwise. */
export function rankUkProducts(list: FoodCandidate[]): FoodCandidate[] {
  return list
    .map((f, i) => ({ f, i }))
    .sort((a, b) => (b.f.stores ? 1 : 0) - (a.f.stores ? 1 : 0) || a.i - b.i)
    .map((x) => x.f)
}

const OFF_FIELDS = 'code,product_name,product_name_en,brands,stores,countries_tags,serving_size,serving_quantity,nutriments'

export function openFoodFactsUrl(query: string): string {
  return (
    `https://uk.openfoodfacts.org/cgi/search.pl?search_simple=1&json=1&page_size=40` +
    `&tagtype_0=countries&tag_contains_0=contains&tag_0=united-kingdom&sort_by=unique_scans_n` +
    `&fields=${OFF_FIELDS}&search_terms=${encodeURIComponent(query)}`
  )
}

/**
 * Searches Open Food Facts for packaged foods sold in the UK, most scanned first, with the main
 * supermarkets' products on top. Needs internet; limited to about 10 searches a minute.
 */
export async function searchOpenFoodFacts(query: string, signal?: AbortSignal): Promise<FoodCandidate[]> {
  const res = await fetch(openFoodFactsUrl(query), { signal })
  if (!res.ok) throw new Error(`Open Food Facts: HTTP ${res.status}`)
  const data = (await res.json()) as { products?: OffProduct[] }
  const found = (data.products ?? []).map(offToCandidate).filter((c): c is FoodCandidate => c !== null)
  return rankUkProducts(found).slice(0, 25)
}

// ---------- Saving and logging ----------

/** Makes sure a candidate is in your foods table and returns its id. */
export async function ensureFood(c: FoodCandidate, database: CalTrackDB = db): Promise<number> {
  if (c.id !== undefined) return c.id
  if (c.sourceId) {
    const existing = await database.foods.where('[source+sourceId]').equals([c.source, c.sourceId]).first()
    if (existing) return existing.id
  }
  return database.foods.add({
    name: c.name,
    brand: c.brand,
    barcode: c.barcode,
    source: c.source,
    sourceId: c.sourceId,
    kcal: c.kcal,
    protein: c.protein,
    carbs: c.carbs,
    fat: c.fat,
    servings: c.servings,
    servingOnly: c.servingOnly,
    favorite: 0,
    useCount: 0,
  } as Food)
}

export function entryName(c: Pick<FoodCandidate, 'name' | 'brand'>): string {
  return c.brand ? `${c.name} (${c.brand})` : c.name
}

export async function logFood(
  c: FoodCandidate,
  amount: number,
  unit: string,
  date: string,
  meal: MealIndex,
  database: CalTrackDB = db,
): Promise<number> {
  const n = nutritionFor(c, amount, unit)
  return database.transaction('rw', database.foods, database.entries, async () => {
    const foodId = await ensureFood(c, database)
    const food = await database.foods.get(foodId)
    await database.foods.update(foodId, {
      lastUsed: Date.now(),
      useCount: (food?.useCount ?? 0) + 1,
      lastAmount: amount,
      lastUnit: unit,
    })
    return database.entries.add({
      date,
      meal,
      foodId,
      name: entryName(c),
      amount,
      unit,
      grams: n.grams,
      kcal: n.kcal,
      protein: n.protein,
      carbs: n.carbs,
      fat: n.fat,
      createdAt: Date.now(),
    } as Entry)
  })
}

/** Changes the amount, unit or meal of a logged food, recalculating its nutrition from the food. */
export async function updateFoodEntry(
  entry: Entry,
  food: FoodCandidate,
  amount: number,
  unit: string,
  meal: MealIndex,
  database: CalTrackDB = db,
): Promise<void> {
  const n = nutritionFor(food, amount, unit)
  await database.entries.update(entry.id, { amount, unit, meal, ...n })
}

export interface CustomFoodInput {
  name: string
  brand?: string
  servingLabel: string
  servingGrams: number | null
  kcal: number
  protein: number
  carbs: number
  fat: number
}

/**
 * Saves a food you entered from a label, per serving. With a serving weight it is stored per 100 g
 * like other foods; without one it can only be logged in servings.
 */
export async function createCustomFood(input: CustomFoodInput, database: CalTrackDB = db): Promise<number> {
  const label = input.servingLabel.trim() || 'serving'
  const grams = input.servingGrams && input.servingGrams > 0 ? input.servingGrams : null
  const per100 = grams ? 100 / grams : 1
  return database.foods.add({
    name: input.name.trim(),
    brand: input.brand?.trim() || undefined,
    source: 'custom',
    kcal: Math.round(input.kcal * per100),
    protein: r1(input.protein * per100),
    carbs: r1(input.carbs * per100),
    fat: r1(input.fat * per100),
    // Serving-only foods keep per-serving values, so the serving counts as "100 g" internally.
    servings: [{ label, grams: grams ?? 100 }],
    servingOnly: grams ? undefined : true,
    favorite: 0,
    useCount: 0,
  } as Food)
}

export async function myFoods(database: CalTrackDB = db): Promise<FoodCandidate[]> {
  const all = await database.foods.toArray()
  return all.sort((a, b) => b.useCount - a.useCount).map(foodToCandidate)
}

// ---------- Fast logging ----------

/** Foods you've logged, most recent first. */
export async function recentFoods(limit = 20, database: CalTrackDB = db): Promise<Food[]> {
  return database.foods.orderBy('lastUsed').reverse().limit(limit).toArray()
}

/** Your starred foods, A to Z. */
export async function favoriteFoods(database: CalTrackDB = db): Promise<Food[]> {
  const list = await database.foods.where('favorite').equals(1).toArray()
  return list.sort((a, b) => a.name.localeCompare(b.name))
}

/** Stars or unstars a food, saving it first if it came from search. Returns the food's id. */
export async function setFavorite(c: FoodCandidate, favorite: boolean, database: CalTrackDB = db): Promise<number> {
  const id = await ensureFood(c, database)
  await database.foods.update(id, { favorite: favorite ? 1 : 0 })
  return id
}

/** The amount a one-tap log uses: what you had last time, else one serving, else 100 g. */
export function usualPortion(f: Food): { amount: number; unit: string } {
  const last = f.lastAmount && f.lastUnit ? { amount: f.lastAmount, unit: f.lastUnit } : undefined
  return defaultPortion(foodToCandidate(f), last)
}

/** Logs a saved food in one tap at its usual portion. Returns the new entry id. */
export async function relogFood(f: Food, date: string, meal: MealIndex, database: CalTrackDB = db): Promise<number> {
  const { amount, unit } = usualPortion(f)
  return logFood(foodToCandidate(f), amount, unit, date, meal, database)
}
