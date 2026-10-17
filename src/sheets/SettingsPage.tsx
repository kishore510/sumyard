import { Download, RotateCcw, Trash2, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { Choice } from '@/components/Choice'
import { SheetLink } from '@/components/SheetLink'
import { Button } from '@/components/ui/button'
import { listTaxYears, taxYearLabel } from '@/config/tax/index'
import type { TaxYearId } from '@/config/tax/schema'
import { yearStatus } from '@/config/tax/sourced'
import { themeStore, useTheme } from '@/hooks/useTheme'
import { useStore } from '@/lib/store'
import type { ThemePreference } from '@/lib/theme'
import { clearEverything, exportBackup, startImport } from '@/scenarios/actions'
import { type AmountStyle, type Region, resetToDefaults, settingsStore } from '@/settings/settings'
import { toasts } from '@/toast/toasts'
import { SectionTitle } from './parts'

/*
 * Settings (generalised from Chalkline's SettingsSheet: the diagram and AI
 * sections are dropped): theme, calculator defaults, backup and restore,
 * reset, and clear all data.
 */

const THEMES: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
]

const REGION_OPTIONS: { value: Region; label: string }[] = [
  { value: 'ruk', label: 'England, Wales or Northern Ireland' },
  { value: 'scotland', label: 'Scotland' },
]

const AMOUNT_OPTIONS: { value: AmountStyle; label: string }[] = [
  { value: 'pounds', label: 'Whole pounds' },
  { value: 'pence', label: 'Pounds and pence' },
]

/** The registry's years, each labelled "not yet verified" while any of its values is. */
const TAX_YEAR_OPTIONS: { value: TaxYearId; label: string; verified: boolean }[] = listTaxYears().map((year) => {
  const verified = yearStatus(year).complete
  return { value: year.id, label: `${taxYearLabel(year.id)}${verified ? '' : ' (not yet verified)'}`, verified }
})

const notSaved = () =>
  toasts.show({ message: 'Couldn’t save in this browser (storage is blocked or full). This change lasts until you close Sumyard.' })

function BackupSection() {
  const fileRef = useRef<HTMLInputElement>(null)
  const restoreRef = useRef<HTMLButtonElement>(null)
  return (
    <section aria-labelledby="settings-backup" className="flex flex-col gap-3">
      <SectionTitle id="settings-backup">Backup and restore</SectionTitle>
      <div className="flex flex-col gap-2 px-3">
        <p className="text-xs text-text-muted">
          A backup is one file with your scenarios, settings, theme and whether you have read the “not advice” notice. Keep it somewhere
          safe, or use it to move to another device.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={exportBackup}>
            <Download />
            Export a backup
          </Button>
          <Button ref={restoreRef} variant="secondary" onClick={() => fileRef.current?.click()}>
            <Upload />
            Restore from a backup
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
              if (file) void startImport(file, 'backup', restoreRef.current)
            }}
          />
        </div>
        <p className="text-xs text-text-muted">
          Restoring shows what the backup holds first, and replaces your data only when you confirm.
        </p>
      </div>
    </section>
  )
}

function ClearSection() {
  const [confirming, setConfirming] = useState(false)
  return (
    <section aria-labelledby="settings-clear" className="flex flex-col gap-3">
      <SectionTitle id="settings-clear">Clear all data</SectionTitle>
      <div className="flex flex-col gap-2 px-3">
        {!confirming ? (
          <>
            <Button variant="secondary" className="self-start" onClick={() => setConfirming(true)}>
              <Trash2 />
              Clear all data…
            </Button>
            <p className="text-xs text-text-muted">Removes everything Sumyard keeps in this browser. You’ll be asked to confirm.</p>
          </>
        ) : (
          <fieldset className="flex flex-col gap-3 rounded-md border border-border-strong p-3">
            <legend className="px-1 text-sm font-semibold text-text">
              Remove all your scenarios, settings, theme and notice from this browser?
            </legend>
            <p className="text-sm text-text">
              This <strong>can’t be undone</strong>. Export a backup first if you might want any of it.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={exportBackup}>
                <Download />
                Export a backup first
              </Button>
              <Button
                variant="danger"
                onClick={() => {
                  clearEverything()
                  setConfirming(false)
                }}
              >
                <Trash2 />
                Clear all data
              </Button>
              <Button variant="ghost" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
            </div>
          </fieldset>
        )}
      </div>
    </section>
  )
}

export function SettingsPage() {
  const { preference, set } = useTheme()
  const settings = useStore(settingsStore)
  const update = (patch: Parameters<typeof settingsStore.update>[0]) => {
    if (!settingsStore.update(patch)) notSaved()
  }

  const reset = () => {
    const undo = resetToDefaults(settingsStore, themeStore)
    if (!undo) return toasts.show({ message: 'Settings are already at their defaults.' })
    toasts.show({ message: 'Settings reset to defaults.', undo: { run: undo, done: 'Settings restored.' } })
  }

  return (
    <div className="flex flex-col gap-6 pb-4">
      <section aria-labelledby="settings-appearance" className="flex flex-col gap-3">
        <SectionTitle id="settings-appearance">Appearance</SectionTitle>
        <div className="px-3">
          <Choice
            id="settings-theme"
            label="Theme"
            value={preference}
            options={THEMES}
            onChange={set}
            hint="System follows your device. Same as the button in the top bar."
          />
        </div>
      </section>

      <section aria-labelledby="settings-defaults" className="flex flex-col gap-3">
        <SectionTitle id="settings-defaults">Defaults for calculators</SectionTitle>
        <div className="flex flex-col gap-4 px-3">
          <Choice
            id="settings-region"
            label="Region"
            value={settings.region}
            options={REGION_OPTIONS}
            onChange={(region) => update({ region })}
            stacked
            hint="Which part of the UK calculators start with. No calculator uses it yet."
          />
          <Choice
            id="settings-amounts"
            label="Amounts"
            value={settings.amounts}
            options={AMOUNT_OPTIONS}
            onChange={(amounts) => update({ amounts })}
            hint="How results will be shown. No calculator uses it yet."
          />
          <div className="flex flex-col gap-1">
            <Choice
              id="settings-tax-year"
              label="Tax year"
              value={settings.taxYear}
              options={TAX_YEAR_OPTIONS}
              onChange={(taxYear) => update({ taxYear })}
              stacked
              hint={
                TAX_YEAR_OPTIONS.find((o) => o.value === settings.taxYear)?.verified
                  ? 'Which tax year calculators start with.'
                  : 'Which tax year calculators start with. Its figures are not yet verified, so calculators will show no results for it.'
              }
            />
            <SheetLink route={{ kind: 'tax-data' }} className="inline-flex min-h-touch items-center self-start text-sm">
              See tax data
            </SheetLink>
          </div>
        </div>
      </section>

      <section aria-labelledby="settings-reset" className="flex flex-col gap-3">
        <SectionTitle id="settings-reset">Reset</SectionTitle>
        <div className="flex flex-col gap-2 px-3">
          <Button variant="secondary" className="self-start" onClick={reset}>
            <RotateCcw />
            Reset settings to defaults
          </Button>
          <p className="text-xs text-text-muted">
            Theme back to System; region, amounts and tax year back to their defaults. You can undo it.
          </p>
        </div>
      </section>

      <BackupSection />

      <ClearSection />

      <p className="px-3 text-xs text-text-muted">Settings are saved in this browser only. Export a backup to keep a copy.</p>
    </div>
  )
}
