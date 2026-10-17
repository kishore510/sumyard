/*
 * Every browser-storage key Sumyard owns, in one list (as Chalkline's
 * src/persistence/storageKeys.ts). Keys are namespaced `sumyard:v1:...` and
 * each record carries a schema version. Adding a key needs a migration plan
 * and an entry in docs/privacy.md (and About > Privacy once it exists).
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
} as const satisfies Record<string, OwnedKey>
