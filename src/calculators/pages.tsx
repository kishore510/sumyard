import { type ComponentType, lazy } from 'react'

/* Each calculator's page, loaded when first opened. Keys are registry ids (./index.ts). */
export const CALCULATOR_PAGES: Readonly<Record<string, ComponentType>> = {
  optimiser: lazy(() => import('./optimiser/OptimiserPage')),
  'compound-interest': lazy(() => import('./compound-interest/CompoundPage')),
  'car-decision': lazy(() => import('./car-decision/CarDecisionPage')),
  budget: lazy(() => import('./budget/BudgetPage')),
  mortgage: lazy(() => import('./mortgage/MortgagePage')),
}
