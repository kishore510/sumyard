/*
 * Saving a file the app made (an export or backup) to the person's device: a
 * Blob behind a temporary object URL and a click on a download link. Nothing
 * leaves the device; the object URL is local to this page and revoked after.
 */
export function downloadText(fileName: string, text: string, type = 'application/json'): boolean {
  try {
    const url = URL.createObjectURL(new Blob([text], { type }))
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    link.rel = 'noopener'
    document.body.append(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 0)
    return true
  } catch {
    return false
  }
}

/** Reads a chosen file as text, refusing anything over `maxChars` (bytes, as a first check) before reading it. */
export async function readFileText(file: File, maxChars: number): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  if (file.size > maxChars) return { ok: false, error: 'This file is too large to import (the limit is about 2 MB).' }
  try {
    return { ok: true, text: await file.text() }
  } catch {
    return { ok: false, error: 'This file couldn’t be read.' }
  }
}
