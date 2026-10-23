import { budgetCalculator } from './budget/definition'
import { carDecisionCalculator } from './car-decision/definition'
import { compoundCalculator } from './compound-interest/definition'
import { optimiserCalculator } from './optimiser/definition'
import { createCalculatorRegistry } from './registry'

/*
 * The app's calculators, in the order the home page lists them. Each one's
 * page is in ./pages.tsx. Scenarios, import and compare look calculators up
 * here; a scenario for an id not listed is refused on import, and a stored
 * one is kept but hidden (the Hello placeholder's, since 0.9.0).
 */
export const CALCULATORS = createCalculatorRegistry([optimiserCalculator, compoundCalculator, carDecisionCalculator, budgetCalculator])
