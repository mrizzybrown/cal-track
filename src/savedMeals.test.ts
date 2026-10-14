import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { describe, expect, it } from 'vitest'
import { CalTrackDB } from './db'
import { addQuickEntry, entriesForDate } from './entries'
import {
  copyMealFromDay,
  createSavedMeal,
  listSavedMeals,
  logSavedMeal,
  mealTotals,
  pastMeals,
  saveEntriesAsMeal,
} from './savedMeals'

const blank = { name: '', kcal: null, protein: null, carbs: null, fat: null }
const item = (name: string, kcal: number, protein = 0) => ({ name, amount: 1, unit: 'serving', kcal, protein, carbs: 0, fat: 0 })

describe('saved meals', () => {
  it('rejects a blank name or no items', async () => {
    const db = new CalTrackDB('sm-reject')
    expect(await createSavedMeal('  ', [item('x', 100)], db)).toBeNull()
    expect(await createSavedMeal('Lunch', [], db)).toBeNull()
  })

  it('saves a whole logged meal and logs it again on another day', async () => {
    const db = new CalTrackDB('sm-roundtrip')
    await addQuickEntry('2026-10-14', 0, { ...blank, name: 'Oats', kcal: 300, protein: 10 }, db)
    await addQuickEntry('2026-10-14', 0, { ...blank, name: 'Coffee', kcal: 50 }, db)
    const breakfast = await entriesForDate('2026-10-14', db)
    await saveEntriesAsMeal('Usual breakfast', breakfast, db)

    const [meal] = await listSavedMeals(db)
    expect(meal.name).toBe('Usual breakfast')
    expect(mealTotals(meal)).toMatchObject({ kcal: 350, protein: 10 })

    const ids = await logSavedMeal(meal, '2026-10-15', 0, db)
    expect(ids).toHaveLength(2)
    const next = await entriesForDate('2026-10-15', db)
    expect(next.map((e) => e.name)).toEqual(['Oats', 'Coffee'])
    expect((await db.savedMeals.get(meal.id))?.useCount).toBe(1)
  })

  it('logs a one-item meal under the meal name', async () => {
    const db = new CalTrackDB('sm-single')
    await createSavedMeal('Protein shake', [item('Quick add', 200, 40)], db)
    const [meal] = await listSavedMeals(db)
    await logSavedMeal(meal, '2026-10-14', 3, db)
    const [e] = await entriesForDate('2026-10-14', db)
    expect(e).toMatchObject({ name: 'Protein shake', kcal: 200, protein: 40, meal: 3 })
  })

  it('sorts the most used meals first', async () => {
    const db = new CalTrackDB('sm-sort')
    await createSavedMeal('A', [item('a', 100)], db)
    await createSavedMeal('B', [item('b', 100)], db)
    const b = (await listSavedMeals(db)).find((m) => m.name === 'B')!
    await logSavedMeal(b, '2026-10-14', 0, db)
    expect((await listSavedMeals(db)).map((m) => m.name)).toEqual(['B', 'A'])
  })

  it("copies one meal slot from yesterday", async () => {
    const db = new CalTrackDB('sm-copy')
    await addQuickEntry('2026-10-13', 1, { ...blank, name: 'Wrap', kcal: 500 }, db)
    await addQuickEntry('2026-10-13', 2, { ...blank, name: 'Pasta', kcal: 700 }, db)
    expect(await copyMealFromDay('2026-10-13', '2026-10-14', 1, db)).toHaveLength(1)
    const today = await entriesForDate('2026-10-14', db)
    expect(today).toHaveLength(1)
    expect(today[0]).toMatchObject({ name: 'Wrap', meal: 1 })
    expect(await entriesForDate('2026-10-13', db)).toHaveLength(2)
  })

  it('copies a past meal into a different meal', async () => {
    const db = new CalTrackDB('sm-copy-slot')
    await addQuickEntry('2026-10-10', 0, { ...blank, name: 'Eggs', kcal: 200 }, db)
    await copyMealFromDay('2026-10-10', '2026-10-14', 0, db, 3)
    expect((await entriesForDate('2026-10-14', db))[0]).toMatchObject({ name: 'Eggs', meal: 3 })
  })

  it('lists past meals newest first, once per repeat, within two weeks', async () => {
    const db = new CalTrackDB('sm-past')
    for (const [date, name] of [
      ['2026-09-20', 'Old'],
      ['2026-10-11', 'Oats'],
      ['2026-10-12', 'Eggs'],
      ['2026-10-13', 'Oats'],
    ])
      await addQuickEntry(date, 0, { ...blank, name, kcal: 300 }, db)
    await addQuickEntry('2026-10-13', 1, { ...blank, name: 'Wrap', kcal: 500 }, db)
    await addQuickEntry('2026-10-14', 0, { ...blank, name: 'Today', kcal: 100 }, db)
    const past = await pastMeals('2026-10-14', 0, 14, db)
    expect(past.map((p) => [p.date, p.entries[0].name])).toEqual([
      ['2026-10-13', 'Oats'],
      ['2026-10-12', 'Eggs'],
    ])
    expect(past[0].totals.kcal).toBe(300)
  })
})

describe('database upgrade', () => {
  it('opens a version 1 database without losing entries', async () => {
    const old = new Dexie('sm-upgrade')
    old.version(1).stores({
      foods: '++id, name, barcode, favorite, lastUsed, [source+sourceId]',
      entries: '++id, date, [date+meal], foodId',
      savedMeals: '++id, name',
      weights: 'date',
      settings: 'id',
    })
    await old.table('entries').add({ date: '2026-10-14', meal: 0, name: 'Old', kcal: 1, protein: 0, carbs: 0, fat: 0, createdAt: 1 })
    old.close()

    const db = new CalTrackDB('sm-upgrade')
    expect(await entriesForDate('2026-10-14', db)).toHaveLength(1)
    expect(await listSavedMeals(db)).toEqual([])
  })
})
