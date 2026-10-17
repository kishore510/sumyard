import { appStorage, readKey, readRecord, removeKey, writeKey } from '@/lib/storage'
import { STORAGE_KEYS } from '@/lib/storageKeys'
import { createStore } from '@/lib/store'
import { APP_VERSION } from '@/version'

/*
 * The What's new "New" marker (as Chalkline's src/help/whatsNew.ts): the
 * version whose notes were last opened is remembered in this browser, as
 * `{ schemaVersion: 1, version }`. Storage may be missing or blocked; then
 * nothing is remembered and the marker simply shows again next visit.
 */

export const LAST_SEEN_KEY = STORAGE_KEYS.lastSeenVersion.key
const SCHEMA_VERSION = STORAGE_KEYS.lastSeenVersion.schemaVersion

type Store = Pick<Storage, 'getItem' | 'setItem'>

export function readLastSeen(store: Store | undefined = appStorage()): string | null {
  const version = readRecord(readKey(LAST_SEEN_KEY, store), SCHEMA_VERSION)?.version
  return typeof version === 'string' ? version : null
}

export function markSeen(version: string, store: Store | undefined = appStorage()): void {
  writeKey(LAST_SEEN_KEY, JSON.stringify({ schemaVersion: SCHEMA_VERSION, version }), store)
}

/** True when this version's notes haven't been opened in this browser yet. */
export function hasUnseenChanges(lastSeen: string | null, current: string): boolean {
  return lastSeen !== current
}

/** Whether to show the "New" marker on the menu button and menu item. */
export const unseenStore = createStore(hasUnseenChanges(readLastSeen(), APP_VERSION))

/** Opening What's new counts as seeing this version's changes. */
export function markThisVersionSeen() {
  markSeen(APP_VERSION)
  unseenStore.set(false)
}

/** Clear all data: forget which version was seen, so the marker shows again. */
export function clearSeen() {
  removeKey(LAST_SEEN_KEY)
  unseenStore.set(true)
}
