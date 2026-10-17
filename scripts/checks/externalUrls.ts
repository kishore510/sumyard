/*
 * External-URL scan of the built output (CI guard 8b). Sumyard makes no
 * network requests, so the build may contain no external URL except:
 * - plain https gov.uk links (www.gov.uk or gov.uk), and never where the
 *   browser would fetch them (script src, stylesheet, image, CSS url());
 * - the exact inert identifiers in INERT_URLS, which are never requested.
 * Anything else fails the build.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { extname, join, relative } from 'node:path'

export interface Finding {
  file: string
  url: string
  reason: string
}

/**
 * Exact strings that look like URLs but are never fetched or shown as links.
 * Each needs a reason. Adding one is a privacy decision: say so in the PR.
 */
export const INERT_URLS: Readonly<Record<string, string>> = {
  'http://www.w3.org/2000/svg': 'SVG namespace identifier used by React DOM to create elements; never fetched.',
  'http://www.w3.org/1999/xlink': 'XLink namespace identifier used by React DOM for SVG attributes; never fetched.',
  'http://www.w3.org/1998/Math/MathML': 'MathML namespace identifier used by React DOM; never fetched.',
  'http://www.w3.org/XML/1998/namespace': 'XML namespace identifier used by React DOM for xml:* attributes; never fetched.',
  'https://react.dev/errors/': "Prefix of the link React's production build puts in error messages (console only); never fetched.",
  'https://tailwindcss.com': "Tailwind CSS's licence comment at the top of the stylesheet (kept for the MIT licence); never fetched.",
}

const TEXT_FILES = new Set(['.html', '.js', '.mjs', '.css', '.svg', '.json', '.webmanifest', '.txt', '.xml', '.map'])

// Absolute (scheme://) or protocol-relative (//host) URLs. A protocol-relative URL only counts where a quote, paren
// or equals sign opens it, so comments like `// note` and regexes don't match.
const URL_PATTERN = /\b(?:https?|wss?|ftp):\/\/[^\s"'`()<>\\]+|(?<=["'(=]\s*)\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)+[^\s"'`()<>\\]*/gi

const GOV_UK = /^https:\/\/(?:www\.)?gov\.uk(?:[/?#][^\s]*)?$/i

/** Places where the browser fetches a URL by itself (not a link someone follows). */
const REQUEST_CONTEXTS = [
  /<(?:script|img|iframe|source|audio|video|embed|track|input)\b[^>]*\b(?:src|srcset|poster|data)\s*=\s*["']?\s*$/i,
  /<link\b[^>]*\bhref\s*=\s*["']?\s*$/i,
  /<object\b[^>]*\bdata\s*=\s*["']?\s*$/i,
  /url\(\s*["']?\s*$/i,
  /@import\s+["']?\s*$/i,
]

function trimUrl(raw: string): string {
  // Trailing punctuation that ends a sentence or a JS expression, not the URL.
  return raw.replace(/[.,;:!?]+$/, '')
}

export function scanText(file: string, text: string): Finding[] {
  const findings: Finding[] = []
  for (const match of text.matchAll(URL_PATTERN)) {
    const url = trimUrl(match[0])
    const before = text.slice(Math.max(0, match.index - 300), match.index)
    const requested = REQUEST_CONTEXTS.some((context) => context.test(before))
    if (requested) {
      findings.push({ file, url, reason: 'External URL in a place the browser fetches it' })
      continue
    }
    if (GOV_UK.test(url) || url in INERT_URLS) continue
    findings.push({ file, url, reason: 'External URL not on the allowlist (plain https gov.uk links only)' })
  }
  return findings
}

export function scanDir(dir: string): Finding[] {
  const walk = (path: string): string[] =>
    statSync(path).isDirectory() ? readdirSync(path).flatMap((name) => walk(join(path, name))) : TEXT_FILES.has(extname(path)) ? [path] : []
  return walk(dir).flatMap((path) => scanText(relative(dir, path), readFileSync(path, 'utf8')))
}
