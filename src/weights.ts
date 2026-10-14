import { db, type CalTrackDB, type Weight } from './db'
import { shiftDateKey } from './entries'

/** How far each weigh-in pulls the trend toward itself (Hacker's Diet style smoothing). */
export const TREND_SMOOTHING = 0.1

export interface TrendPoint extends Weight {
  trend: number
}

export async function saveWeight(date: string, kg: number, database: CalTrackDB = db): Promise<void> {
  await database.weights.put({ date, kg: Math.round(kg * 100) / 100 })
}

export async function deleteWeight(date: string, database: CalTrackDB = db): Promise<void> {
  await database.weights.delete(date)
}

/** All weigh-ins, oldest first. */
export function listWeights(database: CalTrackDB = db): Promise<Weight[]> {
  return database.weights.orderBy('date').toArray()
}

/** Adds a smoothed trend to each weigh-in: each one moves the trend 10% of the way toward it. */
export function withTrend(weights: Weight[]): TrendPoint[] {
  let trend: number | null = null
  return weights.map((w) => {
    trend = trend === null ? w.kg : trend + TREND_SMOOTHING * (w.kg - trend)
    return { ...w, trend: Math.round(trend * 100) / 100 }
  })
}

/**
 * Change in trend weight over the last `days` days, compared with the trend on or before that date.
 * Null when there isn't a weigh-in that far back.
 */
export function trendChange(points: TrendPoint[], days: number): number | null {
  const last = points.at(-1)
  if (!last) return null
  const since = shiftDateKey(last.date, -days)
  const before = points.filter((p) => p.date <= since).at(-1)
  if (!before) return null
  return Math.round((last.trend - before.trend) * 100) / 100
}
