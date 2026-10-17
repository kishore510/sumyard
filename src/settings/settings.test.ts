import { describe, expect, it } from 'vitest'
import { STORAGE_KEYS } from '@/lib/storageKeys'
import {
  createSettingsStore,
  DEFAULT_SETTINGS,
  parseSettings,
  readSettingsValue,
  resetToDefaults,
  type Settings,
  serializeSettings,
} from './settings'

const LATEST = '2026-27'

const KEY = STORAGE_KEYS.settings.key

function memory(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  }
}

const blocked = {
  getItem: () => {
    throw new Error('SecurityError')
  },
  setItem: () => {
    throw new Error('SecurityError')
  },
  removeItem: () => {
    throw new Error('SecurityError')
  },
}

describe('settings record', () => {
  it('is stored under sumyard:v1:settings with a schema version', () => {
    expect(KEY).toBe('sumyard:v1:settings')
    expect(JSON.parse(serializeSettings(DEFAULT_SETTINGS))).toEqual({
      schemaVersion: STORAGE_KEYS.settings.schemaVersion,
      ...DEFAULT_SETTINGS,
    })
  })

  it('is schema version 2 (0.3.0 added the tax year)', () => {
    expect(STORAGE_KEYS.settings.schemaVersion).toBe(2)
  })

  it('defaults to rest of UK, whole pounds and the latest tax year in the registry', () => {
    expect(DEFAULT_SETTINGS).toEqual({ region: 'ruk', amounts: 'pounds', taxYear: LATEST })
  })

  it('round-trips every combination', () => {
    for (const region of ['ruk', 'scotland'] as const) {
      for (const amounts of ['pounds', 'pence'] as const) {
        const settings: Settings = { region, amounts, taxYear: LATEST }
        expect(parseSettings(serializeSettings(settings))).toEqual(settings)
      }
    }
  })

  it('falls back to defaults for a missing, unreadable or newer-version record', () => {
    for (const text of [
      null,
      '',
      '{oops',
      'null',
      '[]',
      '"scotland"',
      '{"schemaVersion":3,"region":"scotland","amounts":"pence","taxYear":"2026-27"}',
      '{"schemaVersion":0,"region":"scotland"}',
    ]) {
      expect(parseSettings(text), String(text)).toEqual(DEFAULT_SETTINGS)
    }
  })

  it('keeps the valid fields and defaults the rest (untrusted input)', () => {
    expect(parseSettings('{"schemaVersion":2,"region":"scotland","amounts":"euros","taxYear":"2026-27"}')).toEqual({
      region: 'scotland',
      amounts: 'pounds',
      taxYear: LATEST,
    })
    expect(parseSettings('{"schemaVersion":2,"amounts":"pence","extra":true}')).toEqual({
      region: 'ruk',
      amounts: 'pence',
      taxYear: LATEST,
    })
  })

  it('falls back to the latest year when the saved one is no longer in the registry', () => {
    for (const taxYear of ['2019-20', 'nonsense', 2026, null]) {
      const text = JSON.stringify({ schemaVersion: 2, region: 'scotland', amounts: 'pence', taxYear })
      expect(parseSettings(text), String(taxYear)).toEqual({ region: 'scotland', amounts: 'pence', taxYear: LATEST })
    }
  })

  it('checks the saved year against the registry it is given (fake years)', () => {
    const years = { ids: ['2098-99', '2097-98'], latest: '2098-99' }
    expect(parseSettings('{"schemaVersion":2,"taxYear":"2097-98"}', years).taxYear).toBe('2097-98')
    expect(parseSettings('{"schemaVersion":2,"taxYear":"2026-27"}', years).taxYear).toBe('2098-99')
    expect(parseSettings(null, years).taxYear).toBe('2098-99')
  })
})

describe('settings migration from schema 1 (0.2.0)', () => {
  it('keeps region and amounts and adds the default tax year', () => {
    expect(parseSettings('{"schemaVersion":1,"region":"scotland","amounts":"pence"}')).toEqual({
      region: 'scotland',
      amounts: 'pence',
      taxYear: LATEST,
    })
  })

  it('still checks each field of an old record', () => {
    expect(parseSettings('{"schemaVersion":1,"region":"wales","amounts":"pence"}')).toEqual({
      region: 'ruk',
      amounts: 'pence',
      taxYear: LATEST,
    })
    expect(parseSettings('{"schemaVersion":1,"taxYear":"2026-27","region":"scotland"}')).toEqual({
      region: 'scotland',
      amounts: 'pounds',
      taxYear: LATEST,
    })
  })

  it('leaves the stored record alone until something changes, then saves schema 2', () => {
    const v1 = '{"schemaVersion":1,"region":"scotland","amounts":"pence"}'
    const storage = memory({ [KEY]: v1 })
    const store = createSettingsStore(() => storage)
    expect(store.get()).toEqual({ region: 'scotland', amounts: 'pence', taxYear: LATEST })
    expect(storage.data.get(KEY)).toBe(v1)
    store.update({ amounts: 'pounds' })
    expect(JSON.parse(storage.data.get(KEY)!)).toEqual({ schemaVersion: 2, region: 'scotland', amounts: 'pounds', taxYear: LATEST })
  })
})

describe('createSettingsStore', () => {
  it('loads what was saved', () => {
    const storage = memory({ [KEY]: serializeSettings({ region: 'scotland', amounts: 'pence', taxYear: LATEST }) })
    expect(createSettingsStore(() => storage).get()).toEqual({ region: 'scotland', amounts: 'pence', taxYear: LATEST })
  })

  it('saves each change and tells subscribers', () => {
    const storage = memory()
    const store = createSettingsStore(() => storage)
    let calls = 0
    store.subscribe(() => calls++)
    store.update({ region: 'scotland' })
    expect(store.get()).toEqual({ region: 'scotland', amounts: 'pounds', taxYear: LATEST })
    expect(parseSettings(storage.data.get(KEY)!)).toEqual({ region: 'scotland', amounts: 'pounds', taxYear: LATEST })
    expect(calls).toBe(1)
  })

  it('keeps changes for the visit when storage is blocked, and says it could not save', () => {
    const store = createSettingsStore(() => blocked)
    expect(store.get()).toEqual(DEFAULT_SETTINGS)
    expect(store.update({ amounts: 'pence' })).toBe(false)
    expect(store.get().amounts).toBe('pence')
  })

  it('reloads after a change in another tab', () => {
    const storage = memory()
    const store = createSettingsStore(() => storage)
    storage.data.set(KEY, serializeSettings({ region: 'scotland', amounts: 'pence', taxYear: LATEST }))
    store.reload()
    expect(store.get()).toEqual({ region: 'scotland', amounts: 'pence', taxYear: LATEST })
  })
})

describe('resetToDefaults', () => {
  function setup() {
    const storage = memory()
    const settings = createSettingsStore(() => storage)
    let theme: 'system' | 'light' | 'dark' = 'dark'
    const themeStore = {
      get: () => theme,
      set: (next: typeof theme) => {
        theme = next
      },
    }
    settings.update({ region: 'scotland', amounts: 'pence' })
    return { settings, themeStore, theme: () => theme }
  }

  it('resets theme and settings, and returns an undo that restores both', () => {
    const t = setup()
    const undo = resetToDefaults(t.settings, t.themeStore)
    expect(t.settings.get()).toEqual(DEFAULT_SETTINGS)
    expect(t.theme()).toBe('system')
    expect(undo).not.toBeNull()
    undo!()
    expect(t.settings.get()).toEqual({ region: 'scotland', amounts: 'pence', taxYear: LATEST })
    expect(t.theme()).toBe('dark')
  })

  it('returns null when everything is already at its default (nothing to undo)', () => {
    const t = setup()
    resetToDefaults(t.settings, t.themeStore)
    expect(resetToDefaults(t.settings, t.themeStore)).toBeNull()
  })
})

describe('readSettingsValue (restoring a backup)', () => {
  const years = { ids: ['2026-27'], latest: '2026-27' }

  it('accepts valid settings, building a fresh object', () => {
    const raw = { region: 'scotland', amounts: 'pence', taxYear: '2026-27', extra: 1 }
    const result = readSettingsValue(raw, years)
    expect(result).toEqual({ ok: true, settings: { region: 'scotland', amounts: 'pence', taxYear: '2026-27' }, notes: [] })
  })

  it('rejects an unknown region or amount style, or a non-object', () => {
    expect(readSettingsValue({ region: 'wales', amounts: 'pence', taxYear: '2026-27' }, years).ok).toBe(false)
    expect(readSettingsValue({ region: 'ruk', amounts: 'pennies', taxYear: '2026-27' }, years).ok).toBe(false)
    expect(readSettingsValue('ruk', years).ok).toBe(false)
  })

  it('swaps a tax year this version doesn’t have for the latest, with a note', () => {
    const result = readSettingsValue({ region: 'ruk', amounts: 'pounds', taxYear: '2031-32' }, years)
    expect(result).toEqual({
      ok: true,
      settings: { region: 'ruk', amounts: 'pounds', taxYear: '2026-27' },
      notes: ['The backup’s default tax year, 2031 to 2032, isn’t in this version, so it is set to 2026 to 2027.'],
    })
  })
})
