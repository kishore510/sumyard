export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const
export type ThemePreference = (typeof THEME_PREFERENCES)[number]
export type Theme = 'light' | 'dark'

export function parsePreference(_value: unknown): ThemePreference {
  throw new Error('not implemented')
}

export function resolveTheme(_preference: ThemePreference, _systemPrefersDark: boolean): Theme {
  throw new Error('not implemented')
}

export function nextPreference(_preference: ThemePreference): ThemePreference {
  throw new Error('not implemented')
}

export function storedPreference(_text: string | null): ThemePreference {
  throw new Error('not implemented')
}

export function serializePreference(_preference: ThemePreference): string {
  throw new Error('not implemented')
}
