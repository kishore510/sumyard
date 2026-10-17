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
 * Exact strings that look like URLs but are never fetched or shown as links,
 * each allowed only in the kind of file it comes from. Each needs a reason.
 * Adding one is a privacy decision: say so in the PR. The build check fails
 * on an entry the build no longer contains, so the list can only shrink.
 */
export const INERT_URLS: Readonly<Record<string, { reason: string; fileType: '.js' | '.css' }>> = {
  'http://www.w3.org/2000/svg': {
    fileType: '.js',
    reason: 'SVG namespace identifier used by React DOM to create elements; never fetched.',
  },
  'http://www.w3.org/1999/xlink': {
    fileType: '.js',
    reason: 'XLink namespace identifier used by React DOM for SVG attributes; never fetched.',
  },
  'http://www.w3.org/1998/Math/MathML': { fileType: '.js', reason: 'MathML namespace identifier used by React DOM; never fetched.' },
  'http://www.w3.org/XML/1998/namespace': {
    fileType: '.js',
    reason: 'XML namespace identifier used by React DOM for xml:* attributes; never fetched.',
  },
  'https://react.dev/errors/': {
    fileType: '.js',
    reason: "Prefix of the link React's production build puts in error messages (console only); never fetched.",
  },
  'https://tailwindcss.com': {
    fileType: '.css',
    reason: "Tailwind CSS's licence comment at the top of the stylesheet (kept for the MIT licence); never fetched.",
  },
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
    if (GOV_UK.test(url) || INERT_URLS[url]?.fileType === extname(file)) continue
    findings.push({ file, url, reason: 'External URL not on the allowlist (plain https gov.uk links only)' })
  }
  return findings
}

/** Every text file under `dir`, as full paths. */
export function textFiles(dir: string): string[] {
  return statSync(dir).isDirectory()
    ? readdirSync(dir).flatMap((name) => textFiles(join(dir, name)))
    : TEXT_FILES.has(extname(dir))
      ? [dir]
      : []
}

export function scanDir(dir: string): Finding[] {
  return textFiles(dir).flatMap((path) => scanText(relative(dir, path), readFileSync(path, 'utf8')))
}
