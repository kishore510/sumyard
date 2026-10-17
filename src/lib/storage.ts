/*
 * The one way into localStorage (as Chalkline's src/persistence/localStore.ts).
 * Storage can be missing, blocked (private mode, site-data settings) or full,
 * so access is guarded and callers get `undefined` or `null` rather than an
 * exception. Keys come from storageKeys.ts.
 */

export type KeyValueStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/** localStorage, or undefined where the browser blocks it. */
export function appStorage(): KeyValueStore | undefined {
  try {
    return globalThis.localStorage ?? undefined
  } catch {
    return undefined
  }
}

/** Reads a key; null if missing or unreadable. */
export function readKey(key: string, storage: Pick<Storage, 'getItem'> | undefined = appStorage()): string | null {
  try {
    return storage?.getItem(key) ?? null
  } catch {
    return null
  }
}

/** Writes a key. False if storage is blocked or full (the value then lasts for this visit only). */
export function writeKey(key: string, value: string, storage: Pick<Storage, 'setItem'> | undefined = appStorage()): boolean {
  if (!storage) return false
  try {
    storage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

/**
 * A versioned record `{ schemaVersion, ...fields }`, or null if the text is
 * missing, unreadable, not an object or another schema version.
 */
export function readRecord(text: string | null, schemaVersion: number): Record<string, unknown> | null {
  if (text === null) return null
  try {
    const record: unknown = JSON.parse(text)
    if (typeof record !== 'object' || record === null || Array.isArray(record)) return null
    return (record as { schemaVersion?: unknown }).schemaVersion === schemaVersion ? (record as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** Upgrades a record from schema version n to n + 1. May throw if it can't read the old record. */
export type Migration = (record: Record<string, unknown>) => Record<string, unknown>

/**
 * The migration hook. Reads a versioned record at any version from 1 up to
 * `schemaVersion`, runs `migrations[n]` for each step from its version up, and
 * returns it stamped with `schemaVersion`. Null if the text is unreadable, is
 * a newer version, needs a step that doesn't exist, or a step throws: callers
 * then use their defaults, as for a missing record.
 */
export function upgradeRecord(
  text: string | null,
  schemaVersion: number,
  migrations: Readonly<Record<number, Migration>>,
): Record<string, unknown> | null {
  if (text === null) return null
  let record: Record<string, unknown>
  try {
    const parsed: unknown = JSON.parse(text)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null
    record = parsed as Record<string, unknown>
  } catch {
    return null
  }
  const from = record.schemaVersion
  if (typeof from !== 'number' || !Number.isInteger(from) || from < 1 || from > schemaVersion) return null
  try {
    for (let version = from; version < schemaVersion; version++) {
      const step = migrations[version]
      if (!step) return null
      record = step(record)
    }
  } catch {
    return null
  }
  return { ...record, schemaVersion }
}

const NAMESPACE = 'sumyard:'

type Enumerable = Pick<Storage, 'length' | 'key' | 'getItem'>

/**
 * Roughly how much Sumyard stores in this browser: every `sumyard:` key and
 * its value, at two bytes per character (browsers keep localStorage as
 * UTF-16). Other sites' and apps' data is not counted. Null if blocked.
 */
export function sumyardStorageBytes(storage: Enumerable | undefined = appStorage() as Enumerable | undefined): number | null {
  if (!storage) return null
  try {
    let chars = 0
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i)
      if (key?.startsWith(NAMESPACE)) chars += key.length + (storage.getItem(key)?.length ?? 0)
    }
    return chars * 2
  } catch {
    return null
  }
}

/** Rough, readable size: "740 bytes", "12.3 KB", "4.1 MB" (from Chalkline). */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return 'unknown'
  if (bytes < 1024) return `${Math.round(bytes)} bytes`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`
}
