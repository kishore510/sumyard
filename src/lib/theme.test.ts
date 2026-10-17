import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { STORAGE_KEYS } from './storageKeys'
import { nextPreference, parsePreference, resolveTheme, serializePreference, storedPreference, type ThemePreference } from './theme'
import { extractPrePaintScript, prePaintScriptProblems } from './themeScript'

const html = readFileSync(join(import.meta.dirname, '..', '..', 'index.html'), 'utf8')
const record = (theme: unknown, schemaVersion: unknown = 1) => JSON.stringify({ schemaVersion, theme })

describe('theme', () => {
  it('stores the preference under sumyard:v1:theme', () => {
    expect(STORAGE_KEYS.theme.key).toBe('sumyard:v1:theme')
  })

  it('parses known preferences and falls back to system', () => {
    expect(parsePreference('dark')).toBe('dark')
    expect(parsePreference('light')).toBe('light')
    expect(parsePreference('system')).toBe('system')
    expect(parsePreference('purple')).toBe('system')
    expect(parsePreference(null)).toBe('system')
  })

  it('resolves system preference from the media query', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })

  it('cycles system -> light -> dark -> system', () => {
    expect(nextPreference('system')).toBe('light')
    expect(nextPreference('light')).toBe('dark')
    expect(nextPreference('dark')).toBe('system')
  })

  it('round-trips a stored record with its schema version', () => {
    for (const pref of ['system', 'light', 'dark'] as const) {
      const text = serializePreference(pref)
      expect(JSON.parse(text)).toEqual({ schemaVersion: STORAGE_KEYS.theme.schemaVersion, theme: pref })
      expect(storedPreference(text)).toBe(pref)
    }
  })

  it('treats a missing, unreadable or unknown-version record as system', () => {
    expect(storedPreference(null)).toBe('system')
    expect(storedPreference('{oops')).toBe('system')
    expect(storedPreference('null')).toBe('system')
    expect(storedPreference('"dark"')).toBe('system')
    expect(storedPreference(record('neon'))).toBe('system')
    expect(storedPreference(record('dark', 2))).toBe('system')
  })
})

/** Runs the real inline script from index.html against a fake browser. */
function runPrePaint(stored: string | null | Error, systemDark: boolean | 'no-matchMedia') {
  const documentElement = { dataset: {} as Record<string, string> }
  const localStorage = {
    getItem(key: string) {
      if (stored instanceof Error) throw stored
      return key === STORAGE_KEYS.theme.key ? stored : null
    },
  }
  const window = {
    localStorage,
    matchMedia:
      systemDark === 'no-matchMedia' ? undefined : (query: string) => ({ matches: query === '(prefers-color-scheme: dark)' && systemDark }),
  }
  new Function('window', 'document', 'localStorage', extractPrePaintScript(html))(window, { documentElement }, localStorage)
  return documentElement.dataset.theme
}

describe('pre-paint theme script (index.html)', () => {
  const cases: [label: string, stored: string | null, systemDark: boolean, expected: 'light' | 'dark'][] = [
    ['nothing stored, OS light', null, false, 'light'],
    ['nothing stored, OS dark', null, true, 'dark'],
    ['system, OS light', record('system'), false, 'light'],
    ['system, OS dark', record('system'), true, 'dark'],
    ['light, OS dark', record('light'), true, 'light'],
    ['light, OS light', record('light'), false, 'light'],
    ['dark, OS light', record('dark'), false, 'dark'],
    ['dark, OS dark', record('dark'), true, 'dark'],
    ['unreadable record, OS dark', '{oops', true, 'dark'],
    ['unknown theme, OS light', record('neon'), false, 'light'],
    ['newer schema version, OS dark', record('light', 2), true, 'dark'],
  ]

  it.each(cases)('%s -> %s', (_label, stored, systemDark, expected) => {
    expect(runPrePaint(stored, systemDark)).toBe(expected)
  })

  it.each(cases)('agrees with theme.ts: %s', (_label, stored, systemDark) => {
    expect(runPrePaint(stored, systemDark)).toBe(resolveTheme(storedPreference(stored), systemDark))
  })

  it('falls back to the OS when storage is blocked', () => {
    expect(runPrePaint(new Error('SecurityError'), true)).toBe('dark')
    expect(runPrePaint(new Error('SecurityError'), false)).toBe('light')
  })

  it('falls back to light without matchMedia', () => {
    expect(runPrePaint(null, 'no-matchMedia')).toBe('light')
    expect(runPrePaint(record('dark'), 'no-matchMedia')).toBe('dark')
  })

  it.each<ThemePreference>(['system', 'light', 'dark'])('reads what the app writes (%s)', (pref) => {
    expect(runPrePaint(serializePreference(pref), true)).toBe(resolveTheme(pref, true))
  })

  it('runs before first paint: inline, blocking, first in <head>, before any stylesheet or module', () => {
    expect(prePaintScriptProblems(html)).toEqual([])
  })

  it('flags a script that would run too late', () => {
    const script = `<script>${extractPrePaintScript(html)}</script>`
    expect(prePaintScriptProblems('<html><head><title>x</title></head><body></body></html>')).not.toEqual([])
    expect(prePaintScriptProblems(`<html><head><link rel="stylesheet" href="a.css">${script}</head></html>`)).not.toEqual([])
    expect(prePaintScriptProblems(`<html><head><script type="module" src="a.js"></script>${script}</head></html>`)).not.toEqual([])
    expect(prePaintScriptProblems(`<html><head></head><body>${script}</body></html>`)).not.toEqual([])
    expect(prePaintScriptProblems(`<html><head>${script.replace('<script>', '<script defer>')}</head></html>`)).not.toEqual([])
  })
})
