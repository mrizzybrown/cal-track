import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { CalTrackDB } from './db'
import {
  addQuickEntry,
  entriesForDate,
  mealForTime,
  parseOptional,
  quickAddValues,
  shiftDateKey,
  sumTotals,
  updateQuickEntry,
} from './entries'

const blank = { name: '', kcal: null, protein: null, carbs: null, fat: null }

describe('quick add values', () => {
  it('needs calories or macros', () => {
    expect(quickAddValues(blank)).toBeNull()
    expect(quickAddValues({ ...blank, kcal: 0 })).toBeNull()
  })

  it('uses typed calories and defaults the name', () => {
    expect(quickAddValues({ ...blank, kcal: 350, protein: 20 })).toEqual({
      name: 'Quick add',
      kcal: 350,
      protein: 20,
      carbs: 0,
      fat: 0,
    })
  })

  it('works out calories from macros when calories are blank', () => {
    expect(quickAddValues({ ...blank, protein: 30, carbs: 10, fat: 5 })?.kcal).toBe(205)
  })
})

describe('helpers', () => {
  it('parses optional numbers', () => {
    expect(parseOptional('')).toBeNull()
    expect(parseOptional(' 12,5 ')).toBe(12.5)
    expect(parseOptional('-3')).toBe('invalid')
    expect(parseOptional('abc')).toBe('invalid')
  })

  it('shifts date keys across month and year ends', () => {
    expect(shiftDateKey('2026-01-01', -1)).toBe('2025-12-31')
    expect(shiftDateKey('2026-02-28', 1)).toBe('2026-03-01')
  })

  it('picks a meal by time of day', () => {
    expect(mealForTime(new Date(2026, 0, 1, 8))).toBe(0)
    expect(mealForTime(new Date(2026, 0, 1, 12))).toBe(1)
    expect(mealForTime(new Date(2026, 0, 1, 19))).toBe(2)
    expect(mealForTime(new Date(2026, 0, 1, 16))).toBe(3)
  })

  it('sums totals', () => {
    expect(sumTotals([])).toEqual({ kcal: 0, protein: 0, carbs: 0, fat: 0 })
    expect(sumTotals([{ kcal: 100, protein: 1, carbs: 2, fat: 3 }, { kcal: 50, protein: 1, carbs: 0, fat: 0 }]).kcal).toBe(150)
  })
})

describe('entries in the database', () => {
  it('adds, edits and lists entries for a day', async () => {
    const db = new CalTrackDB('test-entries')
    const id = await addQuickEntry('2026-10-14', 0, { ...blank, kcal: 400, name: 'Oats' }, db)
    await addQuickEntry('2026-10-15', 1, { ...blank, kcal: 600 }, db)
    expect(id).not.toBeNull()

    await updateQuickEntry(id!, 3, { ...blank, kcal: 450, name: 'Oats' }, db)
    const day = await entriesForDate('2026-10-14', db)
    expect(day).toHaveLength(1)
    expect(day[0]).toMatchObject({ name: 'Oats', kcal: 450, meal: 3 })
  })
})
