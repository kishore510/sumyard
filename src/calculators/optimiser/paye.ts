import type { TaxYearConfig } from '@/config/tax/schema'
import type { Refusal } from '@/config/tax/sourced'
import type { Money } from '@/lib/money'
import type { ParsedTaxCode, PayeEstimate, PayeNotModelled, PayeResult, TakeHomeResult } from './types'

/* STUB (red commit): tax codes and the PAYE estimate (decisions B11 to B13). */

export function parseTaxCode(_text: string): ParsedTaxCode {
  return { ok: false, reason: 'invalid' }
}

export function paye(_code: string, _pay: Money, _config: TaxYearConfig): PayeResult | PayeNotModelled | Refusal {
  return { ok: false, reason: 'invalid', kind: null, message: '' }
}

export function payeEstimate(_code: string, _result: TakeHomeResult, _config: TaxYearConfig): PayeEstimate | PayeNotModelled | Refusal {
  return { ok: false, reason: 'invalid', kind: null, message: '' }
}
