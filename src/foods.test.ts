import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { CalTrackDB } from './db'
import { entriesForDate } from './entries'
import {
  createCustomFood,
  defaultPortion,
  foodToCandidate,
  gramsFor,
  logFood,
  matchScore,
  myFoods,
  nutritionFor,
  offToCandidate,
  openFoodFactsUrl,
  rankUkProducts,
  ukStores,
  searchFoods,
  unitsFor,
  updateFoodEntry,
  usdaToCandidate,
} from './foods'

const banana = usdaToCandidate(['Bananas, raw', 89, 1.1, 22.8, 0.3])
const bread = usdaToCandidate(['Bread, banana, prepared from recipe, made with margarine', 326, 4.3, 54.6, 10.5])
const egg = usdaToCandidate(['Egg, whole, raw, fresh', 143, 12.6, 0.7, 9.5])

describe('nutrition', () => {
  it('scales per-100 g values by grams and ounces', () => {
    expect(nutritionFor(egg, 50, 'g')).toEqual({ grams: 50, kcal: 72, protein: 6.3, carbs: 0.4, fat: 4.8 })
    expect(gramsFor(egg, 1, 'oz')).toBeCloseTo(28.35, 1)
  })

  it('uses a food serving weight', () => {
    const bar = { ...banana, servings: [{ label: '1 bar', grams: 40 }] }
    expect(nutritionFor(bar, 2, '1 bar').grams).toBe(80)
    expect(unitsFor(bar)).toEqual(['1 bar', 'g', 'oz'])
  })

  it('defaults to the last amount, then a serving, then 100 g', () => {
    expect(defaultPortion(egg)).toEqual({ amount: 100, unit: 'g' })
    expect(defaultPortion(egg, { amount: 2, unit: 'oz' })).toEqual({ amount: 2, unit: 'oz' })
    expect(defaultPortion({ ...egg, servings: [{ label: '1 egg', grams: 50 }] })).toEqual({ amount: 1, unit: '1 egg' })
  })
})

describe('search', () => {
  it('needs every word to match the start of a word in the name', () => {
    expect(matchScore('Bananas, raw', 'ban')).not.toBeNull()
    expect(matchScore('Bananas, raw', 'nana')).toBeNull()
    expect(matchScore('Egg, whole, raw, fresh', 'raw egg')).not.toBeNull()
  })

  it('ranks the plain food above a recipe that mentions it', () => {
    expect(searchFoods('banana', [], [bread, banana]).map((f) => f.name)[0]).toBe('Bananas, raw')
  })

  it('lists your own foods first and hides USDA rows you already saved', async () => {
    const db = new CalTrackDB('foods-search')
    await logFood(banana, 120, 'g', '2026-10-14', 0, db)
    const mine = await myFoods(db)
    const found = searchFoods('banana', mine, [bread, banana])
    expect(found).toHaveLength(2)
    expect(found[0].id).toBeDefined()
    expect(found[0].name).toBe('Bananas, raw')
  })
})

describe('logging', () => {
  it('logs a food, remembers the amount, and reuses the saved food', async () => {
    const db = new CalTrackDB('foods-log')
    await logFood(egg, 2, 'oz', '2026-10-14', 0, db)
    await logFood(egg, 100, 'g', '2026-10-14', 0, db)
    const foods = await db.foods.toArray()
    expect(foods).toHaveLength(1)
    expect(foods[0]).toMatchObject({ useCount: 2, lastAmount: 100, lastUnit: 'g' })
    const entries = await entriesForDate('2026-10-14', db)
    expect(entries[0]).toMatchObject({ name: 'Egg, whole, raw, fresh', amount: 2, unit: 'oz', kcal: 81 })
    expect(entries[0].foodId).toBe(foods[0].id)
  })

  it('recalculates an edited entry', async () => {
    const db = new CalTrackDB('foods-edit')
    await logFood(egg, 100, 'g', '2026-10-14', 0, db)
    const [entry] = await entriesForDate('2026-10-14', db)
    await updateFoodEntry(entry, egg, 200, 'g', 2, db)
    const [after] = await entriesForDate('2026-10-14', db)
    expect(after).toMatchObject({ amount: 200, kcal: 286, meal: 2 })
  })
})

describe('custom foods', () => {
  it('stores label values per 100 g when the serving weight is known', async () => {
    const db = new CalTrackDB('custom-grams')
    const id = await createCustomFood(
      { name: 'Protein bar', servingLabel: '1 bar', servingGrams: 60, kcal: 210, protein: 20, carbs: 22, fat: 7 },
      db,
    )
    const food = foodToCandidate((await db.foods.get(id))!)
    expect(food.kcal).toBe(350)
    expect(nutritionFor(food, 1, '1 bar')).toMatchObject({ kcal: 210, protein: 20 })
    expect(unitsFor(food)).toContain('g')
  })

  it('logs in servings only when there is no weight', async () => {
    const db = new CalTrackDB('custom-serving')
    const id = await createCustomFood(
      { name: 'Café latte', servingLabel: '1 cup', servingGrams: null, kcal: 120, protein: 6, carbs: 10, fat: 5 },
      db,
    )
    const food = foodToCandidate((await db.foods.get(id))!)
    expect(unitsFor(food)).toEqual(['1 cup'])
    expect(nutritionFor(food, 2, '1 cup')).toMatchObject({ kcal: 240, protein: 12 })
  })
})

describe('Open Food Facts', () => {
  it('converts a product with a serving size', () => {
    const c = offToCandidate({
      code: '123',
      product_name: 'Greek Yogurt',
      brands: 'Fage, Other',
      serving_size: '170 g',
      serving_quantity: '170',
      nutriments: { 'energy-kcal_100g': 97, proteins_100g: 9, carbohydrates_100g: 3.8, fat_100g: 5 },
    })
    expect(c).toMatchObject({ name: 'Greek Yogurt', brand: 'Fage', kcal: 97, servings: [{ label: '170 g', grams: 170 }] })
  })

  it('falls back to kJ and skips products without calories', () => {
    expect(offToCandidate({ code: '1', product_name: 'X', nutriments: { energy_100g: 418.4 } })?.kcal).toBe(100)
    expect(offToCandidate({ code: '2', product_name: 'Y', nutriments: {} })).toBeNull()
  })

  it('keeps UK products only and names the main supermarkets', () => {
    const base = { code: '5', product_name: 'Houmous', nutriments: { 'energy-kcal_100g': 300 } }
    expect(offToCandidate({ ...base, countries_tags: ['en:france'] })).toBeNull()
    const c = offToCandidate({ ...base, countries_tags: ['en:united-kingdom'], stores: "Tesco, Sainsbury's,Aldi UK" })
    expect(c?.stores).toEqual(['Tesco', "Sainsbury's", 'Aldi'])
    expect(ukStores('Marks & Spencer, Co-op')).toEqual(['M&S', 'Co-op'])
    expect(ukStores('Carrefour')).toEqual([])
  })

  it('puts supermarket products first and searches the UK database', () => {
    const a = offToCandidate({ code: 'a', product_name: 'A', nutriments: { 'energy-kcal_100g': 1 } })!
    const b = offToCandidate({ code: 'b', product_name: 'B', stores: 'Lidl', nutriments: { 'energy-kcal_100g': 1 } })!
    expect(rankUkProducts([a, b]).map((f) => f.name)).toEqual(['B', 'A'])
    const url = openFoodFactsUrl('baked beans')
    expect(url).toContain('uk.openfoodfacts.org')
    expect(url).toContain('tag_0=united-kingdom')
    expect(url).toContain('search_terms=baked%20beans')
  })
})

describe('generic food list', () => {
  it('drops US brands and chains but keeps USDA beef grades', async () => {
    const { keepRow } = await import('../scripts/build-foods.mjs')
    expect(keepRow('Bananas, raw')).toBe(true)
    expect(keepRow('Beef, short loin, t-bone steak, USDA choice, cooked')).toBe(true)
    expect(keepRow('KFC, Fried Chicken, Drumstick')).toBe(false)
    expect(keepRow('Cereals ready-to-eat, QUAKER, oat squares')).toBe(false)
    expect(keepRow('Fast foods, hamburger, single, regular patty, plain')).toBe(false)
  })
})
