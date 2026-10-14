import { db, type CalTrackDB, type Entry, type Food, type Lift, type LiftSet, type SavedMeal, type Settings, type Weight } from './db'

export const BACKUP_APP = 'cal-track'
// v2 adds lifts and liftSets. v1 backups still restore (with no lifts).
export const BACKUP_VERSION = 2

export interface Backup {
  app: typeof BACKUP_APP
  version: number
  exportedAt: string
  foods: Food[]
  entries: Entry[]
  savedMeals: SavedMeal[]
  weights: Weight[]
  settings: Settings[]
  lifts?: Lift[]
  liftSets?: LiftSet[]
}

export async function exportBackup(database: CalTrackDB = db): Promise<Backup> {
  const [foods, entries, savedMeals, weights, settings, lifts, liftSets] = await Promise.all([
    database.foods.toArray(),
    database.entries.toArray(),
    database.savedMeals.toArray(),
    database.weights.toArray(),
    database.settings.toArray(),
    database.lifts.toArray(),
    database.liftSets.toArray(),
  ])
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    foods,
    entries,
    savedMeals,
    weights,
    settings,
    lifts,
    liftSets,
  }
}

/** File name like cal-track-backup-2026-10-14.json */
export function backupFileName(date: string): string {
  return `cal-track-backup-${date}.json`
}

const isList = (v: unknown): v is unknown[] => Array.isArray(v)

/** Checks a parsed file is a Cal Track backup. Returns an error message, or null when it's fine. */
export function checkBackup(data: unknown): string | null {
  if (!data || typeof data !== 'object') return "This file isn't a Cal Track backup."
  const b = data as Partial<Backup>
  if (b.app !== BACKUP_APP) return "This file isn't a Cal Track backup."
  if (typeof b.version !== 'number' || b.version > BACKUP_VERSION) return 'This backup is from a newer version of Cal Track. Update the app first.'
  for (const key of ['foods', 'entries', 'savedMeals', 'weights', 'settings'] as const) {
    if (!isList(b[key])) return 'This backup is incomplete or damaged.'
  }
  if (b.version >= 2 && (!isList(b.lifts) || !isList(b.liftSets))) return 'This backup is incomplete or damaged.'

  return null
}

export interface BackupCounts {
  entries: number
  liftSets: number
  foods: number
  savedMeals: number
  weights: number
}

export function backupCounts(b: Backup): BackupCounts {
  return { entries: b.entries.length, liftSets: b.liftSets?.length ?? 0, foods: b.foods.length, savedMeals: b.savedMeals.length, weights: b.weights.length }
}

const allTables = (database: CalTrackDB) => [
  database.foods,
  database.entries,
  database.savedMeals,
  database.weights,
  database.settings,
  database.lifts,
  database.liftSets,
]

/** Replaces everything on this phone with the backup's contents, all or nothing. */
export async function restoreBackup(b: Backup, database: CalTrackDB = db): Promise<void> {
  const error = checkBackup(b)
  if (error) throw new Error(error)
  const tables = allTables(database)
  await database.transaction('rw', tables, async () => {
    await Promise.all(tables.map((t) => t.clear()))
    await database.foods.bulkPut(b.foods)
    await database.entries.bulkPut(b.entries)
    await database.savedMeals.bulkPut(b.savedMeals)
    await database.weights.bulkPut(b.weights)
    await database.settings.bulkPut(b.settings)
    await database.lifts.bulkPut(b.lifts ?? [])
    await database.liftSets.bulkPut(b.liftSets ?? [])
  })
}

/** Deletes all your logs, foods, meals, weights, lifts and settings. */
export async function clearAllData(database: CalTrackDB = db): Promise<void> {
  const tables = allTables(database)
  await database.transaction('rw', tables, () => Promise.all(tables.map((t) => t.clear())))
}

/**
 * Hands the backup file to the user: the iOS share sheet (Save to Files, AirDrop, email) where
 * available, otherwise a normal download.
 */
export async function shareBackupFile(json: string, fileName: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = new File([json], fileName, { type: 'application/json' })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Cal Track backup' })
      return 'shared'
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled'
      // Sharing failed for another reason; fall back to a download.
    }
  }
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.append(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  return 'downloaded'
}
