import { db, type CalTrackDB, type Lift, type LiftSet } from './db'

/** Lifts added the first time you open the Lifts tab. You can rename or delete them. */
export const STARTER_LIFTS = ['Squat', 'Bench press', 'Deadlift', 'Overhead press']

/** Adds the starter lifts if you have none yet. */
export async function ensureStarterLifts(database: CalTrackDB = db): Promise<void> {
  await database.transaction('rw', database.lifts, async () => {
    if ((await database.lifts.count()) > 0) return
    const now = Date.now()
    await database.lifts.bulkAdd(STARTER_LIFTS.map((name, i) => ({ name, createdAt: now + i }) as Lift))
  })
}

export async function listLifts(database: CalTrackDB = db): Promise<Lift[]> {
  return database.lifts.orderBy('id').toArray()
}

export async function addLift(name: string, database: CalTrackDB = db): Promise<number | null> {
  const trimmed = name.trim()
  if (!trimmed) return null
  return database.lifts.add({ name: trimmed, createdAt: Date.now() } as Lift)
}

export async function renameLift(id: number, name: string, database: CalTrackDB = db): Promise<void> {
  const trimmed = name.trim()
  if (trimmed) await database.lifts.update(id, { name: trimmed })
}

/** Deletes a lift and all its logged sets. */
export async function deleteLift(id: number, database: CalTrackDB = db): Promise<void> {
  await database.transaction('rw', database.lifts, database.liftSets, async () => {
    await database.liftSets.where('liftId').equals(id).delete()
    await database.lifts.delete(id)
  })
}

export async function logSet(liftId: number, date: string, kg: number, reps: number, database: CalTrackDB = db): Promise<number> {
  return database.liftSets.add({
    liftId,
    date,
    kg: Math.round(kg * 100) / 100,
    reps: Math.max(1, Math.round(reps)),
    createdAt: Date.now(),
  } as LiftSet)
}

export async function deleteSet(id: number, database: CalTrackDB = db): Promise<void> {
  await database.liftSets.delete(id)
}

/** A lift's sets, oldest first. */
export async function setsFor(liftId: number, database: CalTrackDB = db): Promise<LiftSet[]> {
  const sets = await database.liftSets.where('liftId').equals(liftId).toArray()
  return sets.sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt)
}

export async function allSets(database: CalTrackDB = db): Promise<LiftSet[]> {
  return database.liftSets.toArray()
}

/** Is set a better than set b? Heavier wins; at the same weight, more reps wins. */
const beats = (a: LiftSet, b: LiftSet) => a.kg > b.kg || (a.kg === b.kg && a.reps > b.reps)

/** Your personal best: the heaviest set, with more reps breaking a tie. */
export function personalBest(sets: LiftSet[]): LiftSet | undefined {
  return sets.reduce<LiftSet | undefined>((best, s) => (!best || beats(s, best) ? s : best), undefined)
}

/** Ids of sets that were a new PB when logged, in date order. */
export function pbSetIds(sets: LiftSet[]): Set<number> {
  const ordered = [...sets].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt)
  const ids = new Set<number>()
  let best: LiftSet | undefined
  for (const s of ordered) {
    if (!best || beats(s, best)) {
      best = s
      ids.add(s.id)
    }
  }
  return ids
}

/** The best set from each day, oldest first, for the progress graph. */
export function bestPerDay(sets: LiftSet[]): LiftSet[] {
  const byDate = new Map<string, LiftSet>()
  for (const s of sets) {
    const cur = byDate.get(s.date)
    if (!cur || beats(s, cur)) byDate.set(s.date, s)
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}

/** Estimated one-rep max (Epley formula). Equal to the weight for a single. */
export function estimatedOneRepMax(kg: number, reps: number): number {
  return reps <= 1 ? kg : Math.round(kg * (1 + reps / 30) * 10) / 10
}
