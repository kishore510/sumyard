import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { type OwnedKey, STORAGE_KEYS } from '../../src/lib/storageKeys'
import { checkStorageKeys, privacyDocKeys, readSourceFiles } from './storageKeys'

const ROOT = join(import.meta.dirname, '..', '..')

const owned: Record<string, OwnedKey> = {
  theme: { key: 'sumyard:v1:theme', what: 'Theme', schemaVersion: 1 },
  settings: { key: 'sumyard:v1:settings', what: 'Settings', schemaVersion: 1 },
}

const doc = (...keys: string[]) => `# Privacy

| Key | What | Record | Since |
|---|---|---|---|
${keys.map((k) => `| \`${k}\` | Something. | \`{}\` | 0.1.0 |`).join('\n')}

Prose that mentions \`sumyard:v1:not-a-row\` is not a listing.
`

const file = (path: string, text: string) => ({ path, text })
const uses = [file('src/lib/theme.ts', 'STORAGE_KEYS.theme'), file('src/settings/settings.ts', 'const { key } = STORAGE_KEYS.settings')]

describe('privacyDocKeys', () => {
  it('reads the keys from the table rows only', () => {
    expect(privacyDocKeys(doc('sumyard:v1:theme', 'sumyard:v1:settings'))).toEqual(['sumyard:v1:theme', 'sumyard:v1:settings'])
  })
})

describe('checkStorageKeys', () => {
  it('passes when every key is owned, used and listed', () => {
    expect(checkStorageKeys({ files: uses, owned, privacyDoc: doc('sumyard:v1:theme', 'sumyard:v1:settings') })).toEqual([])
  })

  it('fails on a key used but not listed in docs/privacy.md', () => {
    const problems = checkStorageKeys({ files: uses, owned, privacyDoc: doc('sumyard:v1:theme') })
    expect(problems.join('\n')).toMatch(/sumyard:v1:settings.*privacy\.md/)
  })

  it('fails on a key listed in docs/privacy.md but not owned or used', () => {
    const problems = checkStorageKeys({ files: uses, owned, privacyDoc: doc('sumyard:v1:theme', 'sumyard:v1:settings', 'sumyard:v1:old') })
    expect(problems.join('\n')).toMatch(/sumyard:v1:old/)
  })

  it('fails on an owned key that no code uses', () => {
    const problems = checkStorageKeys({ files: [uses[0]!], owned, privacyDoc: doc('sumyard:v1:theme', 'sumyard:v1:settings') })
    expect(problems.join('\n')).toMatch(/settings.*not used/)
  })

  it('fails on a key literal in code that is not in storageKeys.ts', () => {
    const files = [...uses, file('src/x.ts', "localStorage.setItem('sumyard:v1:secret', '1')")]
    expect(checkStorageKeys({ files, owned, privacyDoc: doc('sumyard:v1:theme', 'sumyard:v1:settings') }).join('\n')).toMatch(
      /sumyard:v1:secret/,
    )
  })

  it('fails on a reference to a STORAGE_KEYS entry that does not exist', () => {
    const files = [...uses, file('src/x.ts', 'STORAGE_KEYS.nope.key')]
    expect(checkStorageKeys({ files, owned, privacyDoc: doc('sumyard:v1:theme', 'sumyard:v1:settings') }).join('\n')).toMatch(/nope/)
  })

  it('fails on a storage call with a key outside the sumyard:v1: namespace', () => {
    const files = [...uses, file('src/x.ts', "window.localStorage.getItem('chalkline.theme')")]
    expect(checkStorageKeys({ files, owned, privacyDoc: doc('sumyard:v1:theme', 'sumyard:v1:settings') }).join('\n')).toMatch(
      /chalkline\.theme/,
    )
  })

  it('fails on other browser storage: sessionStorage, IndexedDB and cookies', () => {
    for (const text of ['sessionStorage.setItem(k, v)', 'indexedDB.open("x")', 'document.cookie = "a=b"']) {
      const files = [...uses, file('src/x.ts', text)]
      expect(checkStorageKeys({ files, owned, privacyDoc: doc('sumyard:v1:theme', 'sumyard:v1:settings') }), text).not.toEqual([])
    }
  })
})

describe('this repo', () => {
  it('uses, owns and lists the same storage keys (code, storageKeys.ts, docs/privacy.md)', () => {
    const privacyDoc = readFileSync(join(ROOT, 'docs', 'privacy.md'), 'utf8')
    expect(checkStorageKeys({ files: readSourceFiles(ROOT), owned: STORAGE_KEYS, privacyDoc })).toEqual([])
  })

  it('owns exactly the keys agreed (0.2.0, plus scenarios in 0.4.0)', () => {
    expect(Object.fromEntries(Object.entries(STORAGE_KEYS).map(([name, { key }]) => [name, key]))).toEqual({
      theme: 'sumyard:v1:theme',
      settings: 'sumyard:v1:settings',
      lastSeenVersion: 'sumyard:v1:last-seen-version',
      acknowledged: 'sumyard:v1:acknowledged',
      scenarios: 'sumyard:v1:scenarios',
    })
  })

  it('scans the app source and index.html, not tests', () => {
    const paths = readSourceFiles(ROOT).map((f) => f.path)
    expect(paths).toContain('index.html')
    expect(paths).toContain('src/lib/theme.ts')
    expect(paths.some((p) => /\.test\.tsx?$/.test(p))).toBe(false)
  })
})
