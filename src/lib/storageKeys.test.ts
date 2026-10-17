import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { STORAGE_KEYS } from './storageKeys'

const privacy = readFileSync(join(import.meta.dirname, '..', '..', 'docs', 'privacy.md'), 'utf8')
const keys = Object.values(STORAGE_KEYS)

describe('storage keys', () => {
  it('owns at least one key', () => {
    expect(keys.length).toBeGreaterThan(0)
  })

  it.each(keys)('$key is namespaced, versioned and described', ({ key, what, schemaVersion }) => {
    expect(key).toMatch(/^sumyard:v1:[a-z][a-z0-9-]*$/)
    expect(Number.isInteger(schemaVersion) && schemaVersion >= 1).toBe(true)
    expect(what.length).toBeGreaterThan(0)
  })

  it.each(keys)('$key is listed in docs/privacy.md', ({ key }) => {
    expect(privacy).toContain(`\`${key}\``)
  })
})
