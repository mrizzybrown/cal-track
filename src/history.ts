import { db, type CalTrackDB } from './db'
import { shiftDateKey, sumTotals, ZERO_TOTALS, type Totals } from './entries'

export interface DayTotals extends Totals {
  date: string
  /** False for days with nothing logged; they're left out of averages. */
  logged: boolean
}

/** Totals for each of the `days` days ending on `endDate`, oldest first, including empty days. */
export async function dailyTotals(endDate: string, days: number, database: CalTrackDB = db): Promise<DayTotals[]> {
  const start = shiftDateKey(endDate, -(days - 1))
  const entries = await database.entries.where('date').between(start, endDate, true, true).toArray()
  const out: DayTotals[] = []
  for (let i = 0; i < days; i++) {
    const date = shiftDateKey(start, i)
    const today = entries.filter((e) => e.date === date)
    out.push({ date, logged: today.length > 0, ...(today.length ? sumTotals(today) : ZERO_TOTALS) })
  }
  return out
}

/** Average per logged day, and how many days were logged. */
export function averages(days: DayTotals[]): Totals & { daysLogged: number } {
  const logged = days.filter((d) => d.logged)
  const sum = sumTotals(logged)
  const n = logged.length || 1
  return {
    kcal: Math.round(sum.kcal / n),
    protein: Math.round(sum.protein / n),
    carbs: Math.round(sum.carbs / n),
    fat: Math.round(sum.fat / n),
    daysLogged: logged.length,
  }
}
