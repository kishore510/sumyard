import { Copy, FolderOpen, Pencil, Trash2 } from 'lucide-react'
import { useId, useState } from 'react'
import { getTaxYear, taxYearLabel } from '@/config/tax/index'
import { deleteScenario, duplicateScenario, quote, reportSaved } from '@/scenarios/actions'
import { scenarioStore } from '@/scenarios/index'
import type { Scenario } from '@/scenarios/scenario'
import { SCENARIO_LIMITS } from '@/scenarios/scenario'
import { Button } from './ui/button'

/*
 * A list of saved scenarios with Load (or Open), Rename, Duplicate and
 * Delete (with Undo). Shared by the ScenarioBar on a calculator page and the
 * Scenarios sheet. Names are untrusted (imported files) and only ever
 * rendered as text.
 */

const SAVED = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

function RenameForm({ scenario, onDone }: { scenario: Scenario; onDone: () => void }) {
  const id = useId()
  const [name, setName] = useState(scenario.name)
  const [error, setError] = useState<string | null>(null)
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        const result = scenarioStore.rename(scenario.id, name)
        if (!result.ok) return setError(result.error)
        reportSaved(result.saved, `Renamed to ${quote(result.scenario.name)}.`)
        onDone()
      }}
    >
      <label htmlFor={id} className="text-sm font-medium text-text">
        New name for {quote(scenario.name)}
      </label>
      <input
        id={id}
        // biome-ignore lint/a11y/noAutofocus: the rename box replaces the button that opened it, so focus moves into it.
        autoFocus
        value={name}
        maxLength={SCENARIO_LIMITS.nameLength}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(e) => setName(e.currentTarget.value)}
        className="min-h-touch w-full rounded-md border border-border-strong bg-surface px-3 text-sm text-text outline-none focus:border-focus"
      />
      {error && (
        <p id={`${id}-error`} className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" variant="primary">
          Rename
        </Button>
        <Button onClick={onDone}>Cancel</Button>
      </div>
    </form>
  )
}

export function ScenarioList({
  scenarios,
  currentId,
  onLoad,
  loadLabel = 'Load',
}: {
  scenarios: readonly Scenario[]
  /** The scenario open on the page, marked as such. */
  currentId?: string | null
  onLoad: (scenario: Scenario) => void
  loadLabel?: 'Load' | 'Open'
}) {
  const [renaming, setRenaming] = useState<string | null>(null)
  return (
    <ul className="flex flex-col divide-y divide-border">
      {scenarios.map((scenario) => {
        const current = scenario.id === currentId
        const updated = new Date(scenario.updatedAt)
        return (
          <li key={scenario.id} data-scenario={scenario.id} className="flex flex-col gap-2 py-3">
            {renaming === scenario.id ? (
              <RenameForm scenario={scenario} onDone={() => setRenaming(null)} />
            ) : (
              <>
                <div className="flex min-w-0 flex-col">
                  <span className="font-medium break-words text-text">
                    {scenario.name}
                    {current && <span className="ml-2 rounded-full bg-accent-subtle px-2 text-xs font-semibold text-text">Open now</span>}
                  </span>
                  <span className="text-xs text-text-muted">
                    {taxYearLabel(scenario.taxYear)} tax year{getTaxYear(scenario.taxYear) ? '' : ' (not in this version)'} · Saved{' '}
                    {Number.isNaN(updated.getTime()) ? 'at an unknown time' : SAVED.format(updated)}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  <Button variant="secondary" onClick={() => onLoad(scenario)} aria-label={`${loadLabel} ${quote(scenario.name)}`}>
                    <FolderOpen />
                    {loadLabel}
                  </Button>
                  <Button variant="ghost" onClick={() => setRenaming(scenario.id)} aria-label={`Rename ${quote(scenario.name)}`}>
                    <Pencil />
                    Rename
                  </Button>
                  <Button variant="ghost" onClick={() => duplicateScenario(scenario.id)} aria-label={`Duplicate ${quote(scenario.name)}`}>
                    <Copy />
                    Duplicate
                  </Button>
                  <Button variant="ghost" onClick={() => deleteScenario(scenario.id)} aria-label={`Delete ${quote(scenario.name)}`}>
                    <Trash2 />
                    Delete
                  </Button>
                </div>
              </>
            )}
          </li>
        )
      })}
    </ul>
  )
}
