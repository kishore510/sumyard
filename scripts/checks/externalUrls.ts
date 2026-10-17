/*
 * External-URL scan of the built output (CI guard 8b). Sumyard makes no
 * network requests, so the build may contain no external URL except plain
 * https gov.uk links and a short list of inert identifiers.
 */

export interface Finding {
  file: string
  url: string
  reason: string
}

export const INERT_URLS: Readonly<Record<string, string>> = {}

export function scanText(_file: string, _text: string): Finding[] {
  throw new Error('not implemented')
}

export function scanDir(_dir: string): Finding[] {
  throw new Error('not implemented')
}
