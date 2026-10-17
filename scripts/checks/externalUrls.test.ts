import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FAKE_VERIFIED_YEAR } from '../../src/config/tax/fixtures/fakeTaxYears'
import { isSourceUrl } from '../../src/config/tax/sourced'
import { INERT_URLS, scanDir, scanText } from './externalUrls'

const urls = (file: string, text: string) => scanText(file, text).map((f) => f.url)

describe('scanText', () => {
  it('passes relative, root-relative, data and fragment URLs', () => {
    const html =
      '<link rel="stylesheet" href="/sumyard/assets/index.css"><script src="./a.js"></script><a href="#top">Top</a><img src="data:image/png;base64,AAAA">'
    expect(scanText('index.html', html)).toEqual([])
    expect(scanText('a.css', "@font-face{src:url(/sumyard/assets/inter.woff2) format('woff2')}")).toEqual([])
  })

  it('allows plain https gov.uk links', () => {
    expect(scanText('index.html', '<a href="https://www.gov.uk/income-tax-rates">Rates</a>')).toEqual([])
    expect(scanText('a.js', 'const href="https://www.gov.uk/guidance/x#y"')).toEqual([])
  })

  it('fails on a gov.uk URL in a request context (it would be fetched, not followed)', () => {
    expect(urls('index.html', '<script src="https://www.gov.uk/x.js"></script>')).toEqual(['https://www.gov.uk/x.js'])
    expect(urls('index.html', '<link rel="stylesheet" href="https://www.gov.uk/a.css">')).toEqual(['https://www.gov.uk/a.css'])
    expect(urls('index.html', '<img src="https://www.gov.uk/logo.png">')).toEqual(['https://www.gov.uk/logo.png'])
    expect(urls('a.css', 'a{background:url(https://www.gov.uk/x.png)}')).toEqual(['https://www.gov.uk/x.png'])
  })

  it('fails on look-alike and insecure gov.uk hosts', () => {
    expect(urls('a.js', '"https://www.gov.uk.example.com/x"')).toHaveLength(1)
    expect(urls('a.js', '"https://notgov.uk/x"')).toHaveLength(1)
    expect(urls('a.js', '"http://www.gov.uk/x"')).toHaveLength(1)
  })

  it('fails on fonts or scripts from a CDN', () => {
    expect(urls('index.html', '<link href="https://fonts.googleapis.com/css2?family=Inter" rel="stylesheet">')).toHaveLength(1)
    expect(urls('a.css', "@import url('https://fonts.googleapis.com/css2?family=Inter');")).toHaveLength(1)
    expect(urls('index.html', '<script src="//cdn.example.com/lib.js"></script>')).toEqual(['//cdn.example.com/lib.js'])
  })

  it('fails on any other external URL in a bundle, such as an analytics endpoint', () => {
    expect(urls('a.js', 'fetch(`https://analytics.example.com/collect`)')).toEqual(['https://analytics.example.com/collect'])
    expect(urls('a.js', "new WebSocket('wss://live.example.com')")).toEqual(['wss://live.example.com'])
  })

  it('allows only the exact inert identifiers, each with a reason', () => {
    for (const [url, { reason, fileType }] of Object.entries(INERT_URLS)) {
      expect(reason.length, url).toBeGreaterThan(10)
      expect(scanText(`assets/a${fileType}`, `"${url}"`), url).toEqual([])
    }
    expect(urls('a.js', '"http://www.w3.org/2000/svg/evil.js"')).toHaveLength(1)
    expect(urls('a.js', '"https://react.dev/errors/../../tracker"')).toHaveLength(1)
  })

  it('allows each inert identifier only in the kind of file it comes from', () => {
    expect(urls('index.html', '<p>http://www.w3.org/2000/svg</p>')).toEqual(['http://www.w3.org/2000/svg'])
    expect(urls('a.css', '"https://react.dev/errors/"')).toEqual(['https://react.dev/errors/'])
    expect(urls('a.js', '"https://tailwindcss.com"')).toEqual(['https://tailwindcss.com'])
    expect(urls('a.css', '/*! tailwindcss | https://tailwindcss.com */')).toEqual([])
  })

  it('reports the file for each finding', () => {
    expect(scanText('assets/a.js', '"https://example.com"')).toEqual([
      expect.objectContaining({ file: 'assets/a.js', url: 'https://example.com' }),
    ])
  })
})

describe('tax-config source URLs in the bundle (fake fixtures)', () => {
  // A verified leaf as Vite emits it in a chunk, and the anchor the Tax data screen renders from it.
  const chunk = `const e=${JSON.stringify(FAKE_VERIFIED_YEAR)};export{e as t};`
  const anchor = '<a href="https://www.gov.uk/sumyard-fake-fixture/x" target="_blank" rel="noopener noreferrer">GOV.UK</a>'

  it('passes GOV.UK sources inside JavaScript strings, with no new allowlist entry', () => {
    expect(chunk).toContain('"sourceUrl":"https://www.gov.uk/')
    expect(scanText('assets/index.js', chunk)).toEqual([])
    expect(scanText('index.html', anchor)).toEqual([])
    expect(Object.keys(INERT_URLS).some((url) => url.includes('gov.uk'))).toBe(false)
  })

  it('accepts every URL the config accepts as a source (the config rule is the narrower one)', () => {
    for (const url of ['https://www.gov.uk/x', 'https://www.gov.uk/guidance/a-b?c=d#e']) {
      expect(isSourceUrl(url), url).toBe(true)
      expect(scanText('assets/a.js', `"${url}"`), url).toEqual([])
    }
  })

  it('still fails legislation.gov.uk and other hosts: allowing them would widen the allowlist (owner decision)', () => {
    for (const url of [
      'https://www.legislation.gov.uk/ukpga/x',
      'https://assets.publishing.service.gov.uk/x.pdf',
      'https://www.hmrc.gov.uk/x',
    ]) {
      expect(isSourceUrl(url), url).toBe(false)
      expect(urls('assets/a.js', `"${url}"`), url).toEqual([url])
    }
  })

  it('fails a GOV.UK source the browser would fetch, even from config', () => {
    expect(urls('index.html', '<img src="https://www.gov.uk/sumyard-fake-fixture/x.png">')).toHaveLength(1)
  })
})

describe('scanDir', () => {
  it('scans every text file under the folder, including nested ones', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sumyard-scan-'))
    mkdirSync(join(dir, 'assets'))
    writeFileSync(join(dir, 'index.html'), '<a href="https://www.gov.uk/">GOV.UK</a>')
    writeFileSync(join(dir, 'assets', 'a.js'), 'fetch("https://example.com/x")')
    writeFileSync(join(dir, 'assets', 'b.css'), 'a{background:url(https://example.org/y.png)}')
    writeFileSync(join(dir, 'assets', 'font.woff2'), Buffer.from([0, 1, 2, 3]))
    expect(
      scanDir(dir)
        .map((f) => f.url)
        .sort(),
    ).toEqual(['https://example.com/x', 'https://example.org/y.png'])
  })
})
