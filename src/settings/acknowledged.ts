import { appStorage, type KeyValueStore, readKey, readRecord, removeKey, writeKey } from '@/lib/storage'
import { STORAGE_KEYS } from '@/lib/storageKeys'
import { createStore } from '@/lib/store'

/*
 * The first-run acknowledgement: `{ schemaVersion: 1, acknowledged: true }`
 * under sumyard:v1:acknowledged once "Got it" is pressed. Restoring a backup
 * can set it either way, and "Clear all data" removes it, so the notice shows
 * again. If storage is blocked it lasts for this visit only.
 */

const { key: ACK_KEY, schemaVersion: ACK_SCHEMA } = STORAGE_KEYS.acknowledged

export const readAcknowledged = (store?: Pick<Storage, 'getItem'>) => readRecord(readKey(ACK_KEY, store), ACK_SCHEMA)?.acknowledged === true

export function createAcknowledgedStore(storage: () => KeyValueStore | undefined = appStorage) {
  const store = createStore(readAcknowledged(storage()))
  return {
    get: store.get,
    subscribe: store.subscribe,
    /** Saves the choice. False if the browser refused (it then lasts for this visit). */
    set(value: boolean): boolean {
      store.set(value)
      return value
        ? writeKey(ACK_KEY, JSON.stringify({ schemaVersion: ACK_SCHEMA, acknowledged: true }), storage())
        : removeKey(ACK_KEY, storage())
    },
  }
}

export const acknowledgedStore = createAcknowledgedStore()
