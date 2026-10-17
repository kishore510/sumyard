/*
 * Checks for untrusted JSON: imported files, restored backups, and what is
 * read back from localStorage. Hand-written (no schema library). The rule is
 * to check the whole value first, then build fresh objects from the fields
 * that are wanted, never to keep or spread the parsed objects themselves.
 */

/** Keys refused anywhere in untrusted JSON, so nothing can reach an object's prototype. */
export const FORBIDDEN_KEYS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype'])

export function parseJsonText(text: string): { ok: true; value: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, value: JSON.parse(text) }
  } catch {
    return { ok: false, error: 'This file isn’t valid JSON.' }
  }
}

export interface JsonLimits {
  /** Deepest nesting of arrays and objects. */
  maxDepth: number
  /** Most values in total (every array item, object field and leaf). */
  maxNodes: number
}

const DEFAULT_LIMITS: JsonLimits = { maxDepth: 16, maxNodes: 200_000 }

/**
 * Null if `value` is plain JSON within the limits with no forbidden key;
 * otherwise a sentence fragment saying what is wrong ("contains the key
 * "__proto__", which Sumyard doesn't accept").
 */
export function checkUntrustedJson(value: unknown, limits: JsonLimits = DEFAULT_LIMITS): string | null {
  let nodes = 0
  const walk = (node: unknown, depth: number): string | null => {
    if (++nodes > limits.maxNodes) return 'has too many values'
    if (node === null || typeof node === 'string' || typeof node === 'boolean') return null
    if (typeof node === 'number') return Number.isFinite(node) ? null : 'has a number JSON can’t hold'
    if (typeof node !== 'object') return 'has a value JSON can’t hold'
    if (depth >= limits.maxDepth) return 'is nested too deeply'
    if (Array.isArray(node)) {
      for (const item of node) {
        const problem = walk(item, depth + 1)
        if (problem) return problem
      }
      return null
    }
    if (!isRecord(node)) return 'has a value JSON can’t hold'
    for (const key of Object.keys(node)) {
      if (FORBIDDEN_KEYS.has(key)) return `contains the key "${key}", which Sumyard doesn’t accept`
      const problem = walk(node[key], depth + 1)
      if (problem) return problem
    }
    return null
  }
  return walk(value, 0)
}

/** A plain object (as JSON.parse makes), not an array, null, a class instance or anything else. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

// C0 and C1 controls, and the bidirectional embedding, override and isolate characters (which can make text read backwards).
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching control characters is the point.
const UNSAFE_CHARACTERS = /[\u0000-\u0008\u000e-\u001f\u007f-\u009f‎‏‪-‮⁦-⁩]/g

/**
 * Text that is safe and tidy to show: control and direction characters
 * removed, whitespace runs collapsed to one space, trimmed, and cut to at
 * most `maxLength` characters (code points, so emoji aren't split).
 */
export function cleanText(raw: string, maxLength: number): string {
  const tidy = raw.replace(UNSAFE_CHARACTERS, '').replace(/\s+/g, ' ').trim()
  return Array.from(tidy).slice(0, maxLength).join('').trim()
}

/** JSON with object keys sorted, so equal content gives equal text (duplicate checks). */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, node: unknown) =>
    isRecord(node)
      ? Object.fromEntries(
          Object.keys(node)
            .sort()
            .map((k) => [k, node[k]]),
        )
      : node,
  )
}
