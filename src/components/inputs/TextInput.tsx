import type { Parsed } from '@/lib/parse'
import { cleanText } from '@/lib/validate'
import { TextValueInput, type TextValueProps } from './TextValueInput'

/**
 * A short piece of plain text, such as an item's name. What is kept is the
 * tidy form (cleanText: control and direction characters removed, spaces
 * collapsed, trimmed); more than `maxLength` characters is refused with a
 * message rather than cut. Shown only as text, never as markup.
 */
export function TextInput({ maxLength, ...props }: TextValueProps<string> & { maxLength: number }) {
  const parse = (text: string): Parsed<string> =>
    Array.from(text.trim()).length > maxLength
      ? { ok: false, error: `Use at most ${maxLength} characters.` }
      : { ok: true, value: cleanText(text, maxLength) }
  return <TextValueInput<string> {...props} inputMode="text" parse={parse} format={(v) => v} />
}
