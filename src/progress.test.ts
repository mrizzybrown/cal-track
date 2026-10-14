import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { CalTrackDB, getSettings, saveSettings } from './db'
import { addQuickEntry, entriesForDate } from './entries'
import { averages, dailyTotals } from './history'
import { backupCounts, checkBackup, clearAllData, exportBackup, restoreBackup } from './backup'
import { deleteWeight, listWeights, saveWeight, trendChange, withTrend } from './weights'

const blank = { name: '', kcal: null, protein: null, carbs: null, fat: null }

describe('weight', () => {
  it('keeps one weigh-in per day, oldest first', async () => {
    const db = new CalTrackDB('w-save')
    await saveWeight('2026-10-14', 80.123, db)
    await saveWeight('2026-10-12', 81, db)
    await saveWeight('2026-10-14', 79.9, db)
    expect(await listWeights(db)).toEqual([
      { date: '2026-10-12', kg: 81 },
      { date: '2026-10-14', kg: 79.9 },
    ])
    await deleteWeight('2026-10-12', db)
    expect(await listWeights(db)).toHaveLength(1)
  })

  it('smooths the trend 10% toward each weigh-in', () => {
    const t = withTrend([
      { date: '2026-10-01', kg: 80 },
      { date: '2026-10-02', kg: 82 },
      { date: '2026-10-03', kg: 79 },
    ])
    expect(t.map((p) => p.trend)).toEqual([80, 80.2, 80.08])
  })

  it('reports trend change over a period, or null without enough history', () => {
    const t = withTrend(
      Array.from({ length: 10 }, (_, i) => ({ date: `2026-10-${String(i + 1).padStart(2, '0')}`, kg: 80 - i * 0.2 })),
    )
    expect(trendChange(t, 7)).toBeLessThan(0)
    expect(trendChange(t, 30)).toBeNull()
    expect(trendChange([], 7)).toBeNull()
  })
})

describe('history', () => {
  it('totals each day including empty ones, and averages logged days only', async () => {
    const db = new CalTrackDB('h-days')
    await addQuickEntry('2026-10-12', 0, { ...blank, kcal: 1800, protein: 120 }, db)
    await addQuickEntry('2026-10-14', 0, { ...blank, kcal: 1500, protein: 100 }, db)
    await addQuickEntry('2026-10-14', 2, { ...blank, kcal: 700, protein: 40 }, db)
    await addQuickEntry('2026-10-01', 0, { ...blank, kcal: 9999 }, db)
    const days = await dailyTotals('2026-10-14', 7, db)
    expect(days).toHaveLength(7)
    expect(days[0].date).toBe('2026-10-08')
    expect(days.at(-1)).toMatchObject({ date: '2026-10-14', kcal: 2200, logged: true })
    expect(days.filter((d) => d.logged)).toHaveLength(2)
    expect(averages(days)).toMatchObject({ kcal: 2000, protein: 130, daysLogged: 2 })
    expect(averages([]).daysLogged).toBe(0)
  })
})

describe('backup', () => {
  it('exports and restores everything onto an empty phone', async () => {
    const from = new CalTrackDB('b-from')
    await addQuickEntry('2026-10-14', 1, { ...blank, name: 'Wrap', kcal: 500 }, from)
    await saveWeight('2026-10-14', 80, from)
    await saveSettings({ kcalTarget: 1900 }, from)
    const backup = JSON.parse(JSON.stringify(await exportBackup(from)))
    expect(checkBackup(backup)).toBeNull()
    expect(backupCounts(backup)).toMatchObject({ entries: 1, weights: 1 })

    const to = new CalTrackDB('b-to')
    await addQuickEntry('2026-10-01', 0, { ...blank, name: 'Old', kcal: 100 }, to)
    await restoreBackup(backup, to)
    expect((await entriesForDate('2026-10-14', to))[0].name).toBe('Wrap')
    expect(await entriesForDate('2026-10-01', to)).toHaveLength(0)
    expect((await getSettings(to)).kcalTarget).toBe(1900)
  })

  it('rejects files that are not backups and leaves data alone', async () => {
    expect(checkBackup({ hello: 1 })).toMatch(/isn't a Cal Track backup/)
    expect(checkBackup({ app: 'cal-track', version: 99 })).toMatch(/newer version/)
    expect(checkBackup({ app: 'cal-track', version: 1, foods: [] })).toMatch(/incomplete/)
    const db = new CalTrackDB('b-bad')
    await addQuickEntry('2026-10-14', 0, { ...blank, kcal: 100 }, db)
    await expect(restoreBackup({ app: 'nope' } as never, db)).rejects.toThrow()
    expect(await entriesForDate('2026-10-14', db)).toHaveLength(1)
  })

  it('clears all data', async () => {
    const db = new CalTrackDB('b-clear')
    await addQuickEntry('2026-10-14', 0, { ...blank, kcal: 100 }, db)
    await saveWeight('2026-10-14', 80, db)
    await clearAllData(db)
    expect(await entriesForDate('2026-10-14', db)).toHaveLength(0)
    expect(await listWeights(db)).toHaveLength(0)
  })
})
