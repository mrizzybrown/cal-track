import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { CalTrackDB, DEFAULT_SETTINGS, getSettings, saveSettings } from './db'

describe('settings', () => {
  it('returns defaults before anything is saved', async () => {
    const db = new CalTrackDB('test-defaults')
    expect(await getSettings(db)).toEqual(DEFAULT_SETTINGS)
    expect(DEFAULT_SETTINGS.weightUnit).toBe('kg')
  })

  it('saves a partial change and keeps the other values', async () => {
    const db = new CalTrackDB('test-save')
    await saveSettings({ kcalTarget: 1800 }, db)
    await saveSettings({ weightUnit: 'lb' }, db)
    const s = await getSettings(db)
    expect(s.kcalTarget).toBe(1800)
    expect(s.weightUnit).toBe('lb')
    expect(s.proteinTarget).toBe(DEFAULT_SETTINGS.proteinTarget)
  })
})
