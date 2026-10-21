// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import type { InputRefusal } from '@/calculators/registry'
import { mount } from '@/test/dom'
import { RefusalNotice } from './RefusalNotice'

/* RefusalNotice for a tax refusal (unverified figures) and for an input refusal (the engine's, by field). Made-up paths and words. */

let view: ReturnType<typeof mount> | undefined
afterEach(() => view?.unmount())

const inputs: InputRefusal = {
  ok: false,
  kind: 'inputs',
  problems: [
    { field: 'years', label: 'Years', message: 'Enter a whole number of years within the limit.' },
    { field: 'result', label: 'Result', message: 'The result is too large to show.' },
  ],
}

describe('RefusalNotice', () => {
  it('names each refused field and why, and says nothing about tax figures', () => {
    view = mount(<RefusalNotice refusal={inputs} />)
    const notice = view.host.querySelector('[data-refusal="inputs"]')!
    expect(notice.querySelector('h2')?.textContent).toBe('No results for these inputs')
    const items = [...notice.querySelectorAll('li')].map((li) => li.textContent)
    expect(items).toEqual(['Years: Enter a whole number of years within the limit.', 'Result: The result is too large to show.'])
    expect(notice.textContent).not.toMatch(/tax|verified/i)
    expect(notice.querySelector('[data-refusal-field="years"]')).not.toBeNull()
  })

  it('a tax refusal is unchanged: the groups not verified and a link to Tax data', () => {
    view = mount(<RefusalNotice refusal={{ ok: false, taxYear: '2026-27', unverified: ['incomeTax.personalAllowance'] }} />)
    const notice = view.host.querySelector('[data-refusal]')!
    expect(notice.getAttribute('data-refusal')).toBe('true')
    expect(notice.querySelector('h2')?.textContent).toBe('No results yet: tax figures not verified')
  })
})
