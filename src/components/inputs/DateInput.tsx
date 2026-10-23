import { formatIsoDate } from '@/lib/format'
import type { IsoDate } from '@/lib/isoDate'
import { type Parsed, parseDateText } from '@/lib/parse'
import { type Emptyable, TextValueInput, type TextValueProps } from './TextValueInput'

/**
 * A date, held as its ISO string (M2, the mortgage page). Typed as
 * day/month/year or year-month-day; shown, once valid and the box is left,
 * as day/month/year, with the date in words under the box. A text box, not
 * a native date picker, so it reads the same in every browser and fits the
 * other inputs. With `allowEmpty`, an empty box is null (not entered).
 */
export function DateInput(props: Emptyable<IsoDate>) {
  const parse = (text: string): Parsed<IsoDate | null> => parseDateText(text)
  const format = (value: IsoDate | null) => {
    if (value === null) return ''
    const [year, month, day] = value.split('-')
    return `${day}/${month}/${year}`
  }
  return (
    <TextValueInput<IsoDate | null>
      {...(props as TextValueProps<IsoDate | null> & { allowEmpty?: boolean })}
      inputMode="text"
      placeholder={props.placeholder ?? 'dd/mm/yyyy'}
      parse={parse}
      format={format}
    />
  )
}

/** The date in words, for beside a DateInput: "15 January 2026", or nothing while it is empty. */
export const dateInWords = (value: IsoDate | null) => (value === null ? '' : formatIsoDate(value))
