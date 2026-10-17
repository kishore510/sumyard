import { STORAGE_KEYS } from './storageKeys'

export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const
export type ThemePreference = (typeof THEME_PREFERENCES)[number]
export type Theme = 'light' | 'dark'

const { key: THEME_KEY, schemaVersion: THEME_SCHEMA_VERSION } = STORAGE_KEYS.theme

export { THEME_KEY }

export function parsePreference(value: unknown): ThemePreference {
  return THEME_PREFERENCES.includes(value as ThemePreference) ? (value as ThemePreference) : 'system'
}

export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): Theme {
  if (preference === 'system') return systemPrefersDark ? 'dark' : 'light'
  return preference
}

/** Cycle order for a single toggle button: system -> light -> dark -> system. */
export function nextPreference(preference: ThemePreference): ThemePreference {
  const index = THEME_PREFERENCES.indexOf(preference)
  return THEME_PREFERENCES[(index + 1) % THEME_PREFERENCES.length]!
}

/**
 * The preference stored under `sumyard:v1:theme`: `{ schemaVersion, theme }`.
 * Anything missing, unreadable or from another schema version means system.
 * Mirrored by the inline script in index.html, which applies the theme before
 * first paint; src/lib/theme.test.ts runs that script and keeps the two in step.
 */
export function storedPreference(text: string | null): ThemePreference {
  if (text === null) return 'system'
  try {
    const record = JSON.parse(text) as { schemaVersion?: unknown; theme?: unknown } | null
    return record?.schemaVersion === THEME_SCHEMA_VERSION ? parsePreference(record.theme) : 'system'
  } catch {
    return 'system'
  }
}

export function serializePreference(preference: ThemePreference): string {
  return JSON.stringify({ schemaVersion: THEME_SCHEMA_VERSION, theme: preference })
}

/** Reads the stored preference; storage that is blocked or throws means system. */
export function readPreference(storage: Pick<Storage, 'getItem'> | undefined): ThemePreference {
  try {
    return storedPreference(storage?.getItem(THEME_KEY) ?? null)
  } catch {
    return 'system'
  }
}

/** Saves the preference. Returns false if storage is unavailable (the choice then lasts for this visit only). */
export function writePreference(storage: Pick<Storage, 'setItem'> | undefined, preference: ThemePreference): boolean {
  try {
    if (!storage) return false
    storage.setItem(THEME_KEY, serializePreference(preference))
    return true
  } catch {
    return false
  }
}
