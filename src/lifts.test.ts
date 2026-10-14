import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { CalTrackDB, type LiftSet } from './db'
import { checkBackup, exportBackup, restoreBackup } from './backup'
import {
  addLift,
  bestPerDay,
  deleteLift,
  ensureStarterLifts,
  estimatedOneRepMax,
  listLifts,
  logSet,
  pbSetIds,
  personalBest,
  setsFor,
} from './lifts'

const set = (id: number, date: string, kg: number, reps: number): LiftSet => ({ id, liftId: 1, date, kg, reps, createdAt: id })

describe('lifts', () => {
  it('adds the starter lifts once', async () => {
    const db = new CalTrackDB('l-start')
    await ensureStarterLifts(db)
    await ensureStarterLifts(db)
    expect((await listLifts(db)).map((l) => l.name)).toEqual(['Squat', 'Bench press', 'Deadlift', 'Overhead press'])
  })

  it('picks the heaviest set as the PB, more reps breaking a tie', () => {
    const sets = [set(1, '2026-10-01', 100, 5), set(2, '2026-10-03', 110, 1), set(3, '2026-10-05', 110, 3), set(4, '2026-10-07', 105, 8)]
    expect(personalBest(sets)?.id).toBe(3)
    expect([...pbSetIds(sets)]).toEqual([1, 2, 3])
    expect(personalBest([])).toBeUndefined()
  })

  it('keeps the best set per day for the graph', () => {
    const sets = [set(1, '2026-10-01', 100, 5), set(2, '2026-10-01', 105, 3), set(3, '2026-10-02', 90, 10)]
    expect(bestPerDay(sets).map((s) => s.id)).toEqual([2, 3])
  })

  it('estimates a one-rep max', () => {
    expect(estimatedOneRepMax(100, 1)).toBe(100)
    expect(estimatedOneRepMax(100, 5)).toBe(116.7)
  })

  it('logs sets and deletes a lift with its sets', async () => {
    const db = new CalTrackDB('l-log')
    const id = (await addLift(' Hip thrust ', db))!
    expect(await addLift('  ', db)).toBeNull()
    await logSet(id, '2026-10-14', 120.004, 8, db)
    await logSet(id, '2026-10-12', 110, 8, db)
    expect((await setsFor(id, db)).map((s) => [s.date, s.kg])).toEqual([
      ['2026-10-12', 110],
      ['2026-10-14', 120],
    ])
    await deleteLift(id, db)
    expect(await setsFor(id, db)).toEqual([])
    expect(await listLifts(db)).toEqual([])
  })

  it('backs up and restores lifts, and still restores older backups without them', async () => {
    const from = new CalTrackDB('l-backup-from')
    const id = (await addLift('Squat', from))!
    await logSet(id, '2026-10-14', 140, 3, from)
    const backup = JSON.parse(JSON.stringify(await exportBackup(from)))
    const to = new CalTrackDB('l-backup-to')
    await restoreBackup(backup, to)
    expect(await setsFor(id, to)).toHaveLength(1)

    const old = { ...backup, version: 1 }
    delete old.lifts
    delete old.liftSets
    expect(checkBackup(old)).toBeNull()
    await restoreBackup(old, to)
    expect(await listLifts(to)).toEqual([])
    expect(checkBackup({ ...backup, lifts: undefined })).toMatch(/incomplete/)
  })
})
