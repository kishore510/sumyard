/*
 * Storage-key guard. Every browser-storage key the app uses must be owned in
 * src/lib/storageKeys.ts and listed in docs/privacy.md; every owned or listed
 * key must be used. (About > Privacy renders STORAGE_KEYS itself, and
 * src/sheets/AboutPage.test.tsx checks it shows each one.) Pure apart from
 * readSourceFiles.
 *
 * "Used" means the code names the key: a `sumyard:v1:...` string literal
 * (index.html's pre-paint script has one) or a `STORAGE_KEYS.<name>`
 * reference. Storage calls with any other literal key, and other browser
 * storage (sessionStorage, IndexedDB, cookies), fail outright.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import type { OwnedKey } from '../../src/lib/storageKeys'

export interface SourceFile {
  path: string
  text: string
}

const KEY_LITERAL = /['"`](sumyard:v1:[a-z0-9-]+)['"`]/g
const KEY_REFERENCE = /\bSTORAGE_KEYS\.(\w+)/g
const STORAGE_CALL = /\b(?:localStorage|storage\(\)|storage)\??\.(?:getItem|setItem|removeItem)\(\s*(['"`])([^'"`]*)\1/g
const OTHER_STORAGE: [label: string, pattern: RegExp][] = [
  ['sessionStorage', /\bsessionStorage\b/],
  ['IndexedDB', /\bindexedDB\b/],
  ['cookies', /\bdocument\.cookie\b/],
]

/** Keys in the first column of docs/privacy.md's table rows. */
export function privacyDocKeys(doc: string): string[] {
  return doc
    .split('\n')
    .map((line) => /^\|\s*`(sumyard:[^`]+)`\s*\|/.exec(line)?.[1])
    .filter((key): key is string => key !== undefined)
}

const DEFINITIONS = 'src/lib/storageKeys.ts'

export function checkStorageKeys({
  files,
  owned,
  privacyDoc,
}: {
  files: SourceFile[]
  owned: Record<string, OwnedKey>
  privacyDoc: string
}): string[] {
  const problems: string[] = []
  const ownedKeys = new Map(Object.entries(owned).map(([name, { key }]) => [key, name]))
  const used = new Set<string>()

  for (const { path, text } of files) {
    if (path === DEFINITIONS) continue
    for (const [, key] of text.matchAll(KEY_LITERAL)) {
      used.add(key!)
      if (!ownedKeys.has(key!)) problems.push(`${path}: storage key "${key}" is not in ${DEFINITIONS}`)
    }
    for (const [, name] of text.matchAll(KEY_REFERENCE)) {
      const entry = owned[name!]
      if (entry) used.add(entry.key)
      else problems.push(`${path}: STORAGE_KEYS.${name} does not exist in ${DEFINITIONS}`)
    }
    for (const [, , key] of text.matchAll(STORAGE_CALL)) {
      if (!key!.startsWith('sumyard:v1:')) problems.push(`${path}: storage key "${key}" is outside the sumyard:v1: namespace`)
    }
    for (const [label, pattern] of OTHER_STORAGE) {
      if (pattern.test(text)) problems.push(`${path}: uses ${label}; Sumyard stores data only in localStorage under ${DEFINITIONS}`)
    }
  }

  const listed = new Set(privacyDocKeys(privacyDoc))
  for (const [key, name] of ownedKeys) {
    if (!used.has(key)) problems.push(`STORAGE_KEYS.${name} (${key}) is not used by any code: remove it, with a migration note`)
    if (!listed.has(key)) problems.push(`${key} is not listed in docs/privacy.md`)
  }
  for (const key of listed) {
    if (!ownedKeys.has(key)) problems.push(`docs/privacy.md lists ${key}, which is not in ${DEFINITIONS}`)
  }
  for (const key of used) {
    if (!listed.has(key) && !ownedKeys.has(key)) problems.push(`${key} is used but not listed in docs/privacy.md`)
  }
  return problems
}

/** The app's own source (src/, not tests) and index.html, with paths relative to `root`. */
export function readSourceFiles(root: string): SourceFile[] {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name)
      if (statSync(path).isDirectory()) return walk(path)
      return /\.(?:ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : []
    })
  return [join(root, 'index.html'), ...walk(join(root, 'src'))].map((path) => ({
    path: relative(root, path),
    text: readFileSync(path, 'utf8'),
  }))
}
