import { describe, expect, it } from 'vitest'
import { STORAGE_KEYS } from '@/lib/storageKeys'
import { createSettingsStore, DEFAULT_SETTINGS, parseSettings, resetToDefaults, type Settings, serializeSettings } from './settings'

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

  it('defaults to rest of UK and whole pounds', () => {
    expect(DEFAULT_SETTINGS).toEqual({ region: 'ruk', amounts: 'pounds' })
  })

  it('round-trips every combination', () => {
    for (const region of ['ruk', 'scotland'] as const) {
      for (const amounts of ['pounds', 'pence'] as const) {
        const settings: Settings = { region, amounts }
        expect(parseSettings(serializeSettings(settings))).toEqual(settings)
      }
    }
  })

  it('falls back to defaults for a missing, unreadable or other-version record', () => {
    for (const text of [null, '', '{oops', 'null', '[]', '"scotland"', '{"schemaVersion":2,"region":"scotland","amounts":"pence"}']) {
      expect(parseSettings(text), String(text)).toEqual(DEFAULT_SETTINGS)
    }
  })

  it('keeps the valid fields and defaults the rest (untrusted input)', () => {
    expect(parseSettings('{"schemaVersion":1,"region":"scotland","amounts":"euros"}')).toEqual({ region: 'scotland', amounts: 'pounds' })
    expect(parseSettings('{"schemaVersion":1,"amounts":"pence","extra":true}')).toEqual({ region: 'ruk', amounts: 'pence' })
  })

  it('has no tax-year default yet (slice 0.5 adds it with the config registry)', () => {
    expect(Object.keys(DEFAULT_SETTINGS)).not.toContain('taxYear')
  })
})

describe('createSettingsStore', () => {
  it('loads what was saved', () => {
    const storage = memory({ [KEY]: serializeSettings({ region: 'scotland', amounts: 'pence' }) })
    expect(createSettingsStore(() => storage).get()).toEqual({ region: 'scotland', amounts: 'pence' })
  })

  it('saves each change and tells subscribers', () => {
    const storage = memory()
    const store = createSettingsStore(() => storage)
    let calls = 0
    store.subscribe(() => calls++)
    store.update({ region: 'scotland' })
    expect(store.get()).toEqual({ region: 'scotland', amounts: 'pounds' })
    expect(parseSettings(storage.data.get(KEY)!)).toEqual({ region: 'scotland', amounts: 'pounds' })
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
    storage.data.set(KEY, serializeSettings({ region: 'scotland', amounts: 'pence' }))
    store.reload()
    expect(store.get()).toEqual({ region: 'scotland', amounts: 'pence' })
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
    expect(t.settings.get()).toEqual({ region: 'scotland', amounts: 'pence' })
    expect(t.theme()).toBe('dark')
  })

  it('returns null when everything is already at its default (nothing to undo)', () => {
    const t = setup()
    resetToDefaults(t.settings, t.themeStore)
    expect(resetToDefaults(t.settings, t.themeStore)).toBeNull()
  })
})
