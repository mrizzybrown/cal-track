import { describe, expect, it } from 'vitest'
import { fromKg, kcalFromMacros, localDateKey, parseTarget, toKg } from './units'

describe('units', () => {
  it('converts kg and lb both ways', () => {
    expect(toKg(80, 'kg')).toBe(80)
    expect(fromKg(toKg(176, 'lb'), 'lb')).toBeCloseTo(176)
  })

  it('computes calories from macros', () => {
    expect(kcalFromMacros(150, 200, 65)).toBe(1985)
  })

  it('parses targets', () => {
    expect(parseTarget(' 2100 ')).toBe(2100)
    expect(parseTarget('0')).toBeNull()
    expect(parseTarget('abc')).toBeNull()
    expect(parseTarget('')).toBeNull()
  })

  it('formats local date keys', () => {
    expect(localDateKey(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})
