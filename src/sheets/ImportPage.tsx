import { Download, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { CALCULATORS } from '@/calculators/index'
import { Segmented } from '@/components/inputs/Segmented'
import { NO_TAX_RULES } from '@/components/NoTaxRulesBadge'
import { EmptyState, InlineNotice } from '@/components/states'
import { Button } from '@/components/ui/button'
import { getTaxYear, taxYearLabel } from '@/config/tax/index'
import { formatIsoDate } from '@/lib/format'
import type { IsoDate } from '@/lib/isoDate'
import { useStore } from '@/lib/store'
import {
  cancelImport,
  confirmImport,
  confirmRestore,
  exportBackup,
  exportScenarios,
  importPlan,
  pendingImport,
  quote,
  startImport,
} from '@/scenarios/actions'
import type { Backup } from '@/scenarios/backup'
import type { FileDetails, ImportMode, ScenarioFile, Skipped } from '@/scenarios/exchange'
import { scenarioStore } from '@/scenarios/index'
import type { Scenario } from '@/scenarios/scenario'
import { SectionTitle } from './parts'

/*
 * The preview before anything is written: #/import for a scenarios file,
 * #/restore for a backup. It shows what the file holds (names as plain text:
 * the file is untrusted), what will be skipped and why, and conflicts; then
 * Add or Replace (import) or Replace my data (restore), with an export of
 * the current data offered first. Cancel writes nothing.
 */

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

function Details({ fileName, details }: { fileName: string; details: FileDetails }) {
  return (
    <p className="text-text-muted">
      <span className="font-medium break-all text-text">{fileName}</span>
      {details.appVersion && <> · made by Sumyard {details.appVersion}</>}
      {details.exportedAt && <> on {formatIsoDate(details.exportedAt.slice(0, 10) as IsoDate)}</>}
    </p>
  )
}

function ScenarioNames({ scenarios }: { scenarios: readonly Scenario[] }) {
  return (
    <ul className="flex flex-col gap-1">
      {scenarios.map((s) => (
        <li key={s.id} className="flex flex-col">
          <span className="font-medium break-words">{s.name}</span>
          <span className="text-xs text-text-muted">
            {CALCULATORS.get(s.calculatorId)?.name} ·{' '}
            {s.taxYear === undefined
              ? NO_TAX_RULES
              : `${taxYearLabel(s.taxYear)} tax year${getTaxYear(s.taxYear) ? '' : ' (not in this version: it will open with a warning)'}`}
          </span>
        </li>
      ))}
    </ul>
  )
}

function SkippedList({ skipped, duplicatesInFile }: { skipped: readonly Skipped[]; duplicatesInFile: number }) {
  if (skipped.length === 0 && duplicatesInFile === 0) return null
  return (
    <InlineNotice tone="warning" title={`${plural(skipped.length + duplicatesInFile, 'scenario')} in the file won’t be used`}>
      <ul className="flex list-disc flex-col gap-1 pl-5">
        {skipped.map((s, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: the file's order; names may repeat or be missing.
          <li key={i} className="break-words">
            {s.name ? quote(s.name) : 'A scenario with no usable name'} {s.message}.
          </li>
        ))}
        {duplicatesInFile > 0 && <li>{plural(duplicatesInFile, 'exact duplicate')} inside the file.</li>}
      </ul>
    </InlineNotice>
  )
}

function ImportPreview({ fileName, file }: { fileName: string; file: ScenarioFile }) {
  const [mode, setMode] = useState<ImportMode>('add')
  const existing = useStore(scenarioStore, (s) => s.scenarios)
  const plan = importPlan(file, mode)
  return (
    <div className="flex flex-col gap-4">
      <Details fileName={fileName} details={file} />
      <section aria-labelledby="import-found" className="flex flex-col gap-2">
        <SectionTitle id="import-found">{plural(file.scenarios.length, 'scenario')} ready to import</SectionTitle>
        <div className="px-3">
          {file.scenarios.length === 0 ? (
            <p className="text-text-muted">None of the scenarios in this file can be used.</p>
          ) : (
            <ScenarioNames scenarios={file.scenarios} />
          )}
        </div>
      </section>
      <SkippedList skipped={file.skipped} duplicatesInFile={file.duplicatesInFile} />

      {file.scenarios.length > 0 && (
        <>
          <Segmented
            id="import-mode"
            label="How to import"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'add', label: 'Add' },
              { value: 'replace', label: 'Replace' },
            ]}
            hint={
              mode === 'add'
                ? `Adds them to the ${plural(existing.length, 'scenario')} saved here, each as a new scenario.`
                : `Removes the ${plural(existing.length, 'scenario')} saved here and keeps only the ones from the file.`
            }
          />
          {!plan.ok ? (
            <InlineNotice tone="error">
              <p>{plan.error}</p>
            </InlineNotice>
          ) : mode === 'add' ? (
            <div className="flex flex-col gap-2">
              <p>
                Adds {plural(plan.added.length, 'scenario')}.
                {plan.duplicates.length > 0 && ` Skips ${plural(plan.duplicates.length, 'exact duplicate')} of scenarios already here.`}
              </p>
              {plan.conflicts.length > 0 && (
                <InlineNotice tone="info" title="Similar to scenarios already here">
                  <ul className="flex list-disc flex-col gap-1 pl-5">
                    {plan.conflicts.map((c, i) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: the file's order.
                      <li key={i} className="break-words">
                        {quote(c.name)}{' '}
                        {c.reason === 'same-name'
                          ? 'has the same name as one already here. Both will be kept.'
                          : `has the same id as ${quote(c.existingName)}. It is added as a new scenario; nothing is overwritten.`}
                      </li>
                    ))}
                  </ul>
                </InlineNotice>
              )}
            </div>
          ) : (
            <InlineNotice
              tone="warning"
              title={`Replace removes ${plural(plan.removed, 'scenario')} from this browser`}
              action={
                existing.length > 0 ? (
                  <Button variant="secondary" onClick={() => exportScenarios()}>
                    <Download />
                    Export current scenarios first
                  </Button>
                ) : undefined
              }
            >
              <p>Delete can be undone; this can’t. Export what is here first if you might want it.</p>
            </InlineNotice>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              variant={mode === 'replace' ? 'danger' : 'primary'}
              disabled={!plan.ok || plan.added.length === 0}
              onClick={() => confirmImport(file, mode)}
            >
              {mode === 'replace'
                ? `Replace with ${plural(plan.ok ? plan.added.length : 0, 'scenario')}`
                : `Import ${plural(plan.ok ? plan.added.length : 0, 'scenario')}`}
            </Button>
            <Button onClick={cancelImport}>Cancel</Button>
          </div>
        </>
      )}
      {file.scenarios.length === 0 && (
        <Button onClick={cancelImport} className="self-start">
          Close
        </Button>
      )}
    </div>
  )
}

const REGION = { ruk: 'England, Wales or Northern Ireland', scotland: 'Scotland' } as const
const AMOUNTS = { pounds: 'Whole pounds', pence: 'Pounds and pence' } as const
const THEME = { system: 'System', light: 'Light', dark: 'Dark' } as const

function RestorePreview({ fileName, backup }: { fileName: string; backup: Backup }) {
  const current = useStore(scenarioStore)
  return (
    <div className="flex flex-col gap-4">
      <Details fileName={fileName} details={backup} />
      <section aria-labelledby="restore-holds" className="flex flex-col gap-2">
        <SectionTitle id="restore-holds">This backup holds</SectionTitle>
        <dl className="flex flex-col gap-2 px-3">
          {(
            [
              ['Scenarios', plural(backup.scenarios.length, 'scenario')],
              ['Region', REGION[backup.settings.region]],
              ['Amounts', AMOUNTS[backup.settings.amounts]],
              ['Tax year', taxYearLabel(backup.settings.taxYear)],
              ['Theme', THEME[backup.theme]],
              ['“Not advice” notice', backup.acknowledged ? 'Read' : 'Not read yet (it will show again)'],
            ] as const
          ).map(([term, value]) => (
            <div key={term} className="flex gap-4">
              <dt className="w-36 shrink-0 text-text-muted">{term}</dt>
              <dd className="min-w-0 break-words">{value}</dd>
            </div>
          ))}
        </dl>
      </section>
      {backup.scenarios.length > 0 && (
        <details className="rounded-md border border-border">
          <summary className="flex min-h-touch cursor-pointer items-center px-3 font-medium">Scenario names</summary>
          <div className="border-t border-border px-3 py-2">
            <ScenarioNames scenarios={backup.scenarios} />
          </div>
        </details>
      )}
      <SkippedList skipped={backup.skipped} duplicatesInFile={backup.duplicatesInFile} />
      {backup.notes.map((note) => (
        <InlineNotice key={note} tone="info">
          <p>{note}</p>
        </InlineNotice>
      ))}
      <InlineNotice
        tone="warning"
        title="Restoring replaces what is in this browser"
        action={
          <Button variant="secondary" onClick={exportBackup}>
            <Download />
            Export current data first
          </Button>
        }
      >
        <p>
          Your {plural(current.scenarios.length, 'scenario')}
          {current.preserved > 0 && ` (and ${plural(current.preserved, 'scenario')} this version can’t show)`}, settings and theme are
          replaced by the backup’s. This can’t be undone, so export first if you might want them.
        </p>
      </InlineNotice>
      <div className="flex flex-wrap gap-2">
        <Button variant="danger" onClick={() => confirmRestore(backup)}>
          Replace my data with this backup
        </Button>
        <Button onClick={cancelImport}>Cancel</Button>
      </div>
    </div>
  )
}

export function ImportPage({ kind }: { kind: 'scenarios' | 'backup' }) {
  const pending = useStore(pendingImport)
  const fileRef = useRef<HTMLInputElement>(null)
  const chooseRef = useRef<HTMLButtonElement>(null)
  const choose = (
    <>
      <Button ref={chooseRef} variant="secondary" onClick={() => fileRef.current?.click()}>
        <Upload />
        Choose a file
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
          if (file) void startImport(file, kind, chooseRef.current)
        }}
      />
    </>
  )

  const forThisPage = pending && (pending.kind === 'error' ? pending.for === kind : (pending.kind === 'backup') === (kind === 'backup'))
  return (
    <div className="flex flex-col gap-4 pb-4 text-sm text-text">
      <p>
        {kind === 'backup'
          ? 'Check what the backup holds before anything changes. Nothing is replaced until you confirm.'
          : 'Check what the file holds before anything is saved. Nothing changes until you confirm.'}
      </p>
      {!pending || !forThisPage ? (
        <EmptyState title="No file chosen" action={choose}>
          {kind === 'backup' ? 'Choose a Sumyard backup file (.json).' : 'Choose a Sumyard scenarios file (.json).'}
        </EmptyState>
      ) : pending.kind === 'error' ? (
        <InlineNotice tone="error" title="This file can’t be used" action={choose}>
          <p className="break-all text-text-muted">{pending.fileName}</p>
          <p>{pending.error}</p>
        </InlineNotice>
      ) : pending.kind === 'scenarios' ? (
        <ImportPreview fileName={pending.fileName} file={pending.file} />
      ) : (
        <RestorePreview fileName={pending.fileName} backup={pending.backup} />
      )}
    </div>
  )
}
