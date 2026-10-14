import type { WeightUnit } from './db'

const LB_PER_KG = 2.20462

export function toKg(value: number, unit: WeightUnit): number {
  return unit === 'kg' ? value : value / LB_PER_KG
}

export function fromKg(kg: number, unit: WeightUnit): number {
  return unit === 'kg' ? kg : kg * LB_PER_KG
}

/** Calories implied by macro targets (4/4/9 kcal per gram). */
export function kcalFromMacros(protein: number, carbs: number, fat: number): number {
  return Math.round(protein * 4 + carbs * 4 + fat * 9)
}

/** Parses a positive whole number from user input, or returns null. */
export function parseTarget(input: string): number | null {
  const n = Number(input.trim())
  if (!Number.isFinite(n) || n <= 0 || n > 20000) return null
  return Math.round(n)
}

/** Local date as YYYY-MM-DD. */
export function localDateKey(d: Date = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
