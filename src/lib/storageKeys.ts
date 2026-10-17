/*
 * Every browser-storage key Sumyard owns, in one list (as Chalkline's
 * src/persistence/storageKeys.ts). Keys are namespaced `sumyard:v1:...` and
 * each record carries a schema version. Adding a key needs a migration plan
 * and an entry in docs/privacy.md; About > Privacy lists this object as is.
 * scripts/checks/storageKeys.test.ts fails if code, this list and the doc
 * disagree.
 */

export interface OwnedKey {
  key: string
  /** Plain-language description, for About > Privacy. */
  what: string
  /** Version of the record stored under the key. */
  schemaVersion: number
}

export const STORAGE_KEYS = {
  theme: { key: 'sumyard:v1:theme', what: 'Your theme choice: System, Light or Dark', schemaVersion: 1 },
  settings: { key: 'sumyard:v1:settings', what: 'Your default region and how amounts are shown', schemaVersion: 1 },
  lastSeenVersion: { key: 'sumyard:v1:last-seen-version', what: 'The last version whose What’s new you opened', schemaVersion: 1 },
  acknowledged: { key: 'sumyard:v1:acknowledged', what: 'That you have read the “illustrative, not advice” notice', schemaVersion: 1 },
} as const satisfies Record<string, OwnedKey>
