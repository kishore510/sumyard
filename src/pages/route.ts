import { isCalculatorId } from '@/calculators/registry'

/*
 * Page routes, under the sheets: the home page, a calculator at #/c/<id> and
 * its compare view at #/c/<id>/compare. Sheet hashes (#/help, #/settings,
 * ...) are not pages: a sheet keeps the page it was opened over (see
 * src/sheets/route.ts), so parsePage returns null for them. Any other hash
 * (or none) is the home page, as before calculators existed.
 */

export type PageRoute = { kind: 'home' } | { kind: 'calculator'; id: string } | { kind: 'compare'; id: string } | { kind: 'not-found' }

export function parsePage(hash: string): PageRoute | null {
  const calculator = /^#\/c\/([^/]*)(?:\/([^/]*))?\/?$/.exec(hash)
  if (calculator) {
    const [, id = '', view] = calculator
    if (!isCalculatorId(id)) return { kind: 'not-found' }
    if (view === undefined || view === '') return { kind: 'calculator', id }
    return view === 'compare' ? { kind: 'compare', id } : { kind: 'not-found' }
  }
  if (/^#\/[a-z]/.test(hash)) return null
  return { kind: 'home' }
}

export function formatPage(route: PageRoute): string {
  switch (route.kind) {
    case 'home':
    case 'not-found':
      return ''
    case 'calculator':
      return `#/c/${route.id}`
    case 'compare':
      return `#/c/${route.id}/compare`
  }
}
