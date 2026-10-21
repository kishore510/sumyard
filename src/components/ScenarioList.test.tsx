// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { plainScenario, sampleScenario } from '@/calculators/fixtures/fakeCalculators'
import { mount } from '@/test/dom'
import { ScenarioList } from './ScenarioList'

/* The saved-scenario list says "Uses no tax rules" for a scenario with no tax year (made-up values). */

let view: ReturnType<typeof mount> | undefined
afterEach(() => view?.unmount())

describe('ScenarioList', () => {
  it('shows the tax year, or "Uses no tax rules" when a scenario has none', () => {
    view = mount(<ScenarioList scenarios={[sampleScenario(), plainScenario()]} onLoad={() => {}} />)
    const lines = [...view.host.querySelectorAll('li')].map((li) => li.textContent ?? '')
    expect(lines[0]).toMatch(/2026 to 2027 tax year/)
    expect(lines[1]).toMatch(/Uses no tax rules/)
    expect(lines[1]).not.toMatch(/tax year/)
  })
})
