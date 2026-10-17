import { CALCULATORS } from '@/calculators/index'
import { createScenarioStore } from './store'

/* The app's scenario store, over localStorage and the app's calculator registry. */

/** A random id; crypto.randomUUID where the browser has it. */
export function newScenarioId(): string {
  const c = globalThis.crypto
  if (typeof c?.randomUUID === 'function') return c.randomUUID()
  const bytes = new Uint8Array(16)
  c?.getRandomValues?.(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('') || String(Date.now())
}

export const nowIso = () => new Date().toISOString()

export const scenarioStore = createScenarioStore({ registry: CALCULATORS, newId: newScenarioId, now: nowIso })
