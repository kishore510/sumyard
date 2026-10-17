import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { nextPreference, readPreference, resolveTheme, THEME_KEY, type Theme, type ThemePreference, writePreference } from '@/lib/theme'

const DARK_QUERY = '(prefers-color-scheme: dark)'

const storage = (): Storage | undefined => {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

// The preference lives in localStorage (sumyard:v1:theme). This in-memory copy keeps the choice for the visit even when
// storage is blocked, and listeners re-render on change here or in another tab.
let current: ThemePreference | undefined
const listeners = new Set<() => void>()
const notify = () => {
  for (const listener of listeners) listener()
}

function getPreference(): ThemePreference {
  current ??= readPreference(storage())
  return current
}

function setPreference(next: ThemePreference) {
  current = next
  writePreference(storage(), next)
  notify()
}

function subscribePreference(onChange: () => void) {
  listeners.add(onChange)
  const onStorage = (event: StorageEvent) => {
    if (event.key !== THEME_KEY && event.key !== null) return
    current = readPreference(storage())
    notify()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(onChange)
    window.removeEventListener('storage', onStorage)
  }
}

function subscribeSystem(onChange: () => void) {
  const media = window.matchMedia?.(DARK_QUERY)
  media?.addEventListener('change', onChange)
  return () => media?.removeEventListener('change', onChange)
}

const systemDark = () => window.matchMedia?.(DARK_QUERY).matches ?? false

/** Current theme preference, applied to <html data-theme> and kept in sync with the OS (as Chalkline's useTheme). */
export function useTheme() {
  const preference = useSyncExternalStore(subscribePreference, getPreference, () => 'system' as const)
  const theme: Theme = resolveTheme(
    preference,
    useSyncExternalStore(subscribeSystem, systemDark, () => false),
  )

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  const set = useCallback((next: ThemePreference) => setPreference(next), [])
  const cycle = useCallback(() => setPreference(nextPreference(getPreference())), [])

  return { preference, theme, set, cycle }
}

/** The theme preference outside React (Settings > Reset to defaults and its Undo). Same store as the toggle. */
export const themeStore = { get: getPreference, set: setPreference }

/** Tests only: forget the in-memory preference so the next read comes from storage. */
export function resetThemeForTests() {
  current = undefined
}
