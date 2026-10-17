import { describe, expect, it } from 'vitest'
import { STORAGE_KEYS } from '@/lib/storageKeys'
import { createAcknowledgedStore } from './acknowledged'

const KEY = STORAGE_KEYS.acknowledged.key

function memory(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  }
}

describe('acknowledged store (the first-run notice)', () => {
  it('reads the stored acknowledgement', () => {
    expect(createAcknowledgedStore(() => memory()).get()).toBe(false)
    expect(createAcknowledgedStore(() => memory({ [KEY]: '{"schemaVersion":1,"acknowledged":true}' })).get()).toBe(true)
    expect(createAcknowledgedStore(() => memory({ [KEY]: '{"schemaVersion":1,"acknowledged":"yes"}' })).get()).toBe(false)
  })

  it('stores true as a record and false by removing the key (restore and clear all data)', () => {
    const storage = memory()
    const store = createAcknowledgedStore(() => storage)
    expect(store.set(true)).toBe(true)
    expect(JSON.parse(storage.data.get(KEY)!)).toEqual({ schemaVersion: 1, acknowledged: true })
    expect(store.set(false)).toBe(true)
    expect(storage.data.has(KEY)).toBe(false)
    expect(store.get()).toBe(false)
  })
})
