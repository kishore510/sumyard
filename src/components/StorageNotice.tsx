import { Download } from 'lucide-react'
import { useStore } from '@/lib/store'
import { exportScenarios } from '@/scenarios/actions'
import { scenarioStore } from '@/scenarios/index'
import { InlineNotice } from './states'
import { Button } from './ui/button'

/*
 * Says when scenarios can't be saved in this browser (storage blocked or
 * full, or a stored record this version won't write over), suggesting an
 * export, and when some stored scenarios are kept but not shown. Nothing
 * when all is well.
 */
export function StorageNotice() {
  const { persist, problem, preserved, scenarios } = useStore(scenarioStore)
  const exportButton =
    scenarios.length > 0 ? (
      <Button variant="secondary" onClick={() => exportScenarios()}>
        <Download />
        Export scenarios
      </Button>
    ) : undefined
  return (
    <>
      {persist === 'failed' && (
        <InlineNotice tone="error" title="Scenarios aren’t being saved in this browser" action={exportButton}>
          <p>Storage is blocked or full. Your scenarios are kept until you close Sumyard: export them to keep a copy.</p>
        </InlineNotice>
      )}
      {persist === 'blocked' && (
        <InlineNotice tone="warning" title="Saved scenarios can’t be read" action={exportButton}>
          <p>
            {problem === 'newer'
              ? 'They were saved by a newer version of Sumyard, so this version won’t save over them.'
              : 'The saved scenarios in this browser are damaged, so Sumyard won’t save over them.'}{' '}
            Changes you make now last until you close Sumyard: export to keep a copy. Restoring a backup or clearing all data in Settings
            replaces them.
          </p>
        </InlineNotice>
      )}
      {preserved > 0 && (
        <InlineNotice tone="info">
          <p>
            {preserved === 1 ? 'One saved scenario is' : `${preserved} saved scenarios are`} for a calculator or version this version of
            Sumyard doesn’t have. {preserved === 1 ? 'It is' : 'They are'} kept, but not shown or exported.
          </p>
        </InlineNotice>
      )}
    </>
  )
}
