/*
 * Scales and ticks for the hand-rolled SVG chart. Pure geometry: values in,
 * pixel positions and round tick values out. Whole-number (pence) axes keep
 * every tick a safe integer, so money ticks can be formatted exactly.
 */

const MAX = Number.MAX_SAFE_INTEGER

/** The smallest of 1, 2 or 5 times a power of ten that is at least `rough`. At least 1 for whole-number axes. */
export function niceStep(rough: number, integer = false): number {
  if (!Number.isFinite(rough) || rough <= 0) return 1
  const power = 10 ** Math.floor(Math.log10(rough))
  const normalised = rough / power
  const nice = normalised <= 1 ? 1 : normalised <= 2 ? 2 : normalised <= 5 ? 5 : 10
  const step = nice * power
  return integer ? Math.max(1, Math.round(step)) : step
}

export interface Domain {
  min: number
  max: number
  ticks: number[]
}

export interface DomainOptions {
  /** Keep zero in view (bars always start at zero). */
  includeZero?: boolean
  /** Whole-number values (pence): ticks are safe integers. */
  integer?: boolean
  /** About how many intervals between ticks. */
  targetTicks?: number
}

const decimalsOf = (step: number) => Math.max(0, -Math.floor(Math.log10(step)) + 1)

/** A domain covering the finite values, widened to round tick values. */
export function niceDomain(
  values: readonly number[],
  { includeZero = false, integer = false, targetTicks = 6 }: DomainOptions = {},
): Domain {
  const finite = values.filter((v) => Number.isFinite(v))
  if (finite.length === 0) return { min: 0, max: 1, ticks: [0, 1] }
  let low = Math.min(...finite)
  let high = Math.max(...finite)
  if (includeZero) {
    low = Math.min(low, 0)
    high = Math.max(high, 0)
  }
  if (low === high) {
    if (low === 0) return { min: 0, max: 1, ticks: [0, 1] }
    const pad = niceStep(Math.abs(low) / targetTicks, integer)
    low -= pad
    high += pad
  }
  const step = niceStep((high - low) / targetTicks, integer)
  let first = Math.floor(low / step)
  let last = Math.ceil(high / step)
  // Past the safe range, pull the outer ticks in and let the domain end at the data.
  let min = first * step
  let max = last * step
  if (integer) {
    while (first * step < -MAX) first++
    while (last * step > MAX) last--
    min = Math.max(min, -MAX)
    max = Math.min(max, MAX)
  }
  const ticks: number[] = []
  const round = (v: number) => (integer ? Math.round(v) : Number(v.toFixed(decimalsOf(step))))
  for (let k = first; k <= last && ticks.length < 50; k++) ticks.push(round(k * step) || 0)
  if (!integer) {
    min = round(min) || 0
    max = round(max) || 0
  }
  return { min: Math.min(min, ticks[0] ?? min), max: Math.max(max, ticks.at(-1) ?? max), ticks }
}

/** A linear map from domain to range. A domain of one value maps to the middle of the range. */
export function linearScale([d0, d1]: readonly [number, number], [r0, r1]: readonly [number, number]): (value: number) => number {
  if (d0 === d1) return () => (r0 + r1) / 2
  const k = (r1 - r0) / (d1 - d0)
  return (value) => r0 + (value - d0) * k
}

/** Equal bands across a range, for bars and category positions. `padding` is the share of each band left empty. */
export function bandScale(count: number, [r0, r1]: readonly [number, number], padding: number) {
  const step = count > 0 ? (r1 - r0) / count : 0
  const bandwidth = step * (1 - padding)
  return {
    step,
    bandwidth,
    start: (index: number) => r0 + index * step + (step - bandwidth) / 2,
    center: (index: number) => r0 + index * step + step / 2,
  }
}

/** Round ticks inside the values' range (for a numeric x axis): at least two where doubling the target, up to three times, finds them. */
export function ticksWithin(values: readonly number[], { integer = false, targetTicks = 6 }: DomainOptions = {}): number[] {
  const finite = values.filter((v) => Number.isFinite(v))
  if (finite.length === 0) return []
  const low = Math.min(...finite)
  const high = Math.max(...finite)
  let ticks: number[] = []
  for (let target = targetTicks, tries = 0; tries < 4; target *= 2, tries++) {
    ticks = niceDomain(finite, { integer, targetTicks: target }).ticks.filter((t) => t >= low && t <= high)
    if (ticks.length >= 2) break
  }
  return ticks
}
