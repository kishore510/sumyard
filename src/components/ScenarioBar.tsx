import { ChevronDown, Columns3, Download, FilePlus2, Save, Upload } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import type { CalculatorDefinition } from '@/calculators/registry'
import { type CalculatorSession, hasUnsavedChanges, scenarioTaxYear } from '@/calculators/session'
import { useStore } from '@/lib/store'
import { formatPage } from '@/pages/route'
import { exportScenarios, quote, reportSaved, startImport } from '@/scenarios/actions'
import { scenarioStore } from '@/scenarios/index'
import { SCENARIO_LIMITS } from '@/scenarios/scenario'
import { scenariosFor } from '@/scenarios/store'
import { goToPage } from '@/sheets/navigation'
import { toasts } from '@/toast/toasts'
import { ScenarioList } from './ScenarioList'
import { StorageNotice } from './StorageNotice'
import { Button } from './ui/button'

/*
 * The scenario controls on a calculator page: which scenario is open and
 * whether it has unsaved changes; Save (or Save changes), Save as new; and a
 * "Saved scenarios" disclosure with Load, Rename, Duplicate and Delete per
 * scenario, plus Export, Import and Compare. Scenarios keep inputs only.
 */

function NameForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: string
  submitLabel: string
  onSubmit: (name: string) => string | null
  onCancel: () => void
}) {
  const id = useId()
  const [name, setName] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        setError(onSubmit(name))
      }}
    >
      <label htmlFor={id} className="text-sm font-medium text-text">
        Scenario name
      </label>
      <input
        id={id}
        // biome-ignore lint/a11y/noAutofocus: the name box opens from the Save button, so focus moves into it.
        autoFocus
        value={name}
        maxLength={SCENARIO_LIMITS.nameLength}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(e) => setName(e.currentTarget.value)}
        onFocus={(e) => e.currentTarget.select()}
        className="min-h-touch w-full rounded-md border border-border-strong bg-surface px-3 text-sm text-text outline-none focus:border-focus"
      />
      {error && (
        <p id={`${id}-error`} className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary">
          <Save />
          {submitLabel}
        </Button>
        <Button onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  )
}

export function ScenarioBar<I>({ calculator, session }: { calculator: CalculatorDefinition<I>; session: CalculatorSession<I> }) {
  const state = useStore(session)
  const all = useStore(scenarioStore, (s) => s.scenarios)
  const mine = scenariosFor({ scenarios: all }, calculator.id)
  const loaded = mine.find((s) => s.id === state.loadedId)
  const taxYear = scenarioTaxYear(calculator, state)
  const unsaved = hasUnsavedChanges({ taxYear, inputs: state.inputs }, loaded)
  const invalid = state.invalid.length > 0
  const [naming, setNaming] = useState<'new' | 'copy' | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const importRef = useRef<HTMLButtonElement>(null)
  const listId = useId()

  const create = (name: string): string | null => {
    const result = scenarioStore.create({ calculatorId: calculator.id, taxYear, name, inputs: state.inputs })
    if (!result.ok) return result.error
    session.linkSaved(result.scenario.id, result.scenario.taxYear)
    setNaming(null)
    reportSaved(result.saved, `Saved ${quote(result.scenario.name)}.`)
    return null
  }

  const saveChanges = () => {
    if (!loaded) return setNaming('new')
    const result = scenarioStore.update(loaded.id, { taxYear, inputs: state.inputs })
    if (!result.ok) return toasts.show({ message: result.error })
    session.linkSaved(loaded.id, taxYear)
    reportSaved(result.saved, `Saved changes to ${quote(loaded.name)}.`)
  }

  const status = loaded ? (unsaved ? 'Unsaved changes' : 'Saved') : 'Not saved yet'

  return (
    <section aria-labelledby={`${listId}-title`} className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id={`${listId}-title`} className="min-w-0 text-sm font-semibold break-words text-text">
          {loaded ? <>Scenario: {loaded.name}</> : 'New scenario'}
        </h2>
        <span
          data-unsaved={loaded ? unsaved : undefined}
          className={
            loaded && unsaved ? 'rounded-full border border-border-strong px-2 text-xs font-semibold text-text' : 'text-xs text-text-muted'
          }
        >
          {status}
        </span>
      </div>

      {naming ? (
        <NameForm
          initial={
            naming === 'copy' && loaded
              ? `${loaded.name} (copy)`.slice(0, SCENARIO_LIMITS.nameLength)
              : `${calculator.name} ${mine.length + 1}`
          }
          submitLabel={naming === 'copy' ? 'Save as new' : 'Save'}
          onSubmit={create}
          onCancel={() => setNaming(null)}
        />
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" disabled={invalid || (loaded && !unsaved)} onClick={loaded ? saveChanges : () => setNaming('new')}>
              <Save />
              {loaded ? 'Save changes' : 'Save'}
            </Button>
            {loaded && (
              <Button disabled={invalid} onClick={() => setNaming('copy')}>
                <FilePlus2 />
                Save as new
              </Button>
            )}
            {loaded && (
              <Button variant="ghost" onClick={() => session.startNew()}>
                Start new
              </Button>
            )}
          </div>
          {invalid && <p className="text-xs text-text-muted">Fix the highlighted inputs to save.</p>}
        </div>
      )}

      {state.taxYearWarning && <p className="text-sm text-text">{state.taxYearWarning}</p>}
      <StorageNotice />

      <details className="group rounded-md border border-border">
        <summary className="flex min-h-touch cursor-pointer list-none items-center gap-2 px-3 text-sm font-medium text-text [&::-webkit-details-marker]:hidden">
          <span className="flex-1">Saved scenarios ({mine.length})</span>
          <ChevronDown aria-hidden="true" className="size-4 text-text-muted transition-transform group-open:rotate-180" />
        </summary>
        <div className="flex flex-col gap-3 border-t border-border px-3 pb-3">
          {mine.length === 0 ? (
            <p className="pt-3 text-sm text-text-muted">None yet. Save these inputs to keep them, or import a file.</p>
          ) : (
            <ScenarioList
              scenarios={mine}
              currentId={state.loadedId}
              onLoad={(scenario) => {
                session.load(scenario)
                toasts.show({ message: `Loaded ${quote(scenario.name)}.` })
              }}
            />
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" disabled={mine.length === 0} onClick={() => exportScenarios(calculator.id)}>
              <Download />
              Export
            </Button>
            <Button ref={importRef} variant="secondary" onClick={() => fileRef.current?.click()}>
              <Upload />
              Import
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
            <Button
              variant="secondary"
              disabled={mine.length < 2}
              onClick={() => goToPage(formatPage({ kind: 'compare', id: calculator.id }))}
            >
              <Columns3 />
              Compare
            </Button>
          </div>
          {mine.length < 2 && <p className="text-xs text-text-muted">Compare needs at least two saved scenarios.</p>}
        </div>
      </details>
    </section>
  )
}
