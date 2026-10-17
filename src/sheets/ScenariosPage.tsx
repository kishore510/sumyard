import { Download, Upload } from 'lucide-react'
import { useRef } from 'react'
import { CALCULATORS } from '@/calculators/index'
import { sessionFor } from '@/calculators/session'
import { ScenarioList } from '@/components/ScenarioList'
import { StorageNotice } from '@/components/StorageNotice'
import { EmptyState } from '@/components/states'
import { Button } from '@/components/ui/button'
import { useStore } from '@/lib/store'
import { formatPage } from '@/pages/route'
import { exportScenarios, startImport } from '@/scenarios/actions'
import { scenarioStore } from '@/scenarios/index'
import { scenariosFor } from '@/scenarios/store'
import { goToPage } from './navigation'
import { SectionTitle } from './parts'

/*
 * Scenarios (#/scenarios, from the menu): every saved scenario, grouped by
 * calculator, with Open, Rename, Duplicate and Delete; Export all and
 * Import. Opening one goes to its calculator page with it loaded.
 */
export function ScenariosPage() {
  const state = useStore(scenarioStore)
  const fileRef = useRef<HTMLInputElement>(null)
  const importRef = useRef<HTMLButtonElement>(null)
  const groups = CALCULATORS.list()
    .map((calculator) => ({ calculator, scenarios: scenariosFor(state, calculator.id) }))
    .filter((g) => g.scenarios.length > 0)

  return (
    <div className="flex flex-col gap-5 pb-4 text-sm text-text">
      <p>
        A scenario keeps a calculator’s inputs under a name, in this browser. Results are always worked out again. Export to keep a copy in
        a file or move scenarios to another device.
      </p>
      <StorageNotice />
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={state.scenarios.length === 0} onClick={() => exportScenarios()}>
          <Download />
          Export all
        </Button>
        <Button ref={importRef} variant="secondary" onClick={() => fileRef.current?.click()}>
          <Upload />
          Import from a file
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          tabIndex={-1}
          aria-hidden="true"
          className="sr-only"
          onChange={(e) => {
            const file = e.currentTarget.files?.[0]
            e.currentTarget.value = ''
            if (file) void startImport(file, 'scenarios', importRef.current)
          }}
        />
      </div>
      {groups.length === 0 ? (
        <EmptyState title="No saved scenarios yet">Open a calculator from the home page and choose Save, or import a file.</EmptyState>
      ) : (
        groups.map(({ calculator, scenarios }) => (
          <section key={calculator.id} aria-labelledby={`scenarios-${calculator.id}`} className="flex flex-col gap-1">
            <SectionTitle id={`scenarios-${calculator.id}`}>
              {calculator.name} ({scenarios.length})
            </SectionTitle>
            <div className="px-3">
              <ScenarioList
                scenarios={scenarios}
                loadLabel="Open"
                onLoad={(scenario) => {
                  sessionFor(calculator).load(scenario)
                  goToPage(formatPage({ kind: 'calculator', id: calculator.id }))
                }}
              />
            </div>
          </section>
        ))
      )}
    </div>
  )
}
