import { helloCalculator } from './hello/definition'
import { createCalculatorRegistry } from './registry'

/*
 * The app's calculators, in the order the home page lists them. Each one's
 * page is in ./pages.tsx. Scenarios, import and compare look calculators up
 * here; a scenario for an id not listed is refused on import.
 */
export const CALCULATORS = createCalculatorRegistry([helloCalculator])
