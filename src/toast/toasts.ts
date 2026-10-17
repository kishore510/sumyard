import { readToken } from '@/lib/cssVar'
import { createToastStore } from './toastStore'

/** The app's one toast store. Duration comes from --sy-toast-duration. */
export const toasts = createToastStore({ duration: () => readToken('--sy-toast-duration', 5000) })
